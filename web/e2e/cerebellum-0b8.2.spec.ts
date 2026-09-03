import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

// cerebellum-0b8.2 [Frontend] 「今日決めたもの」をサーバ由来にする
// （docs/specs/29-web-inbox-history.md §3.1・§5・§6）
//
// 受け入れ基準:
//   ① `read` を押した後にリロードしても行が下段に残り `bodyMd` が展開できる
//   ② タブ復帰（再検証）でも消えない
//   ③ 取り消しで未決グループへ戻る
//   ④ 適用済みの行が凍結表示になる
//
// ①〜④は**実 API（release バイナリ＋使い捨ての空 DB・playwright.config.ts）**に対して回す。
// 「サーバ由来かキャッシュ残骸か」が争点（29 §1）なので、`?date=` をモックで固定すると
// 何も検証できない——リロード・タブ復帰でサーバへ問い直した結果が残ることを見る必要がある。
// そのため hn6.1 と同じ並列前提を踏襲する:
//   (a) `source` と `title` はテストごとに一意にする（fullyParallel で他テストの投入が同じ
//       画面に並ぶ。`?date={今日}` にも他テストの決着行が入る）
//   (b) 件数は数えない。存在・所属は自分が投入した行を title で掴んで見る
// 画面全体の並び・二重表示（§3.1-2）と `?date=` の障害（§6）だけは実データで条件を作れないので、
// hn6.1 の `stubList` と同じ流儀で GET を固定応答にする。

type Kind = 'approve' | 'choose' | 'read' | 'alert';

type SeedItem = {
  slug: string;
  kind: Kind;
  title: string;
  bodyMd?: string;
  options?: { id: string; label: string }[];
  refPath?: string;
};

type StoredItem = {
  id: number;
  source: string;
  date: string;
  slug: string;
  kind: Kind;
  title: string;
  bodyMd: string | null;
  options: { id: string; label: string }[] | null;
  refPath: string | null;
  payload: unknown;
  expiresAt: string | null;
  status: string;
  choice: string | null;
  decidedAt: string | null;
  applyState: string;
  appliedAt: string | null;
  error: string | null;
  resultPath: string | null;
  resultUrl: string | null;
  receivedAt: string;
};

/** ローカルタイムの `YYYY-MM-DD`（画面の `localToday()` と同じ境界・docs/specs/00 §4） */
function localToday(now = new Date()) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
}

/** 1送信元・1業務日ぶんを投入する（`date: 'today'` はサーバが今日の業務日へ解決する）。 */
async function seed(
  request: APIRequestContext,
  source: string,
  items: SeedItem[],
): Promise<void> {
  const res = await request.post('/api/inbox/batches', { data: { source, date: 'today', items } });
  expect(res.status(), await res.text()).toBe(200);
}

async function itemsOf(request: APIRequestContext, url: string): Promise<StoredItem[]> {
  const res = await request.get(url);
  expect(res.status(), await res.text()).toBe(200);
  const body = (await res.json()) as { items: StoredItem[] };
  return body.items;
}

/** 未決一覧のうち、その送信元のぶん（他テストの投入を除く）。 */
async function openOf(request: APIRequestContext, source: string) {
  const items = await itemsOf(request, '/api/inbox/items?status=open');
  return items.filter((item) => item.source === source);
}

/**
 * その業務日の一覧のうち、その送信元のぶん（docs/specs/28-inbox-history.md §3.1）。
 * `status` を問わず返る**唯一の読み出し口**で、下段の出どころ（29 §3.1-1）。
 */
async function datedOf(request: APIRequestContext, source: string) {
  const items = await itemsOf(request, '/api/inbox/items?date=' + localToday());
  return items.filter((item) => item.source === source);
}

/** カードは `<section aria-label={title}>`＝role=region で引く（hn6.1 と同じ掴み方）。 */
const cardOf = (page: Page, title: string) => page.getByRole('region', { name: title });
const doneFrame = (page: Page) => page.getByRole('region', { name: '今日決めたもの' });
const failureFrame = (page: Page) => page.getByRole('region', { name: '未処理の失敗' });
const kindFrame = (page: Page, label: string) => page.getByRole('region', { name: label });

/** 名簿。:48310 の静的サーバに依存させない（hn6.1 と同じ手法） */
async function mockOffice(page: Page) {
  await page.route('**/office.json', (route) =>
    route.fulfill({
      json: { generated_at: null, window_days: 14, employees: [], runs: [] },
    }),
  );
}

function stubItem(
  overrides: Partial<StoredItem> & { id: number; kind: Kind; title: string },
): StoredItem {
  return {
    source: 'night-harness',
    date: localToday(),
    slug: 'slug-' + overrides.id,
    bodyMd: null,
    options: null,
    refPath: null,
    payload: null,
    expiresAt: null,
    status: 'open',
    choice: null,
    decidedAt: null,
    applyState: overrides.kind === 'approve' || overrides.kind === 'choose' ? 'pending' : 'none',
    appliedAt: null,
    error: null,
    resultPath: null,
    resultUrl: null,
    receivedAt: localToday() + 'T06:20:00+09:00',
    ...overrides,
  };
}

/**
 * 3本の GET を固定応答にする（`?status=open` / `?applyState=failed` / `?date=`）。
 * `dated` に `null` を渡すと `?date=` だけ 500 を返す（§6 の条件）。
 */
async function stubList(
  page: Page,
  open: StoredItem[],
  failed: StoredItem[] = [],
  dated: StoredItem[] | null = [],
) {
  await page.route(
    (url) => url.pathname === '/api/inbox/items' && url.searchParams.get('status') === 'open',
    (route) => route.fulfill({ json: { items: open } }),
  );
  await page.route(
    (url) => url.pathname === '/api/inbox/items' && url.searchParams.get('applyState') === 'failed',
    (route) => route.fulfill({ json: { items: failed } }),
  );
  await page.route(
    (url) => url.pathname === '/api/inbox/items' && url.searchParams.has('date'),
    (route) =>
      dated === null
        ? route.fulfill({
            status: 500,
            json: { error: { code: 'internal', message: '履歴の読み出しに失敗しました' } },
          })
        : route.fulfill({ json: { items: dated } }),
  );
}

// ---- ① リロードしても残る（§3.1-1・28 §1） ----

test('read を押したあとリロードしても下段に残り、bodyMd が展開できる', async ({
  page,
  request,
}) => {
  const source = '0b82-reload';
  const title = '0b8.2-1 リロードしても読み返せる朝レポ';
  await mockOffice(page);
  await seed(request, source, [
    {
      slug: 'morning-report',
      kind: 'read',
      title,
      bodyMd: '## 要点\n\n- 決着した行はサーバから読み直す',
      refPath: '90_Meta/loop-reports/2026-09-03.md',
    },
  ]);
  await page.goto('/waiting');

  await cardOf(page, title).getByRole('button', { name: '読んだ' }).click();
  // サーバに記録された（`?status=open` から外れる）
  await expect.poll(async () => (await openOf(request, source)).length).toBe(0);
  await expect(doneFrame(page).getByRole('region', { name: title })).toContainText('📄 読んだ');

  // ここが本題: **リロードしても消えない**。決定 POST の応答をキャッシュへ差し込んだ
  // 残骸ではなく `?date={今日}` の取得結果を描いている（29 §1・§3.1-1）
  await page.reload();

  const row = doneFrame(page).getByRole('region', { name: title });
  await expect(row).toBeVisible();
  await expect(row).toContainText('📄 読んだ');
  // 未決グループには戻らない（サーバの `status` は `read`）
  await expect(kindFrame(page, '📄 読む').getByRole('region', { name: title })).toHaveCount(0);

  // 「読んだ印を付けるだけ」のボタンが本文を視界から落としていないこと（28 §1）
  const titleButton = row.getByRole('button', { name: title });
  await expect(titleButton).toHaveAttribute('aria-expanded', 'false');
  await titleButton.click();
  await expect(titleButton).toHaveAttribute('aria-expanded', 'true');
  await expect(row.getByText('決着した行はサーバから読み直す')).toBeVisible();
  await expect(row.getByText('90_Meta/loop-reports/2026-09-03.md')).toBeVisible();

  await page.screenshot({
    path: 'test-results/screens/cerebellum-0b8.2-waiting.png',
    fullPage: true,
  });
});

// ---- ② タブ復帰（再検証）でも消えない（§3.1-1・SWR_OPTIONS.revalidateOnFocus） ----

test('タブ復帰で `?status=open` が再取得されても下段の行は消えない', async ({ page, request }) => {
  const source = '0b82-focus';
  const title = '0b8.2-2 タブ復帰でも残る沈黙の通知';
  await mockOffice(page);
  await seed(request, source, [{ slug: 'silent', kind: 'alert', title }]);
  await page.goto('/waiting');

  await cardOf(page, title).getByRole('button', { name: '確認' }).click();
  const row = doneFrame(page).getByRole('region', { name: title });
  await expect(row).toContainText('⚠ 確認済み');

  // 決定後に数え始める（decision 直後の `?date=` 再検証と混ぜない）
  let openRefetch = 0;
  let datedRefetch = 0;
  page.on('request', (event) => {
    const url = new URL(event.url());
    if (url.pathname !== '/api/inbox/items') return;
    if (url.searchParams.get('status') === 'open') openRefetch += 1;
    if (url.searchParams.has('date')) datedRefetch += 1;
  });

  // タブ復帰＝SWR の focus 再検証（`visibilitychange` / `focus` を購読している）。
  // `focusThrottleInterval`（既定 5s）があるので、両方の再取得が起きるまで撃ち続ける
  await expect
    .poll(
      async () => {
        await page.evaluate(() => {
          document.dispatchEvent(new Event('visibilitychange'));
          window.dispatchEvent(new Event('focus'));
        });
        return Math.min(openRefetch, datedRefetch);
      },
      { timeout: 30_000 },
    )
    .toBeGreaterThan(0);

  // `?status=open` を引き直した後も残る。**ここが従来落ちていた経路**（29 §1）
  await expect(row).toBeVisible();
  await expect(row).toContainText('⚠ 確認済み');
  await expect(kindFrame(page, '⚠ 異常').getByRole('region', { name: title })).toHaveCount(0);
});

// ---- ③ 取り消しで未決グループへ戻る（§3.1-3・25 §3.2 の救済路） ----

test('下段から取り消すと未決グループへ戻り、リロード後も未決のまま', async ({ page, request }) => {
  const source = '0b82-undo';
  const title = '0b8.2-3 取り消して未決へ戻す提案';
  await mockOffice(page);
  await seed(request, source, [{ slug: 'insight', kind: 'approve', title }]);
  await page.goto('/waiting');

  await cardOf(page, title).getByRole('button', { name: '✅ 承認' }).click();
  const done = doneFrame(page).getByRole('region', { name: title });
  await expect(done).toContainText('✅ 承認');

  await done.getByRole('button', { name: '取り消す' }).click();

  // サーバが `open` に戻る（25 §3.2 の救済路）
  await expect
    .poll(async () => (await openOf(request, source)).map((item) => item.status))
    .toEqual(['open']);
  // 画面でも未決グループへ戻り、下段からは消える（同じ行が2箇所に出ない・§3.1-2）
  await expect(kindFrame(page, '✅ 承認').getByRole('region', { name: title })).toBeVisible();
  await expect(doneFrame(page).getByRole('region', { name: title })).toHaveCount(0);
  await expect(cardOf(page, title)).toHaveCount(1);

  // リロードしても未決のまま（`?date=` にも `status: open` で入っているが下段には落ちない）
  await page.reload();
  await expect(kindFrame(page, '✅ 承認').getByRole('region', { name: title })).toBeVisible();
  await expect(doneFrame(page).getByRole('region', { name: title })).toHaveCount(0);
  expect((await datedOf(request, source)).map((item) => item.status)).toEqual(['open']);
});

// ---- ④ 適用済みの行が凍結表示になる（§3.1-4・25 §3.2） ----

test('適用済み（applied）の行は下段に凍結表示で出る（取り消しボタンを持たない）', async ({
  page,
  request,
}) => {
  const source = '0b82-applied';
  const title = '0b8.2-4 適用まで進んだ提案';
  await mockOffice(page);
  await seed(request, source, [{ slug: 'applied', kind: 'approve', title }]);

  const target = (await openOf(request, source))[0];
  if (!target) throw new Error('投入した項目が見つからない: ' + title);

  // 機械が書く列（docs/specs/24-inbox.md §3.4）。承認 → 適用の順でしか書けない
  const decision = await request.post('/api/inbox/items/' + target.id + '/decision', {
    data: { status: 'approved' },
  });
  expect(decision.status(), await decision.text()).toBe(200);
  const applied = await request.post('/api/inbox/items/' + target.id + '/apply-result', {
    data: { state: 'applied', resultPath: '20_Insights/2026-09-03-friction.md' },
  });
  expect(applied.status(), await applied.text()).toBe(200);

  // 適用済みは `?status=open` にも `?applyState=failed` にも出ない
  // ——`?date=` が唯一の読み出し口（28 §1）
  expect(await openOf(request, source)).toHaveLength(0);
  expect(
    (await itemsOf(request, '/api/inbox/items?applyState=failed')).filter(
      (item) => item.source === source,
    ),
  ).toHaveLength(0);

  await page.goto('/waiting');

  const row = doneFrame(page).getByRole('region', { name: title });
  await expect(row).toBeVisible();
  await expect(row).toContainText('✅ 承認');
  // 機械が実際に動いた行は `open` へ戻せない。その旨を出す（25 §3.2・24 §3.3-2）
  await expect(row).toContainText('適用が動いた行は取り消せません');
  await expect(row.getByRole('button', { name: '取り消す' })).toHaveCount(0);
  // 失敗ではないので最上部の枠には出ない
  await expect(failureFrame(page).getByRole('region', { name: title })).toHaveCount(0);
});

// ---- 二重表示をしない（§3.1-2・§3.2 の失敗枠との住み分け） ----

test('今日届いた未決と失敗の行は下段に二重で出ない', async ({ page }) => {
  const pendingTitle = '0b8.2-5 今日届いた未決の行';
  const failedTitle = '0b8.2-6 適用でつまづいた行';
  const decidedTitle = '0b8.2-7 今日決めた行';
  const failedRow = stubItem({
    id: 902,
    kind: 'approve',
    title: failedTitle,
    status: 'approved',
    applyState: 'failed',
    error: '対象ファイルの見出しが見つかりません',
  });

  await mockOffice(page);
  // `?date={今日}` には**未決も失敗も決着も**入る（28 §3.1-1: status を問わず全件）
  await stubList(
    page,
    [stubItem({ id: 901, kind: 'approve', title: pendingTitle })],
    [failedRow],
    [
      stubItem({ id: 903, kind: 'read', title: decidedTitle, status: 'read' }),
      failedRow,
      stubItem({ id: 901, kind: 'approve', title: pendingTitle }),
    ],
  );
  await page.goto('/waiting');

  // 未決は kind グループにだけ（下段の抽出条件 `status !== 'open'` で落ちる・§3.1-2）
  await expect(cardOf(page, pendingTitle)).toHaveCount(1);
  await expect(kindFrame(page, '✅ 承認').getByRole('region', { name: pendingTitle })).toBeVisible();
  await expect(doneFrame(page).getByRole('region', { name: pendingTitle })).toHaveCount(0);

  // 失敗は最上部の枠にだけ（25 §3.2 の失敗枠。下段に重ねない）
  await expect(cardOf(page, failedTitle)).toHaveCount(1);
  await expect(failureFrame(page).getByRole('region', { name: failedTitle })).toBeVisible();
  await expect(doneFrame(page).getByRole('region', { name: failedTitle })).toHaveCount(0);

  // 決着行は下段にだけ
  await expect(cardOf(page, decidedTitle)).toHaveCount(1);
  await expect(doneFrame(page).getByRole('region', { name: decidedTitle })).toContainText(
    '📄 読んだ',
  );
});

// ---- §6 `?date=` の障害 ----

test('`?date=` が 500 でも上段は描き続け、下段だけ「取得できません」になる', async ({ page }) => {
  const pendingTitle = '0b8.2-8 履歴が落ちていても決められる行';
  const failedTitle = '0b8.2-9 履歴が落ちていても出す失敗行';

  await mockOffice(page);
  await stubList(
    page,
    [stubItem({ id: 911, kind: 'approve', title: pendingTitle })],
    [
      stubItem({
        id: 912,
        kind: 'approve',
        title: failedTitle,
        status: 'approved',
        applyState: 'failed',
        error: '適用先が見つかりません',
      }),
    ],
    null,
  );
  await page.goto('/waiting');

  // 上段（未決・失敗）は描き続ける——決める作業を履歴の障害で止めない（§6）
  await expect(kindFrame(page, '✅ 承認').getByRole('region', { name: pendingTitle })).toBeVisible();
  await expect(
    cardOf(page, pendingTitle).getByRole('button', { name: '✅ 承認' }),
  ).toBeVisible();
  await expect(failureFrame(page).getByRole('region', { name: failedTitle })).toBeVisible();

  // 障害は黙らせない（ErrorBanner＋再検証待ち・§6）
  await expect(page.locator('.banner[role="alert"]').first()).toContainText(
    '今日決めたものを取得できませんでした: 履歴の読み出しに失敗しました',
  );

  // 下段だけ `取得できません`（0件と取得失敗を混同しない）
  await expect(doneFrame(page)).toContainText('取得できません');
  await expect(page.getByText('確認待ちはありません。')).toHaveCount(0);
});
