import { expect, test, type Locator, type Page } from '@playwright/test';

// cerebellum-8p5.6 [Frontend] 「今日」画面の LEARNING 段を2行に
// （docs/specs/31-learning-lanes.md §3.5 ／ docs/specs/25-web-inbox.md §3.1）
//
// 受け入れ基準:
//   ① LEARNING が `本線` → `英語` の順で2行出る（固定順・31 §3.5）
//   ② 各行が `未着` / `未回答` / `済 ○x △y ×z` を**独立に**出す（404 はレーンごと・31 §3.3）
//   ③ 行のタップが `/learning?lane={lane}` へ遷移する（本線はクエリ無し＝省略時が main）
//   ④ 学習の未着が計器盤の赤点に**含まれない**（25 §3.1。2行になっても変えない）
//   ⑤ `/` の段の並び（計器盤 → WAITING → LEARNING → TASKS）が無変更（30 §3.1）
//
// 入力（日課・学習・受信・名簿）と「いま」はすべて固定する（hn6.3・y7o.1 と同じ方針）。
// **学習だけはレーンで応答を出し分ける**——`?lane=` を見ない stub だと「独立に出る」ことを
// 検証できず、両レーンが同じ状態になった画面しか見ないまま通ってしまう。

/** 固定する「いま」。2026-09-02 は水曜 */
const TODAY = '2026-09-02';
/** ローカルタイムの正午（日付境界は深夜0時・ローカルタイム） */
const NOON = new Date(2026, 8, 2, 12, 0, 0);

// ---- 日課（docs/specs/03-api.md §3 の DayResponse） ----

type TaskSeed = { id: string; content: string; done: boolean };

const OPEN_DAY: TaskSeed[] = [
  { id: TODAY + '#1', content: '朝の散歩', done: true },
  { id: TODAY + '#2', content: '夜のふりかえり', done: false },
];

/** 全部消し込んだ日（ALL CLEAR が出る条件。赤点との独立を見るのに使う） */
const CLEARED_DAY: TaskSeed[] = [
  { id: TODAY + '#1', content: '朝の散歩', done: true },
  { id: TODAY + '#2', content: '夜のふりかえり', done: true },
];

function dayJson(tasks: TaskSeed[]) {
  return {
    date: TODAY,
    weekday: '水',
    readonly: false,
    progress: { done: tasks.filter((task) => task.done).length, total: tasks.length },
    tasks: tasks.map((task) => ({
      id: task.id,
      time: '07:00',
      effort: '5m',
      tool: '-',
      content: task.content,
      done: task.done,
      checkedAt: task.done ? TODAY + 'T07:05:00+09:00' : null,
      detailRef: null,
    })),
  };
}

// ---- 学習（レーン別・docs/specs/31-learning-lanes.md §3.3） ----

type Lane = 'main' | 'en';
type GradeSeed = { no: number; grade: 'o' | 'd' | 'x' };

/** そのレーンの状態。`missing`=セット未着（404）／`unanswered`=セットのみ／`done`=成績あり */
type LaneSeed = { kind: 'missing' } | { kind: 'unanswered' } | { kind: 'done'; grades: GradeSeed[] };

function learningSetJson(lane: Lane) {
  return {
    date: TODAY,
    receivedAt: TODAY + 'T05:00:00+09:00',
    theme: lane === 'en' ? '英語 Day 1: 技術記事の読解' : '複利',
    source: 'theme',
    lessonMd: lane === 'en' ? '# English\n\nRead one article.' : '# 複利\n\n毎日の積み上げ。',
    problems: [
      {
        no: 1,
        kind: 'quiz',
        questionMd: lane === 'en' ? 'What does "deprecated" mean?' : '1.01 の 100 乗は？',
        answerMd: lane === 'en' ? '「非推奨」' : '約 2.7',
        answerType: null,
        expected: null,
        choices: null,
        workdir: null,
      },
    ],
    closingMd: null,
  };
}

function learningResultJson(grades: GradeSeed[]) {
  return {
    date: TODAY,
    grades,
    feeling: '手が動いた',
    completedAt: TODAY + 'T07:30:00+09:00',
  };
}

const notFound = (message: string) => ({
  status: 404,
  json: { error: { code: 'not_found', message } },
});

/** `?lane=` を読む（省略時は本線・docs/specs/31-learning-lanes.md §3.1） */
function laneOf(url: string): Lane {
  return new URL(url).searchParams.get('lane') === 'en' ? 'en' : 'main';
}

// ---- 受信（docs/specs/03-api.md §3 の InboxSourceSummaryDto） ----

type SummarySeed = {
  source: string;
  open?: Partial<{ approve: number; choose: number; read: number; alert: number }>;
  failed?: number;
};

function summaryJson(sources: SummarySeed[]) {
  return {
    sources: sources.map((source) => ({
      source: source.source,
      latestDate: TODAY,
      latestReceivedAt: TODAY + 'T06:20:00+09:00',
      latestItemCount: 0,
      openCount: { approve: 0, choose: 0, read: 0, alert: 0, ...(source.open ?? {}) },
      failedCount: source.failed ?? 0,
    })),
  };
}

// ---- 画面の掴み方 ----

/** LEARNING 段（パネル1枚）。行はこの中に2本並ぶ */
const learningPanel = (page: Page) => page.locator('.lx__today');
/** 段の中の n 番目の行（並びの検証に使うので **位置で掴む**） */
const laneRow = (page: Page, index: number) => learningPanel(page).locator('.lx__todayrow').nth(index);
/** 計器盤ヘッダ・WAITING・TASKS（y7o.1 と同じ掴み方） */
const headerPanel = (page: Page) => page.locator('.hdr');
const waitingFrame = (page: Page) => page.getByRole('region', { name: 'WAITING' });
const tasksFrame = (page: Page) =>
  page.locator('.panel', { has: page.locator('.list__head', { hasText: 'TASKS' }) });
const allClear = (page: Page) => page.locator('.allclear');
/** ヘッダの赤点（25 §3.1）。押す操作を持たない合図なので role=img で出している */
const redDot = (page: Page) => page.getByRole('img', { name: '確認待ちに異常があります' });

/** 縦位置（上端 y）。並びの検証はこれで行う——存在確認では並びの誤りが通ってしまう */
async function topOf(locator: Locator): Promise<number> {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return box?.y ?? Number.NaN;
}

type Options = {
  tasks?: TaskSeed[];
  /** レーン別の状態。既定は両方 `missing`（＝ night-study が落ちた日） */
  main?: LaneSeed;
  en?: LaneSeed;
  summary?: SummarySeed[];
};

const MISSING: LaneSeed = { kind: 'missing' };

/** 入力と「いま」を固定してから「今日」を開く。 */
async function openToday(page: Page, options: Options = {}) {
  await page.clock.setFixedTime(NOON);

  const lanes: Record<Lane, LaneSeed> = {
    main: options.main ?? MISSING,
    en: options.en ?? MISSING,
  };

  await page.route(
    (url) => url.pathname === '/api/days/today',
    (route) => route.fulfill({ json: dayJson(options.tasks ?? OPEN_DAY) }),
  );

  // セットと成績は**レーンごとに独立**（同じ日に本線と英語が別々の状態を取る・31 §3.3）
  await page.route(
    (url) => url.pathname === '/api/learning/sets/today',
    (route) => {
      const seed = lanes[laneOf(route.request().url())];
      return seed.kind === 'missing'
        ? route.fulfill(notFound('学習セットが未取り込みです'))
        : route.fulfill({ json: learningSetJson(laneOf(route.request().url())) });
    },
  );
  await page.route(
    (url) => url.pathname === '/api/learning/sets/today/result',
    (route) => {
      const seed = lanes[laneOf(route.request().url())];
      return seed.kind === 'done'
        ? route.fulfill({ json: learningResultJson(seed.grades) })
        : route.fulfill(notFound('成績が未記録です'));
    },
  );

  await page.route(
    (url) => url.pathname === '/api/inbox/summary',
    (route) => route.fulfill({ json: summaryJson(options.summary ?? []) }),
  );

  // 名簿は空（未着判定は出さない。本タスクの対象外・25 §3.3）
  await page.route('**/office.json', (route) =>
    route.fulfill({ json: { generated_at: null, window_days: 14, employees: [], runs: [] } }),
  );

  await page.goto('/');
  await expect(headerPanel(page)).toBeVisible();
}

// ---- ① 2行・固定順（31 §3.5） ----

test('LEARNING は `本線` → `英語` の順で2行出る', async ({ page }) => {
  await openToday(page, {
    main: { kind: 'done', grades: [{ no: 1, grade: 'o' }] },
    en: { kind: 'unanswered' },
    summary: [{ source: 'night-harness', open: { approve: 2 } }],
  });

  // 段は1つ・行が2本（段を2つに割らない）
  await expect(learningPanel(page)).toHaveCount(1);
  await expect(learningPanel(page).locator('.lx__todayrow')).toHaveCount(2);

  // 並びは main → en の固定順。**実際の縦位置**でも確かめる
  await expect(laneRow(page, 0)).toContainText('本線');
  await expect(laneRow(page, 1)).toContainText('英語');
  expect(await topOf(laneRow(page, 0))).toBeLessThan(await topOf(laneRow(page, 1)));

  // 見出しは段に1つだけ（行ごとに見出しを生やさない）
  await expect(learningPanel(page).locator('.list__head')).toHaveCount(1);
  await expect(learningPanel(page).locator('.list__head')).toContainText('LEARNING');

  await page.screenshot({
    path: 'test-results/screens/cerebellum-8p5.6-today.png',
    fullPage: true,
  });
});

// ---- ② 状態は行ごとに独立（25 §3.1 の判定は据え置き・31 §3.3） ----

test('本線が届いて英語が届かない日は、英語の行だけが「未着」になる', async ({ page }) => {
  await openToday(page, {
    main: { kind: 'done', grades: [{ no: 1, grade: 'o' }] },
    en: MISSING,
  });

  await expect(laneRow(page, 0)).toContainText('済 ○1 △0 ×0');
  await expect(laneRow(page, 1)).toContainText('未着');

  // 異常様式（左辺 error 色）が付くのは未着の行だけ
  await expect(laneRow(page, 0)).not.toHaveClass(/lx__todayrow--bad/);
  await expect(laneRow(page, 1)).toHaveClass(/lx__todayrow--bad/);
});

test('英語だけ届いた日は、本線が「未着」・英語が「未回答」になる', async ({ page }) => {
  // セットが無い日は result も 404 になる。**セットの 404 を先に見る**規則が
  // レーンごとに効いていないと、本線の未着が「未回答」に化ける（25 §3.1）
  await openToday(page, { main: MISSING, en: { kind: 'unanswered' } });

  await expect(laneRow(page, 0)).toContainText('未着');
  await expect(laneRow(page, 1)).toContainText('未回答');
  await expect(laneRow(page, 0)).toHaveClass(/lx__todayrow--bad/);
  await expect(laneRow(page, 1)).not.toHaveClass(/lx__todayrow--bad/);
});

test('両方が記録済みの日は、行ごとに自分の ○△× の内訳を出す', async ({ page }) => {
  await openToday(page, {
    main: {
      kind: 'done',
      grades: [
        { no: 1, grade: 'o' },
        { no: 2, grade: 'o' },
        { no: 3, grade: 'd' },
        { no: 4, grade: 'x' },
      ],
    },
    en: { kind: 'done', grades: [{ no: 1, grade: 'x' }] },
  });

  await expect(laneRow(page, 0)).toContainText('済 ○2 △1 ×1');
  await expect(laneRow(page, 1)).toContainText('済 ○0 △0 ×1');
});

// ---- ③ タップ先（31 §3.5） ----

test('行のタップ先は本線 `/learning`・英語 `/learning?lane=en`', async ({ page }) => {
  await openToday(page, { main: { kind: 'unanswered' }, en: { kind: 'unanswered' } });

  await expect(laneRow(page, 0)).toHaveAttribute('href', '/learning');
  await expect(laneRow(page, 1)).toHaveAttribute('href', '/learning?lane=en');

  // 英語の行から英語レーンのセッションへ行ける（レーン間の移動はこの段を経由する・31 §3.4）
  await laneRow(page, 1).click();
  await page.waitForURL((url) => url.pathname.replace(/\/+$/, '') === '/learning');
  expect(new URL(page.url()).searchParams.get('lane')).toBe('en');

  // 本線の行はクエリを付けない（省略時が main）
  await page.goBack();
  await laneRow(page, 0).click();
  await page.waitForURL((url) => url.pathname.replace(/\/+$/, '') === '/learning');
  expect(new URL(page.url()).searchParams.get('lane')).toBeNull();
});

// ---- ④ 学習の未着は計器盤の赤点に含めない（25 §3.1） ----

test('2レーンとも未着でも計器盤に赤点は出ない（進捗・ALL CLEAR も変わらない）', async ({
  page,
}) => {
  // 学習は両方 404（night-study が落ちた日）。確認待ちの異常は0件
  await openToday(page, {
    tasks: CLEARED_DAY,
    summary: [{ source: 'night-harness', open: { approve: 5, choose: 2, read: 9 } }],
  });

  // 2行とも未着＝異常様式は2本出る（気づくための合図は出す）
  await expect(learningPanel(page).locator('.lx__todayrow--bad')).toHaveCount(2);

  // それでも赤点は点かない——常時点灯すると WAITING の異常の合図が死ぬ
  await expect(redDot(page)).toHaveCount(0);
  await expect(page.locator('.hdr .hdr__alert')).toHaveCount(0);

  // 日課の進捗・ALL CLEAR も学習に影響されない
  await expect(page.locator('.hdr__count')).toHaveText('2 / 2');
  await expect(allClear(page)).toBeVisible();

  // 逆向き: 確認待ちに異常があれば赤点は出る（赤点の計算そのものは無変更）
  await openToday(page, {
    tasks: CLEARED_DAY,
    summary: [{ source: 'night-harness', open: { alert: 1 } }],
  });
  await expect(learningPanel(page).locator('.lx__todayrow--bad')).toHaveCount(2);
  await expect(redDot(page)).toBeVisible();
});

// ---- ⑤ 段の並びは無変更（30 §3.1） ----

test('段の並びは 計器盤 → WAITING → LEARNING → TASKS のまま（2行になっても動かない）', async ({
  page,
}) => {
  await openToday(page, {
    main: { kind: 'done', grades: [{ no: 1, grade: 'o' }] },
    en: MISSING,
    summary: [{ source: 'night-harness', open: { approve: 2, read: 1 } }],
  });

  const header = await topOf(headerPanel(page));
  const waiting = await topOf(waitingFrame(page));
  const learning = await topOf(learningPanel(page));
  const tasks = await topOf(tasksFrame(page));

  expect(header).toBeLessThan(waiting);
  expect(waiting).toBeLessThan(learning);
  expect(learning).toBeLessThan(tasks);

  // 2本の行はどちらも LEARNING 段の中（TASKS を押し下げても段をまたがない）
  expect(await topOf(laneRow(page, 1))).toBeLessThan(tasks);
});
