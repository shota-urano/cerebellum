import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

// cerebellum-0b8.3 [Frontend] 過去日ビューと日付ナビ
// （docs/specs/29-web-inbox-history.md §3.2・§3.3・§4・§6）
//
// 受け入れ基準:
//   ① 前日へ移動するとその日の全項目が id 降順の1列で出る
//   ② 決定ボタン（とラジオ）が出ない
//   ③ `bodyMd` が読める
//   ④ 失敗枠と未着行が出ない
//   ⑤ 翌日ボタンが今日で止まる
//   ⑥ `今日` ボタンで §3.1 のビューへ戻る
//   ⑦ 記録の無い日が確定文言（`この日に届いたものはありません。`）になる
//
// 起動しているのは release バイナリ＋使い捨ての空 DB（playwright.config.ts）。
// 「1列・id 降順」「枠が出ない」は**画面全体の並び**の話なので、fullyParallel で他テストの
// 投入が混ざる実データでは条件を作れない——hn6.1 / 0b8.2 と同じ流儀で GET を固定応答にする
// （サーバの `?date=` の挙動は docs/specs/28-inbox-history.md 側のテストが持つ）。
// 最後の1本だけは**実 API で過去日を投入**して配線ごと通す（スクリーンショットもここで撮る）。

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

/** n 日ずらした ISO 日付（画面の `shiftDate()` と同じ UTC 計算） */
function shiftDate(iso: string, n: number) {
  const [y, m, d] = iso.split('-').map(Number);
  const at = new Date(Date.UTC(y, m - 1, d + n));
  const pad = (value: number) => String(value).padStart(2, '0');
  return at.getUTCFullYear() + '-' + pad(at.getUTCMonth() + 1) + '-' + pad(at.getUTCDate());
}

const TODAY = localToday();
const YESTERDAY = shiftDate(TODAY, -1);

/** カードは `<section aria-label={title}>`＝role=region で引く（hn6.1 / 0b8.2 と同じ掴み方）。 */
const cardOf = (page: Page, title: string) => page.getByRole('region', { name: title });
const failureFrame = (page: Page) => page.getByRole('region', { name: '未処理の失敗' });
const doneFrame = (page: Page) => page.getByRole('region', { name: '今日決めたもの' });
const kindFrame = (page: Page, label: string) => page.getByRole('region', { name: label });
const missingFrame = (page: Page) => page.getByRole('region', { name: '未着' });
const prevButton = (page: Page) => page.getByRole('button', { name: '◀ 前日' });
const nextButton = (page: Page) => page.getByRole('button', { name: '翌日 ▶' });
/** 「今日」ボタン（§3.3 の戻り導線）。`◀ 今日へ`（`/` へ戻る既存導線）と混ざらないよう厳密一致で引く */
const todayButton = (page: Page) => page.getByRole('link', { name: '今日', exact: true });

/**
 * 名簿。:48310 の静的サーバに依存させない（hn6.1 / 0b8.2 と同じ手法）。
 *
 * `review.cadence = shift` で**今日 due**の社員を1人入れる（docs/specs/25-web-inbox.md §3.3）。
 * この送信元は何も送ってこないので、今日のビューでは未着行が出る——④「過去日では出ない」を
 * 「そもそも出ない条件」で誤魔化さないために、出る状態を作ってから過去日へ移る。
 */
async function mockOffice(page: Page, source: string) {
  await page.route('**/office.json', (route) =>
    route.fulfill({
      json: {
        generated_at: null,
        window_days: 14,
        employees: [
          {
            automation_id: 'a-' + source,
            name: '沈黙している係（' + source + '）',
            skill: source,
            enabled: true,
            shift: { hour: 0, minute: 0, days: '毎日', label: '毎日 00:00' },
            next_run_at: null,
            last_run_at: null,
            last_run_id: null,
            profile: {
              job: '毎朝ひとこと送る係',
              command: null,
              checks: null,
              doc: null,
              review: { kinds: ['read'], cadence: 'shift' },
            },
          },
        ],
        runs: [],
      },
    }),
  );
}

function stubItem(
  overrides: Partial<StoredItem> & { id: number; kind: Kind; title: string; date: string },
): StoredItem {
  return {
    source: 'night-harness',
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
    receivedAt: overrides.date + 'T06:20:00+09:00',
    ...overrides,
  };
}

/**
 * `/api/inbox/items` の GET を固定応答にする。
 *
 * - `?date=` は業務日ごとに引き当てる（`byDate` に無い日は空配列＝記録の無い日・28 §3.2）。
 *   `null` を入れた日は 500（§6 の条件）
 * - `?status=open` / `?applyState=failed` は今日のビューの上段用。**過去日ビューはこの2本を
 *   引かない**（§3.2-4 で出さない枠のために取得しない）ので、過去日では使われないのが正しい
 */
async function stubItems(
  page: Page,
  byDate: Record<string, StoredItem[] | null>,
  open: StoredItem[] = [],
  failed: StoredItem[] = [],
) {
  await page.route(
    (url) => url.pathname === '/api/inbox/items',
    (route) => {
      const url = new URL(route.request().url());
      const date = url.searchParams.get('date');
      if (date !== null) {
        const items = byDate[date];
        if (items === null) {
          return route.fulfill({
            status: 500,
            json: { error: { code: 'internal', message: '履歴の読み出しに失敗しました' } },
          });
        }
        return route.fulfill({ json: { items: items ?? [] } });
      }
      if (url.searchParams.get('applyState') === 'failed') {
        return route.fulfill({ json: { items: failed } });
      }
      return route.fulfill({ json: { items: open } });
    },
  );
}

/** DOM 順のカード名（1列・並びの検証用。過去日ビューでは region はカードだけ） */
async function cardOrder(page: Page) {
  return page
    .getByRole('region')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-label')));
}

// ---- ①②③④ 過去日のビュー ----

test('前日へ移動すると、その日の全項目が id 降順の1列で読み取り専用に出る', async ({ page }) => {
  const absent = '0b83-absent';
  const openTitle = '0b8.3-0 今日届いた未決の行';
  const failedTodayTitle = '0b8.3-0f 日をまたいだ未処理の失敗';

  // 前日ぶん: kind も status も混ぜる（過去日は status を問わず全件・28 §3.1-1）
  const pendingTitle = '0b8.3-1 前日に届いたまま決めていない行';
  const chosenTitle = '0b8.3-2 前日に選んだ行';
  const failedTitle = '0b8.3-3 前日に適用でつまづいた行';
  const readTitle = '0b8.3-4 前日に読んだ朝レポ';
  const yesterday = [
    stubItem({ id: 404, kind: 'read', title: readTitle, date: YESTERDAY, status: 'read',
      bodyMd: '## 要点\n\n- 過去日でも本文が読める\n- 決める場所は今日のビューだけ',
      refPath: '90_Meta/loop-reports/' + YESTERDAY + '.md' }),
    stubItem({ id: 403, kind: 'approve', title: failedTitle, date: YESTERDAY, status: 'approved',
      applyState: 'failed', error: '適用先の見出しが見つかりません' }),
    stubItem({ id: 402, kind: 'choose', title: chosenTitle, date: YESTERDAY, status: 'chosen',
      choice: 'b', options: [{ id: 'a', label: '朝に回す' }, { id: 'b', label: '夜に回す' }] }),
    stubItem({ id: 401, kind: 'alert', title: pendingTitle, date: YESTERDAY }),
  ];

  await mockOffice(page, absent);
  await stubItems(
    page,
    { [YESTERDAY]: yesterday, [TODAY]: [] },
    [stubItem({ id: 400, kind: 'approve', title: openTitle, date: TODAY })],
    [
      stubItem({ id: 399, kind: 'approve', title: failedTodayTitle, date: YESTERDAY,
        status: 'approved', applyState: 'failed', error: '既に適用済みです' }),
    ],
  );

  // まず今日のビュー: 未着行と失敗枠が**出ている**状態を作る（④を空条件で誤魔化さない）
  await page.goto('/waiting');
  await expect(missingFrame(page)).toContainText('未着: 沈黙している係');
  await expect(failureFrame(page).getByRole('region', { name: failedTodayTitle })).toBeVisible();

  // ---- ① 前日へ移動（§3.3 の日付ナビ） ----
  await prevButton(page).click();
  await expect(page).toHaveURL('/waiting?date=' + YESTERDAY);
  await expect(cardOf(page, readTitle)).toBeVisible();

  // その日の全項目が **1列・id 降順**（サーバ返却順のまま・§3.2-1・§4）。
  // 過去日ビューに枠（失敗枠・kind グループ・今日決めたもの）は無いので region はカードだけ
  expect(await cardOrder(page)).toEqual([readTitle, failedTitle, chosenTitle, pendingTitle]);

  // kind でグループしない・固定文言も出さない（§3.2-1・§4）
  await expect(kindFrame(page, '⚠ 異常')).toHaveCount(0);
  await expect(kindFrame(page, '☑ 選択')).toHaveCount(0);
  await expect(kindFrame(page, '📄 読む')).toHaveCount(0);
  await expect(doneFrame(page)).toHaveCount(0);
  await expect(page.getByText('確認した印を付けるだけ。直すのは人間')).toHaveCount(0);
  await expect(page.getByText('読んだ印を付けるだけ')).toHaveCount(0);

  // ---- ② 決定ボタン・ラジオが出ない（§3.2-2） ----
  // `name` は既定で部分一致なので、題名ボタン（例 `…前日に読んだ朝レポ`）に引っかからないよう
  // 決定ボタンの否定は厳密一致で引く
  for (const label of ['確認', '読んだ', '✅ 承認', '❌ 却下', '取り消す']) {
    await expect(page.getByRole('button', { name: label, exact: true })).toHaveCount(0);
  }
  await expect(page.getByRole('radiogroup')).toHaveCount(0);
  await expect(page.getByRole('radio')).toHaveCount(0);

  // 各行は現在の状態を出すだけ（§3.2-2）。未決の行も「未決」と出す
  await expect(cardOf(page, pendingTitle)).toContainText('未決');
  await expect(cardOf(page, chosenTitle)).toContainText('☑ 夜に回す');
  await expect(cardOf(page, failedTitle)).toContainText('✅ 承認');
  await expect(cardOf(page, readTitle)).toContainText('📄 読んだ');

  // ---- ③ `bodyMd` が読める（§3.2-3。読み返しが目的なので本文が読めることが要件） ----
  const readRow = cardOf(page, readTitle);
  const titleButton = readRow.getByRole('button', { name: readTitle });
  await expect(titleButton).toHaveAttribute('aria-expanded', 'false');
  await titleButton.click();
  await expect(titleButton).toHaveAttribute('aria-expanded', 'true');
  await expect(readRow.getByText('過去日でも本文が読める')).toBeVisible();
  // `refPath` は `bodyMd` と独立に常に出る（25 §3.2）
  await expect(readRow.getByText('90_Meta/loop-reports/' + YESTERDAY + '.md')).toBeVisible();

  // ---- ④ 失敗枠と未着行が出ない（§3.2-4） ----
  await expect(failureFrame(page)).toHaveCount(0);
  await expect(missingFrame(page)).toHaveCount(0);
  await expect(page.getByText('未着: 沈黙している係（' + absent + '）（毎日 00:00 予定）')).toHaveCount(0);
  // 日をまたいで出し続ける失敗（今日のビューの最上部にいた行）も過去日には持ち込まない
  await expect(cardOf(page, failedTodayTitle)).toHaveCount(0);
  // その日の `failed` 行は状態表示と `apply_error` の等幅表示で足りる（§3.2-4）
  await expect(cardOf(page, failedTitle)).toContainText('適用失敗');
  await expect(cardOf(page, failedTitle)).toContainText('適用先の見出しが見つかりません');
});

// ---- ⑤⑥ 日付ナビ（§3.3） ----

test('翌日ボタンは今日で止まり、`今日` ボタンで §3.1 のビューへ戻る', async ({ page }) => {
  const openTitle = '0b8.3-5 今日のビューに出る未決の行';
  const pastTitle = '0b8.3-6 前日のビューに出る行';

  await mockOffice(page, '0b83-nav');
  await stubItems(
    page,
    { [YESTERDAY]: [stubItem({ id: 501, kind: 'read', title: pastTitle, date: YESTERDAY, status: 'read' })], [TODAY]: [] },
    [stubItem({ id: 502, kind: 'approve', title: openTitle, date: TODAY })],
  );

  await page.goto('/waiting?date=' + YESTERDAY);
  await expect(cardOf(page, pastTitle)).toBeVisible();

  // ---- ⑤ 翌日は今日まで（未来へ進めない・§3.3・09 §3） ----
  await expect(nextButton(page)).toBeEnabled();
  await nextButton(page).click();
  await expect(page).toHaveURL('/waiting?date=' + TODAY);
  // 今日に着いたら**そこで止まる**。カレンダー UI も無い（09 §4）
  await expect(nextButton(page)).toBeDisabled();
  // 今日の表示なので §3.1 のビュー（決められる画面）
  await expect(kindFrame(page, '✅ 承認').getByRole('region', { name: openTitle })).toBeVisible();

  // ---- ⑥ `今日` ボタンで §3.1 のビューへ戻る ----
  await page.goto('/waiting?date=' + YESTERDAY);
  await expect(todayButton(page)).toBeVisible();
  await todayButton(page).click();
  await expect(page).toHaveURL('/waiting');
  await expect(cardOf(page, openTitle).getByRole('button', { name: '✅ 承認' })).toBeVisible();
  await expect(cardOf(page, pastTitle)).toHaveCount(0);
  // 今日のビューでは戻り導線を出さない（今日にいる画面に「今日」ボタンは要らない）
  await expect(todayButton(page)).toHaveCount(0);
});

// ---- ⑦ 記録の無い日（§3.2-6 の確定文言） ----

test('記録の無い日は「この日に届いたものはありません。」になる', async ({ page }) => {
  await mockOffice(page, '0b83-empty');
  // `?date=` は 0 件でも 200 空配列（28 §3.2）。未来日も拒否されないが、ナビは進めない
  await stubItems(page, { [TODAY]: [] });

  await page.goto('/waiting?date=' + shiftDate(TODAY, -30));

  await expect(page.getByText('この日に届いたものはありません。')).toBeVisible();
  // 今日のビューの空文言（25 §3.2）は出さない——過去日は「確認待ち」の画面ではない
  await expect(page.getByText('確認待ちはありません。')).toHaveCount(0);
  await expect(page.getByRole('region')).toHaveCount(0);
});

// ---- §6 不正な date と `?date=` の障害 ----

test('不正な date は「不正な日付」＋今日へ戻る導線になる', async ({ page }) => {
  await mockOffice(page, '0b83-invalid');
  await stubItems(page, { [TODAY]: [] });

  await page.goto('/waiting?date=2026-02-31');

  await expect(page.getByText('不正な日付')).toBeVisible();
  await expect(page.getByRole('link', { name: '今日へ' })).toBeVisible();
  // 取得へは行かない（一覧も日付ナビも出さない）
  await expect(page.getByRole('region')).toHaveCount(0);
  await expect(prevButton(page)).toHaveCount(0);
});

test('過去日の `?date=` が 500 のときはバナーを出し、0件と言い切らない', async ({ page }) => {
  await mockOffice(page, '0b83-error');
  await stubItems(page, { [YESTERDAY]: null, [TODAY]: [] });

  await page.goto('/waiting?date=' + YESTERDAY);

  await expect(page.locator('.banner[role="alert"]').first()).toContainText(
    '履歴の読み出しに失敗しました',
  );
  await expect(page.getByText('この日に届いたものはありません。')).toHaveCount(0);
});

// ---- 実 API（配線ごと通す・スクリーンショット） ----

/** 1送信元・1業務日ぶんを投入する（過去日も投入できる・docs/specs/24-inbox.md §3.1） */
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

test('実 API の `?date=` を過去日ビューが描く（決めた行・未決の行が状態表示で並ぶ）', async ({
  page,
  request,
}) => {
  // 他テストが触らない業務日を使う（fullyParallel。hn6.1 は 2026-09-02・hn6.2 は 2026-08-04）
  const date = '2026-05-12';
  const source = '0b83-real';
  const readTitle = '0b8.3-7 実データで読み返す朝レポ';
  const approveTitle = '0b8.3-8 実データで承認した提案';
  const openTitle = '0b8.3-9 実データで決めていない提案';

  await mockOffice(page, source);
  await seed(request, source, date, [
    {
      slug: 'morning-report',
      kind: 'read',
      title: readTitle,
      bodyMd: '## 要点\n\n- 決着した行はサーバから読み直す\n- 過去日は読み取り専用',
      refPath: '90_Meta/loop-reports/' + date + '.md',
    },
    { slug: 'insight', kind: 'approve', title: approveTitle },
    { slug: 'later', kind: 'approve', title: openTitle },
  ]);

  // サーバの並びは id 降順（28 §3.1-2）。画面はこれを**再ソートしない**（§4）ので、
  // 期待値はサーバ返却順そのものから作る
  const seeded = (await itemsOf(request, '/api/inbox/items?date=' + date)).filter(
    (item) => item.source === source,
  );
  expect(seeded).toHaveLength(3);
  expect(seeded.map((item) => item.id)).toEqual([...seeded.map((item) => item.id)].sort((a, b) => b - a));
  expect(new Set(seeded.map((item) => item.title))).toEqual(
    new Set([openTitle, approveTitle, readTitle]),
  );

  for (const item of seeded) {
    if (item.title === openTitle) continue;
    const decision = await request.post('/api/inbox/items/' + item.id + '/decision', {
      data: { status: item.kind === 'read' ? 'read' : 'approved' },
    });
    expect(decision.status(), await decision.text()).toBe(200);
  }

  await page.goto('/waiting?date=' + date);
  await expect(cardOf(page, readTitle)).toBeVisible();

  // id 降順の1列（サーバ返却順のまま）
  expect(await cardOrder(page)).toEqual(seeded.map((item) => item.title));
  await expect(cardOf(page, openTitle)).toContainText('未決');
  await expect(cardOf(page, approveTitle)).toContainText('✅ 承認');
  await expect(cardOf(page, readTitle)).toContainText('📄 読んだ');
  // 未決の行にも決定ボタンは出ない（決めるのは今日のビュー・§3.2-2）
  await expect(cardOf(page, openTitle).getByRole('button', { name: '✅ 承認' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '取り消す' })).toHaveCount(0);

  const titleButton = cardOf(page, readTitle).getByRole('button', { name: readTitle });
  await titleButton.click();
  await expect(cardOf(page, readTitle).getByText('過去日は読み取り専用')).toBeVisible();

  await page.screenshot({
    path: 'test-results/screens/cerebellum-0b8.3-waiting-past.png',
    fullPage: true,
  });
});
