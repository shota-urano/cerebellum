import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

// cerebellum-hn6.1 [Frontend] `features/inbox/`（旧 `features/waiting/` を作り替え）
// 受け入れ基準（docs/specs/25-web-inbox.md §3.2・§3.4・§4）:
//   4 kind が固定順（⚠異常→✅承認→☑選択→📄読む）で出る / 未決0のグループが見出しごと消える /
//   approve の ✅・❌・取り消し / choose のラジオ選択が `chosen`＋`choice` を送る /
//   alert の「確認」/ read の「読んだ」/ failed 行が最上部に日をまたいで出る /
//   名簿未登録バッジが出る
//
// 起動しているのは release バイナリ＋使い捨ての空 DB（playwright.config.ts）なので、
// 項目は**実 API（POST /api/inbox/batches）で投入**する（docs/specs/03-api.md §3）。
//
// 並列実行の前提（fullyParallel）と、この画面固有の事情:
//   - 一覧は日付ではなく状態（`?status=open`）で引く（docs/specs/24-inbox.md §3.4）。
//     つまり**他テストが投入した未決も同じ画面に並ぶ**。よって
//     (a) `source` と `title` はテストごとに一意にする（region 名の重複で strict mode に触れない）
//     (b) 件数の検証はしない。存在・順序は自分が投入した行の相対関係で見る
//   - kind グループの構成（固定順・0件グループの省略）は画面全体の並びなので、
//     実データでは他テストの項目が混ざって作れない。**この検証だけ GET を固定応答にする**
//     （サーバーの挙動は docs/specs/24-inbox.md 側のテストが持つ）
//   - 名簿（office.json）は :48310 の静的サーバが配信する外部データなので page.route で
//     差し替える（実サーバの起動状態にテストを依存させない。5k5.1 と同じ手法）

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

/** 1送信元・1業務日ぶんを投入する（0件でも送る契約なので items はそのまま渡す）。 */
async function seed(
  request: APIRequestContext,
  source: string,
  date: string,
  items: SeedItem[],
): Promise<void> {
  const res = await request.post('/api/inbox/batches', { data: { source, date, items } });
  expect(res.status(), await res.text()).toBe(200);
}

async function itemsOf(request: APIRequestContext, url: string): Promise<StoredItem[]> {
  const res = await request.get(url);
  expect(res.status(), await res.text()).toBe(200);
  const body = (await res.json()) as { items: StoredItem[] };
  return body.items;
}

/**
 * 未決一覧のうち、その送信元のぶん（他テストの投入を除く）。
 *
 * **決着した行はここから落ちる**（`?status=open` で引くため）。`rejected` / `read` /
 * `acknowledged` を読み戻す GET は存在しない（機械が拾わない状態なので不要・
 * docs/specs/24-inbox.md §3.1）ので、この3つは「未決から消えたこと」で決定を確認する。
 */
async function openOf(request: APIRequestContext, source: string) {
  const items = await itemsOf(request, '/api/inbox/items?status=open');
  return items.filter((item) => item.source === source);
}

/** 決定済み・未適用（＝その係が次の勤務で拾う集合。docs/specs/24-inbox.md §3.4）。 */
async function decidedOf(request: APIRequestContext, source: string) {
  return itemsOf(
    request,
    '/api/inbox/items?source=' + encodeURIComponent(source) + '&status=decided&applyState=pending',
  );
}

/** カードは `<section aria-label={title}>`＝role=region で引く。 */
const cardOf = (page: Page, title: string) => page.getByRole('region', { name: title });

const failureFrame = (page: Page) => page.getByRole('region', { name: '未処理の失敗' });
const doneFrame = (page: Page) => page.getByRole('region', { name: '今日決めたもの' });

/** 名簿。`source` は office.json の `employees[].skill` と同じ文字列（docs/specs/24-inbox.md §3.1） */
const EMPLOYEES = [
  {
    automation_id: 'a-night-harness',
    name: '夜勤ハーネス（night-harness）',
    skill: 'night-harness',
    enabled: true,
    shift: { hour: 6, minute: 20, days: '毎日', label: '毎日 06:20' },
    next_run_at: null,
    last_run_at: null,
    last_run_id: null,
    profile: { job: '判定を作って承認を待ちます', command: null, checks: null, doc: null },
  },
];

async function mockOffice(page: Page) {
  await page.route('**/office.json', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        generated_at: null,
        window_days: 14,
        employees: EMPLOYEES,
        runs: [],
      }),
    }),
  );
}

function stubItem(overrides: Partial<StoredItem> & { id: number; kind: Kind; title: string }): StoredItem {
  return {
    source: 'night-harness',
    date: '2026-09-02',
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
    receivedAt: '2026-09-02T06:20:00+09:00',
    ...overrides,
  };
}

/**
 * 未決・失敗・その日ぶんの一覧 GET を固定応答にする（画面全体の並びを見るテスト用）。
 *
 * `?date=` は「今日決めたもの」の出どころ（docs/specs/29-web-inbox-history.md §3.1-1）。
 * **ここを固定しないと**、fullyParallel で他テストが投入した今日の決着行が実サーバから返り、
 * 下段の見出しが画面全体の並び（`groupHeadings` は「今日決めたもの」も拾う）に混ざる。
 * 期待値は緩めず、モックの口だけを足している。
 */
async function stubList(
  page: Page,
  open: StoredItem[],
  failed: StoredItem[] = [],
  dated: StoredItem[] = [],
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
    (route) => route.fulfill({ json: { items: dated } }),
  );
}

/** kind グループの見出し（空白を畳んで比較する）。 */
async function groupHeadings(page: Page) {
  const labels = await page.locator('.wt__group--kind').allInnerTexts();
  return labels.map((label) => label.replace(/\s+/g, ' ').trim());
}

// ---- kind グループの構成（§3.2・§4） ----

test('4 kind が固定順（異常→承認→選択→読む）で出て、各見出しの直下に固定文言が付く', async ({
  page,
}) => {
  await mockOffice(page);
  // 意図的に「読む → 選択 → 承認 → 異常」の逆順で返す（並べ替えが画面側の責務であることを見る）
  await stubList(page, [
    stubItem({ id: 104, kind: 'read', title: '週報（2026-08 第5週）' }),
    stubItem({
      id: 103,
      kind: 'choose',
      title: '実験結果をどう扱うか選ぶ',
      options: [
        { id: 'adopt', label: '採用する' },
        { id: 'hold', label: '保留する' },
      ],
    }),
    stubItem({
      id: 102,
      kind: 'approve',
      title: '「摩擦の記録」を Insight にする',
      bodyMd: '## 判定\n\n採用に足る一人称の摩擦がある。',
      refPath: '40_Projects/harness/result.md',
    }),
    stubItem({ id: 101, kind: 'alert', title: 'routine_watchdog が3日ぶん沈黙している' }),
  ]);
  await page.goto('/waiting');

  await expect(page.getByRole('heading', { name: 'あなた待ち' })).toBeVisible();

  // 並びは alert → approve → choose → read で固定（§3.2・§4）
  expect(await groupHeadings(page)).toEqual(['⚠ 異常 1', '✅ 承認 1', '☑ 選択 1', '📄 読む 1']);

  // 見出しの直下の1行は kind で固定（送信元ごとの文言は持たない・§4）
  await expect(page.getByText('確認した印を付けるだけ。直すのは人間')).toBeVisible();
  await expect(page.getByText('✅した行だけを、その係が次の勤務で適用する')).toBeVisible();
  await expect(page.getByText('選んだ1つを、その係が次の勤務で使う')).toBeVisible();
  await expect(page.getByText('読んだ印を付けるだけ')).toBeVisible();

  // 送信元は名簿の name で出す（§3.2）。名簿にある送信元にバッジは付かない
  const card = cardOf(page, 'routine_watchdog が3日ぶん沈黙している');
  await expect(card).toContainText('夜勤ハーネス（night-harness）');
  await expect(card.getByText('名簿未登録')).toHaveCount(0);

  await page.screenshot({
    path: 'test-results/screens/cerebellum-hn6.1-inbox.png',
    fullPage: true,
  });
});

test('未決0件の kind は見出しごと省く', async ({ page }) => {
  await mockOffice(page);
  await stubList(page, [
    stubItem({ id: 201, kind: 'alert', title: 'launchd の常駐が落ちている' }),
    stubItem({ id: 202, kind: 'read', title: '夜勤の朝レポ（2026-09-01）' }),
  ]);
  await page.goto('/waiting');

  expect(await groupHeadings(page)).toEqual(['⚠ 異常 1', '📄 読む 1']);
  // 0件グループは文言ごと出ない（§3.2）
  await expect(page.getByText('✅した行だけを、その係が次の勤務で適用する')).toHaveCount(0);
  await expect(page.getByText('選んだ1つを、その係が次の勤務で使う')).toHaveCount(0);
});

// ---- 名簿未登録（§3.4） ----

test('名簿に無い送信元は source を等幅で出し「名簿未登録」バッジを添える（受信は正常に扱う）', async ({
  page,
}) => {
  await mockOffice(page);
  await stubList(page, [
    stubItem({ id: 301, kind: 'alert', title: '新設 skill からの異常', source: 'brand-new-skill' }),
    stubItem({ id: 302, kind: 'alert', title: '名簿にある skill からの異常' }),
  ]);
  await page.goto('/waiting');

  const unknown = cardOf(page, '新設 skill からの異常');
  await expect(unknown).toContainText('brand-new-skill');
  await expect(unknown.getByText('名簿未登録')).toBeVisible();
  // 拒否せず普通に操作できる（§3.4）
  await expect(unknown.getByRole('button', { name: '確認' })).toBeVisible();

  await expect(cardOf(page, '名簿にある skill からの異常').getByText('名簿未登録')).toHaveCount(0);
});

// ---- bodyMd の展開と refPath（§3.2） ----

test('bodyMd がある行は title タップで全文が開く（refPath は開閉に関係なく出たまま）', async ({
  page,
}) => {
  await mockOffice(page);
  await stubList(page, [
    stubItem({
      id: 401,
      kind: 'read',
      title: '週報を読む',
      bodyMd: '## 先週の要点\n\n- 承認の口を1本に寄せた',
      refPath: '90_Meta/weekly/2026-W35.md',
    }),
    stubItem({ id: 402, kind: 'read', title: '本文の無い報告' }),
  ]);
  await page.goto('/waiting');

  const card = cardOf(page, '週報を読む');
  const title = card.getByRole('button', { name: '週報を読む' });
  await expect(title).toHaveAttribute('aria-expanded', 'false');
  await expect(card.getByText('承認の口を1本に寄せた')).toHaveCount(0);
  // refPath は `bodyMd` に従属しない（03-api.md §3 で独立した任意フィールド）ので、
  // 閉じている段でも在処は見えている
  await expect(card.getByText('90_Meta/weekly/2026-W35.md')).toBeVisible();

  await title.click();
  await expect(title).toHaveAttribute('aria-expanded', 'true');
  await expect(card.getByText('先週の要点')).toBeVisible();
  await expect(card.getByText('承認の口を1本に寄せた')).toBeVisible();
  await expect(card.getByText('90_Meta/weekly/2026-W35.md')).toBeVisible();
  await expect(card.getByRole('link')).toHaveCount(0);

  await title.click();
  await expect(card.getByText('承認の口を1本に寄せた')).toHaveCount(0);
  await expect(card.getByText('90_Meta/weekly/2026-W35.md')).toBeVisible();

  // bodyMd が無い行は開閉ボタンを持たない
  await expect(cardOf(page, '本文の無い報告').getByRole('button', { name: '本文の無い報告' })).toHaveCount(0);
});

test('bodyMd が無く refPath だけある行でも、在処は等幅で表示のみ（リンクにしない）', async ({
  page,
}) => {
  const refPath = '90_Meta/daily_intake/2026-09-01.md';
  await mockOffice(page);
  await stubList(page, [
    // `refPath` は `bodyMd` と独立した任意フィールド（docs/specs/03-api.md §3）。
    // 本文が無い行で在処が消えると、人間が原文へ辿る唯一の手がかりが画面から落ちる
    stubItem({ id: 501, kind: 'alert', title: '候補ファイルの整合が崩れている', refPath }),
    stubItem({ id: 502, kind: 'alert', title: '在処の無い異常' }),
  ]);
  await page.goto('/waiting');

  const card = cardOf(page, '候補ファイルの整合が崩れている');
  // 展開操作を持たない行でも、タップ無しで在処が読める
  await expect(card.getByRole('button', { name: '候補ファイルの整合が崩れている' })).toHaveCount(0);
  const path = card.getByText(refPath);
  await expect(path).toBeVisible();
  // 等幅（`mono`）で出すだけ・リンクにしない（§3.2）
  await expect(path).toHaveClass(/mono/);
  await expect(card.getByRole('link')).toHaveCount(0);

  // refPath が無い行に空の枠を出さない
  await expect(cardOf(page, '在処の無い異常').locator('.wt__ref')).toHaveCount(0);
});

// ---- approve（§3.2 の表） ----

test('approve は ✅ で approved・❌ で rejected になり、「今日決めたもの」から取り消せる', async ({
  page,
  request,
}) => {
  const source = 'hn61-approve';
  const title = '「関門を1画面に集める」を Insight にする';
  await mockOffice(page);
  await seed(request, source, 'today', [{ slug: 'insight', kind: 'approve', title }]);
  await page.goto('/waiting');

  const card = cardOf(page, title);
  await expect(card).toContainText(title);
  // 名簿を読めていないときは source を等幅で出すだけ（バッジは付けない・§3.4）
  await expect(card).toContainText(source);

  // ✅ → その係が次の勤務で拾う集合に入る（表示は optimistic なのでサーバー側は poll で待つ）
  await card.getByRole('button', { name: '✅ 承認' }).click();
  await expect
    .poll(async () => (await decidedOf(request, source)).map((item) => item.status))
    .toEqual(['approved']);

  // 決定した行は消えず、下部「今日決めたもの」に畳んで残る（誤タップの救済路・§3.2）
  const inDone = doneFrame(page).getByRole('region', { name: title });
  await expect(inDone).toBeVisible();
  await expect(inDone).toContainText('✅ 承認');
  await expect(inDone).toHaveClass(/wt__card--decided/);

  // 取り消すと未決へ戻り、承認グループに再び並ぶ
  await inDone.getByRole('button', { name: '取り消す' }).click();
  await expect.poll(async () => (await decidedOf(request, source)).length).toBe(0);
  await expect.poll(async () => (await openOf(request, source)).map((item) => item.status)).toEqual(['open']);
  await expect(
    page.getByRole('region', { name: '✅ 承認' }).getByRole('region', { name: title }),
  ).toBeVisible();

  // ❌ は「その係に拾わせない」意思表示。未決から外れるが decided（適用対象）には入らない
  await cardOf(page, title).getByRole('button', { name: '❌ 却下' }).click();
  await expect.poll(async () => (await openOf(request, source)).length).toBe(0);
  expect(await decidedOf(request, source)).toHaveLength(0);
  await expect(doneFrame(page).getByRole('region', { name: title })).toContainText('❌ 却下');
});

// ---- choose（§3.2 の表） ----

test('choose はラジオを選んだ時点で chosen＋choice を送る', async ({ page, request }) => {
  const source = 'hn61-choose';
  const title = 'モデルの入れ替えをどうするか選ぶ';
  await mockOffice(page);
  await seed(request, source, 'today', [
    {
      slug: 'model-switch',
      kind: 'choose',
      title,
      options: [
        { id: 'adopt', label: '入れ替える' },
        { id: 'hold', label: '今回は見送る' },
      ],
    },
  ]);
  await page.goto('/waiting');

  const card = cardOf(page, title);
  // `check()` は使えない——選んだ時点で決定が飛び、行が「今日決めたもの」へ移って
  // ラジオ自体が DOM から外れるため（`check()` は押した後に checked を確認しに戻る）
  await card.getByRole('radio', { name: '入れ替える' }).click();

  await expect
    .poll(async () =>
      (await decidedOf(request, source)).map((item) => [item.status, item.choice].join(':')),
    )
    .toEqual(['chosen:adopt']);

  const inDone = doneFrame(page).getByRole('region', { name: title });
  // 選んだ選択肢の label で「何を決めたか」を出す
  await expect(inDone).toContainText('☑ 入れ替える');
});

// ---- alert / read（§3.2 の表） ----

test('alert は「確認」1ボタンで acknowledged になる（直すのは人間なので他の操作を持たない）', async ({
  page,
  request,
}) => {
  const source = 'hn61-alert';
  const title = 'routine_watchdog が2日ぶん沈黙している';
  await mockOffice(page);
  await seed(request, source, 'today', [{ slug: 'silent', kind: 'alert', title }]);
  await page.goto('/waiting');

  const card = cardOf(page, title);
  await expect(card.getByRole('button', { name: '❌ 却下' })).toHaveCount(0);

  await card.getByRole('button', { name: '確認' }).click();
  // 未決から外れ（＝acknowledged が記録され）、読み戻しの集合には入らない
  await expect.poll(async () => (await openOf(request, source)).length).toBe(0);
  expect(await decidedOf(request, source)).toHaveLength(0);
  await expect(doneFrame(page).getByRole('region', { name: title })).toContainText('⚠ 確認済み');
});

test('read は「読んだ」1ボタンで read になる', async ({ page, request }) => {
  const source = 'hn61-read';
  const title = '夜勤の朝レポ（2026-08-31）';
  await mockOffice(page);
  await seed(request, source, 'today', [{ slug: 'morning-report', kind: 'read', title }]);
  await page.goto('/waiting');

  await cardOf(page, title).getByRole('button', { name: '読んだ' }).click();
  await expect.poll(async () => (await openOf(request, source)).length).toBe(0);
  await expect(doneFrame(page).getByRole('region', { name: title })).toContainText('📄 読んだ');
});

// ---- 失敗枠（§3.2） ----

test('applyState=failed の行は最上部に日をまたいで出て、error 全文と取り消せない旨が付く', async ({
  page,
  request,
}) => {
  const source = 'hn61-failed';
  const date = '2026-08-04';
  const failing = '適用に失敗した提案';
  const staying = '同じ日に届いた未決の提案';
  const ERROR =
    '対象ファイルの見出しが見つかりません: 20_Insights/2026-08-04-friction.md（原文が編集された可能性）';
  await mockOffice(page);
  await seed(request, source, date, [
    { slug: 'failing', kind: 'approve', title: failing },
    { slug: 'staying', kind: 'approve', title: staying },
  ]);

  const target = (await openOf(request, source)).find((item) => item.slug === 'failing');
  if (!target) throw new Error('投入した項目が見つからない: failing');

  // 機械が書く列（docs/specs/24-inbox.md §3.4）。承認 → 適用失敗の順でしか書けない
  expect(
    (await request.post(`/api/inbox/items/${target.id}/decision`, { data: { status: 'approved' } })).status(),
  ).toBe(200);
  const result = await request.post(`/api/inbox/items/${target.id}/apply-result`, {
    data: { state: 'failed', error: ERROR },
  });
  expect(result.status(), await result.text()).toBe(200);

  await page.goto('/waiting');

  const frame = failureFrame(page);
  await expect(frame).toContainText('未処理の失敗');
  const failed = frame.getByRole('region', { name: failing });
  await expect(failed).toHaveCount(1);
  await expect(failed).toContainText('適用失敗');
  // error は切らずに全文出す（手で直すための情報・§3.2）
  await expect(failed).toContainText(ERROR);
  // 日をまたいで出続けるので、いつの分か分かるよう業務日を併記する
  await expect(failed).toContainText(date);
  // 適用が動いた行は open へ戻せない。その旨を出す（§3.2）
  await expect(failed).toContainText('適用が動いた行は取り消せません');
  await expect(failed.getByRole('button', { name: '取り消す' })).toHaveCount(0);

  // 失敗枠は kind グループより上（下に埋もれると気づけない・§3.2）
  const failedBox = await frame.boundingBox();
  const group = page.locator('.wt__kind').first();
  await expect(group).toBeVisible();
  const groupBox = await group.boundingBox();
  expect(failedBox?.y ?? Infinity).toBeLessThan(groupBox?.y ?? 0);

  // 失敗行は未決グループに二重で出ない。同じ日の未決はそのまま承認できる
  await expect(
    page.getByRole('region', { name: '✅ 承認' }).getByRole('region', { name: failing }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('region', { name: '✅ 承認' }).getByRole('region', { name: staying }),
  ).toBeVisible();
});
