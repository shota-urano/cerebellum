import { expect, test, type Locator, type Page } from '@playwright/test';

// cerebellum-y7o.1 [Frontend] 「今日」画面の段の並び替え（docs/specs/30-web-today-order.md）
//
// 受け入れ基準:
//   ① `/` が上から 計器盤 → WAITING → LEARNING → TASKS の順で描かれる（§3.1）
//   ② 390px の最初の viewport に計器盤と WAITING の kind 別4件数が入る（§3.2）
//   ③ 確認待ちに異常があるとき計器盤右端に赤点が出て、日課の進捗・ALL CLEAR は変わらない（§3.1）
//   ④ 全完了時の ALL CLEAR とタスク0件の EmptyState が TASKS の直上に出る（§3.1）
//   ⑤ `/api/days/today` の失敗でエラーバナーが最上部に出て、WAITING・LEARNING は描かれ続ける（§6）
//   ⑥ `/history`（過去日）の並びと読み取り専用ヘッダが無変更（§3.3・docs/specs/09 §3）
//   ⑦ `useDay('today')` の fetch が1回に束ねられている（§4）
//
// **順序は必ず DOM 上の実際の y 座標で確かめる**——要素の存在確認だけでは並び替えの
// 誤実装（元の順に戻した・ALL CLEAR を計器盤直下へ移した・バナーを下段へ移した）が素通りする。
//
// 4つの入力（日課・学習・受信・名簿）と「いま」はすべて固定する（hn6.3 と同じ方針。
// どれか1つでも実データだと期待値が作れない）。

/** 固定する「いま」。2026-09-02 は**水曜**（`shift.days` の曜日判定に使う） */
const TODAY = '2026-09-02';
const YESTERDAY = '2026-09-01';
/** ローカルタイムの正午（日付境界は深夜0時・ローカルタイム。docs/specs/00-overview.md §4） */
const NOON = new Date(2026, 8, 2, 12, 0, 0);

// ---- 日課（docs/specs/03-api.md §3 の DayResponse） ----

type TaskSeed = { id: string; content: string; done: boolean };

function dayJson(tasks: TaskSeed[], date = TODAY, readonly = false) {
  return {
    date,
    weekday: '水',
    readonly,
    progress: { done: tasks.filter((task) => task.done).length, total: tasks.length },
    tasks: tasks.map((task) => ({
      id: task.id,
      time: '07:00',
      effort: '5m',
      tool: '-',
      content: task.content,
      done: task.done,
      checkedAt: task.done ? date + 'T07:05:00+09:00' : null,
      detailRef: null,
    })),
  };
}

/** 1件残っている日＝ALL CLEAR は出ない（並びを測るときの既定） */
const OPEN_DAY: TaskSeed[] = [
  { id: TODAY + '#1', content: '朝の散歩', done: true },
  { id: TODAY + '#2', content: '夜のふりかえり', done: false },
];

/**
 * 実寸に近い日課（docs/specs/08 §3 の例が `2 / 9`）。**ファーストビューの検証はこれで測る**
 * ——2件しか無い日だと旧並び（TASKS が上）でも折り目に収まってしまい、条件が効いているか
 * 分からない（2026-09-03 に誤実装注入で実測）。
 */
const FULL_DAY: TaskSeed[] = Array.from({ length: 9 }, (_, i) => ({
  id: TODAY + '#' + (i + 1),
  content: '日課 ' + (i + 1) + ' 番目',
  done: i < 2,
}));

/** 全部消し込んだ日（ALL CLEAR が出る条件・docs/design/02-today.md） */
const CLEARED_DAY: TaskSeed[] = [
  { id: TODAY + '#1', content: '朝の散歩', done: true },
  { id: TODAY + '#2', content: '夜のふりかえり', done: true },
];

// ---- 学習（docs/specs/15-web-learning.md §2） ----

function learningSetJson() {
  return {
    date: TODAY,
    receivedAt: TODAY + 'T05:00:00+09:00',
    theme: '複利',
    source: 'theme',
    lessonMd: '# 複利\n\n毎日の積み上げ。',
    problems: [
      {
        no: 1,
        kind: 'quiz',
        questionMd: '1.01 の 100 乗は？',
        answerMd: '約 2.7',
        answerType: null,
        expected: null,
        choices: null,
        workdir: null,
      },
    ],
    closingMd: null,
  };
}

function learningResultJson() {
  return {
    date: TODAY,
    grades: [{ no: 1, grade: 'o' }],
    feeling: '手が動いた',
    completedAt: TODAY + 'T07:30:00+09:00',
  };
}

// ---- 受信（docs/specs/03-api.md §3 の InboxSourceSummaryDto） ----

type SummarySeed = {
  source: string;
  latestDate?: string;
  open?: Partial<{ approve: number; choose: number; read: number; alert: number }>;
  failed?: number;
};

function summaryJson(sources: SummarySeed[]) {
  return {
    sources: sources.map((source) => ({
      source: source.source,
      latestDate: source.latestDate ?? TODAY,
      latestReceivedAt: (source.latestDate ?? TODAY) + 'T06:20:00+09:00',
      latestItemCount: 0,
      openCount: { approve: 0, choose: 0, read: 0, alert: 0, ...(source.open ?? {}) },
      failedCount: source.failed ?? 0,
    })),
  };
}

// ---- 画面の掴み方 ----

/** 計器盤ヘッダ（§3.1 の2） */
const headerPanel = (page: Page) => page.locator('.hdr');
const waitingFrame = (page: Page) => page.getByRole('region', { name: 'WAITING' });
const learningFrame = (page: Page) => page.getByRole('region', { name: 'LEARNING' });
/** TASKS 一覧パネル（ヘッダ行を持つ枠。§3.1 の6） */
const tasksFrame = (page: Page) => page.locator('.panel', { has: page.locator('.list__head', { hasText: 'TASKS' }) });
const allClear = (page: Page) => page.locator('.allclear');
const emptyState = (page: Page) => page.locator('.empty');
/**
 * `ErrorBanner`（docs/specs/07 §6）。**クラスで掴む**——`getByRole('alert')` だけだと
 * Next.js のルートアナウンサ（クライアント遷移で挿入される空の role=alert）を数えてしまう
 * （2026-09-03 実測）。role の宣言自体は属性で確かめる
 */
const errorBanner = (page: Page) => page.locator('.banner[role="alert"]');
/** ヘッダの赤点（§3.1）。押す操作を持たない合図なので role=img で出している */
const redDot = (page: Page) => page.getByRole('img', { name: '確認待ちに異常があります' });

/** WAITING の kind 別件数の1つ（`⚠ 異常` / `承認` / `選択` / `読む`・25 §3.1 の確定文言） */
function chip(page: Page, label: string): Locator {
  return waitingFrame(page).getByRole('link').filter({ hasText: label });
}

/** 縦位置（上端 y）。並びの検証はこれで行う——存在確認では並び替えの誤りが通ってしまう */
async function topOf(locator: Locator): Promise<number> {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return box?.y ?? Number.NaN;
}

async function bottomOf(locator: Locator): Promise<number> {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return (box?.y ?? Number.NaN) + (box?.height ?? Number.NaN);
}

type Options = {
  tasks?: TaskSeed[];
  /** `/api/days/today` が落ちる（§6） */
  dayDown?: boolean;
  /** `POST /api/days/today/checks/{taskId}` が落ちる（08 §6 のロールバック＋バナー） */
  checkDown?: boolean;
  summary?: SummarySeed[];
  /** 名簿（office.json）。未着行を出したいときだけ渡す */
  employees?: unknown[];
};

/** 4つの入力と「いま」を固定してから「今日」を開く。 */
async function openToday(page: Page, options: Options = {}) {
  await page.clock.setFixedTime(NOON);

  await page.route(
    (url) => url.pathname === '/api/days/today',
    (route) =>
      options.dayDown
        ? route.fulfill({ status: 500, json: { error: { code: 'internal', message: 'DB エラー' } } })
        : route.fulfill({ json: dayJson(options.tasks ?? OPEN_DAY) }),
  );

  // 消し込みの POST（docs/specs/03 §2）。既定は素通しさせず、落とすときだけ差し替える
  if (options.checkDown) {
    await page.route(
      (url) => url.pathname.startsWith('/api/days/today/checks/'),
      (route) =>
        route.fulfill({
          status: 500,
          json: { error: { code: 'internal', message: 'チェックを保存できませんでした' } },
        }),
    );
  }

  // 学習は「届いて解いた」を既定にする（LEARNING の状態は本タスクの対象外・§3.3）
  await page.route(
    (url) => url.pathname === '/api/learning/sets/today',
    (route) => route.fulfill({ json: learningSetJson() }),
  );
  await page.route(
    (url) => url.pathname === '/api/learning/sets/today/result',
    (route) => route.fulfill({ json: learningResultJson() }),
  );

  await page.route(
    (url) => url.pathname === '/api/inbox/summary',
    (route) => route.fulfill({ json: summaryJson(options.summary ?? []) }),
  );

  await page.route('**/office.json', (route) =>
    route.fulfill({
      json: { generated_at: null, window_days: 14, employees: options.employees ?? [], runs: [] },
    }),
  );

  await page.goto('/');
}

// ---- ① 並び（§3.1 の表） ----

test('「今日」は上から 計器盤 → WAITING → LEARNING → TASKS の順に並ぶ', async ({ page }) => {
  await openToday(page, {
    summary: [
      { source: 'night-harness', open: { approve: 2, read: 1 } },
      { source: 'daily-harness', open: { choose: 1 } },
    ],
  });

  // 4枠すべてが描かれている（中身は 08・15・25 のまま・§3.3）
  await expect(headerPanel(page)).toBeVisible();
  await expect(waitingFrame(page)).toBeVisible();
  await expect(learningFrame(page)).toBeVisible();
  await expect(page.getByRole('button', { name: /朝の散歩/ })).toBeVisible();

  // **実際の縦位置**で並びを測る（§3.1）
  const header = await topOf(headerPanel(page));
  const waiting = await topOf(waitingFrame(page));
  const learning = await topOf(learningFrame(page));
  const tasks = await topOf(tasksFrame(page));

  expect(header).toBeLessThan(waiting);
  expect(waiting).toBeLessThan(learning);
  expect(learning).toBeLessThan(tasks);

  // DOM の並びも同じ（描画順と読み上げ順がずれていないこと）
  const order = await page.evaluate(() => {
    const marks = ['.hdr', '.wt__strip', '.lx__today', '.panel.stack'];
    const nodes = Array.from(document.querySelectorAll('main *'));
    return marks
      .map((mark) => ({ mark, index: nodes.findIndex((node) => node.matches(mark)) }))
      .filter((entry) => entry.index >= 0)
      .sort((a, b) => a.index - b.index)
      .map((entry) => entry.mark);
  });
  expect(order).toEqual(['.hdr', '.wt__strip', '.lx__today', '.panel.stack']);

  await page.screenshot({ path: 'test-results/screens/cerebellum-y7o.1-today.png', fullPage: true });
});

// ---- ② ファーストビュー（§3.2） ----

test('390px の最初の viewport に計器盤と WAITING の kind 別4件数が入る', async ({ page }) => {
  await openToday(page, {
    // 実寸に近い9件の日課で測る（2件の日なら旧並びでも収まってしまう）
    tasks: FULL_DAY,
    summary: [{ source: 'night-harness', open: { approve: 3, choose: 1, read: 4 } }],
  });

  const viewport = page.viewportSize();
  expect(viewport?.width).toBe(390);
  const fold = viewport?.height ?? 0;

  // スクロールしていない状態で測る（goto 直後だが明示する）
  await page.evaluate(() => window.scrollTo(0, 0));

  // 計器盤は丸ごと入る
  expect(await bottomOf(headerPanel(page))).toBeLessThanOrEqual(fold);

  // kind 別4件数（`⚠ 異常` / `承認` / `選択` / `読む`）が4つとも折り目より上にある
  const labels = ['⚠ 異常', '承認', '選択', '読む'];
  for (const label of labels) {
    const count = chip(page, label);
    await expect(count).toBeVisible();
    expect(await bottomOf(count)).toBeLessThanOrEqual(fold);
  }

  // 折り目より上に4件数が「見えている」ことの二重確認（重なりや 0 高さで通らないように）
  await expect(waitingFrame(page).getByRole('link')).toHaveCount(4);
  // TASKS はスクロールの先でよい（旧条件「第1段のファーストビューを侵食しない」は破棄・§3.2）
  expect(await topOf(tasksFrame(page))).toBeGreaterThan(0);
});

// ---- ③ 赤点と進捗・ALL CLEAR の独立（§3.1） ----

test('確認待ちに異常があると計器盤右端に赤点が出るが、進捗と ALL CLEAR は変わらない', async ({
  page,
}) => {
  // 1つのフィクスチャで「赤点が出る」と「進捗・ALL CLEAR が変わらない」を同時に見る
  await openToday(page, {
    tasks: CLEARED_DAY,
    summary: [
      { source: 'night-harness', open: { alert: 3 }, failed: 2 },
      { source: 'routine_watchdog', latestDate: YESTERDAY, open: { alert: 1 } },
    ],
  });

  // 赤点は計器盤の中（右端の CLEARED ラベル行）に出る
  await expect(redDot(page)).toBeVisible();
  await expect(page.locator('.hdr .hdr__alert')).toHaveCount(1);

  // 日課の進捗は AI 側の異常に影響されない（§3.1・25 §3.1）
  await expect(page.locator('.hdr__count')).toHaveText('2 / 2');
  await expect(page.locator('.hdr__foot')).toContainText('PROGRESS 100%');
  await expect(page.locator('.hdr__foot')).toContainText('REMAINING 0');

  // ALL CLEAR も出たまま（判定は日課の done === total > 0 だけ）
  await expect(allClear(page)).toBeVisible();
  await expect(page.getByText('本日のタスクはすべて消し込み済みです')).toBeVisible();
  // 異常の件数は WAITING に出ている（画面が空でないことの確認）
  await expect(chip(page, '⚠ 異常').locator('.wt__chip__n')).toHaveText('4');

  // 逆向き: 異常が0件なら赤点は消え、ALL CLEAR は残る
  await openToday(page, {
    tasks: CLEARED_DAY,
    summary: [{ source: 'night-harness', open: { approve: 5, choose: 2, read: 9 } }],
  });
  await expect(allClear(page)).toBeVisible();
  await expect(redDot(page)).toHaveCount(0);
});

// ---- ④ ALL CLEAR / EmptyState は TASKS の直上（§3.1） ----

test('全完了時の ALL CLEAR は LEARNING より下・TASKS の直上に出る', async ({ page }) => {
  await openToday(page, { tasks: CLEARED_DAY, summary: [{ source: 'night-harness' }] });

  const learning = await bottomOf(learningFrame(page));
  const clearTop = await topOf(allClear(page));
  const clearBottom = await bottomOf(allClear(page));
  const tasksTop = await topOf(tasksFrame(page));

  // 計器盤の直下（画面最上部）ではない——日課の一覧に対する状態表示なので一覧と離さない
  expect(clearTop).toBeGreaterThan(learning);
  // TASKS の**直上**（間に他の枠が入らない。TaskList の marginTop 18px ぶんだけ空く）
  expect(tasksTop).toBeGreaterThan(clearBottom);
  expect(tasksTop - clearBottom).toBeLessThanOrEqual(24);
});

test('タスク0件の EmptyState も LEARNING より下（TASKS の位置）に出る', async ({ page }) => {
  await openToday(page, { tasks: [], summary: [{ source: 'night-harness' }] });

  await expect(emptyState(page)).toHaveText('今日のタスクはありません');
  // 0件なので TASKS 一覧そのものは無い。EmptyState がその位置に立つ
  await expect(tasksFrame(page)).toHaveCount(0);
  expect(await topOf(emptyState(page))).toBeGreaterThan(await bottomOf(learningFrame(page)));
  // WAITING・LEARNING は普通に描かれる（日課が0件でも他の枠は止めない）
  await expect(waitingFrame(page)).toBeVisible();
  await expect(learningFrame(page)).toBeVisible();
});

// ---- ⑤ 日課の取得失敗（§6） ----

test('`/api/days/today` が落ちてもエラーバナーは最上部・WAITING と LEARNING は描かれ続ける', async ({
  page,
}) => {
  await openToday(page, {
    dayDown: true,
    summary: [{ source: 'night-harness', open: { approve: 2 } }],
  });

  const banner = errorBanner(page).first();
  await expect(banner).toContainText('DB エラー');

  // 最上部（§6）。WAITING より上に出る——並び替えでも「まず異常が目に入る」位置は変えない
  const bannerTop = await topOf(banner);
  const waitingTop = await topOf(waitingFrame(page));
  const learningTop = await topOf(learningFrame(page));
  expect(bannerTop).toBeLessThan(waitingTop);
  expect(bannerTop).toBeLessThan(learningTop);

  // 枠ごとに独立（§6）。日課が読めないだけで他の2枠を止めない
  await expect(chip(page, '承認').locator('.wt__chip__n')).toHaveText('2');
  await expect(learningFrame(page)).toContainText('済 ○1 △0 ×0');

  // 永久スケルトンにしない（08 §6）。計器盤・TASKS は出さずバナーだけ
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  await expect(headerPanel(page)).toHaveCount(0);
  await expect(tasksFrame(page)).toHaveCount(0);
});

test('トグル POST が失敗したときもエラーバナーは最上部・行はロールバックされる', async ({
  page,
}) => {
  // 割る前は `DayView` が `error ?? toggleError` を最上部に1枚出していた。トグルを撃つのは
  // `DayTasks`（下段）になったが、**表示位置は変えない**（30 §5・§6。合図は feature 内で渡す）
  await openToday(page, {
    checkDown: true,
    summary: [{ source: 'night-harness', open: { approve: 2 } }],
  });

  const row = page.getByRole('button', { name: /夜のふりかえり/ });
  await expect(row).toHaveAttribute('aria-pressed', 'false');
  await row.click();

  const banner = errorBanner(page).first();
  await expect(banner).toContainText('チェックを保存できませんでした');

  // WAITING・LEARNING を跨いだ**最上部**に出る（下段の一覧の直上ではない）
  const bannerTop = await topOf(banner);
  expect(bannerTop).toBeLessThan(await topOf(waitingFrame(page)));
  expect(bannerTop).toBeLessThan(await topOf(learningFrame(page)));
  expect(bannerTop).toBeLessThan(await topOf(headerPanel(page)));

  // optimistic 表示はロールバックされ、進捗も元に戻る（08 §6）
  await expect(row).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.hdr__count')).toHaveText('1 / 2');
  // 他の枠は止まらない
  await expect(chip(page, '承認').locator('.wt__chip__n')).toHaveText('2');
});

test('POST の応答が届く前に画面を離れたら、その失敗はどの画面にも出ない（漏らさない）', async ({
  page,
}) => {
  // 共有スロット（`DayHeader` と `DayTasks` の合図の受け渡し口）は画面をまたいで生き残るので、
  // **アンマウント後の書き込みを抑止しているか**をここで測る。割る前は component state で、
  // 離脱後の `catch` は誰にも見えなかった——その挙動を保てているかの検証。

  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let settle: () => void = () => {};
  const settled = new Promise<void>((resolve) => {
    settle = resolve;
  });

  // 応答を握ったまま止めておく（遷移してから 500 を返す）
  await page.route(
    (url) => url.pathname.startsWith('/api/days/today/checks/'),
    async (route) => {
      await gate;
      await route.fulfill({
        status: 500,
        json: { error: { code: 'internal', message: 'チェックを保存できませんでした' } },
      });
      settle();
    },
  );

  await openToday(page, { summary: [{ source: 'night-harness', open: { approve: 2 } }] });

  const row = page.getByRole('button', { name: /夜のふりかえり/ });
  await row.click();
  // optimistic 表示だけが先に動く（応答はまだ来ていない）
  await expect(row).toHaveAttribute('aria-pressed', 'true');

  // 応答を待たずに LEARNING へ。Link のクライアント遷移なので、SWR のキャッシュは生きたまま
  // `DayHeader` / `DayTasks` だけがアンマウントされる（リロードすると検証にならない）
  await learningFrame(page).getByRole('link').click();
  await page.waitForURL((url) => url.pathname.replace(/\/+$/, '') === '/learning');

  // ここで 500 が届く（= cleanup の後に `catch` が走る）
  release();
  await settled;

  // 遷移先には出さない（`learning` の `useToggleCheck` はこのスロットを読まない）
  await expect(errorBanner(page)).toHaveCount(0);
  await expect(page.getByText('チェックを保存できませんでした')).toHaveCount(0);

  // 「今日」へ戻しても出さない（離脱後の書き込みを抑止していないと、ここで最上部に出る）
  await page.goBack();
  await page.waitForURL((url) => url.pathname.replace(/\/+$/, '') === '');
  await expect(headerPanel(page)).toBeVisible();
  await expect(errorBanner(page)).toHaveCount(0);
  await expect(page.getByText('チェックを保存できませんでした')).toHaveCount(0);
  // ロールバックも効いている（押した行は元に戻る）
  await expect(row).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.hdr__count')).toHaveText('1 / 2');
});

// ---- ⑥ 過去日は無変更（§3.3・docs/specs/09 §3） ----

test('`/history` の過去日は読み取り専用ヘッダ → 一覧のまま（WAITING・LEARNING を挟まない）', async ({
  page,
}) => {
  await page.clock.setFixedTime(NOON);
  await page.route(
    (url) => url.pathname === '/api/days/today',
    (route) => route.fulfill({ json: dayJson(OPEN_DAY) }),
  );
  // 履歴側の2つのデータ源（docs/specs/09 §3）も固定する——実データだとバナーの有無がぶれる
  await page.route(
    (url) => url.pathname === '/api/summary',
    (route) => route.fulfill({ json: { days: [] } }),
  );
  await page.route(
    (url) => url.pathname === '/api/days/' + YESTERDAY,
    (route) =>
      route.fulfill({
        json: dayJson(
          [
            { id: YESTERDAY + '#1', content: '朝の散歩', done: true },
            { id: YESTERDAY + '#2', content: '夜のふりかえり', done: false },
          ],
          YESTERDAY,
          true,
        ),
      }),
  );

  await page.goto('/history?date=' + YESTERDAY);

  // 読み取り専用ヘッダ（`ReadonlyHead`）が計器盤の代わりに出る
  const readonlyHead = page.locator('.ro');
  await expect(readonlyHead).toContainText('読み取り専用');
  await expect(readonlyHead).toContainText('1 / 2');
  await expect(headerPanel(page)).toHaveCount(0);

  // 並びはヘッダ → 一覧のまま。今日の3枠は混ざらない
  const list = page.locator('.panel.stack').first();
  expect(await topOf(readonlyHead)).toBeLessThan(await topOf(list));
  await expect(waitingFrame(page)).toHaveCount(0);
  await expect(learningFrame(page)).toHaveCount(0);
  // 読み取り専用なので TASKS ヘッダ行もトグルも無い（09 §3）
  await expect(page.locator('.list__head', { hasText: 'TASKS' })).toHaveCount(0);
  await expect(list.getByRole('button')).toHaveCount(0);
});

// ---- ⑦ 取得は1回に束ねる（§4） ----

test('`DayHeader` と `DayTasks` が同じ日を引いても `/api/days/today` の取得は1回', async ({
  page,
}) => {
  const requests: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname === '/api/days/today') requests.push(request.method());
  });

  await openToday(page, { summary: [{ source: 'night-harness' }] });

  // 両方が描き終わってから数える（片方だけ描けている状態で数えない）
  await expect(headerPanel(page)).toBeVisible();
  await expect(tasksFrame(page)).toBeVisible();
  await expect(waitingFrame(page)).toBeVisible();
  await expect(learningFrame(page)).toBeVisible();

  expect(requests).toEqual(['GET']);
});
