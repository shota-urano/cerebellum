import { expect, test, type Locator, type Page } from '@playwright/test';

// cerebellum-hn6.3 [Frontend] 「今日」の3段構成（docs/specs/25-web-inbox.md §3.1）
// 受け入れ基準:
//   学習の未着/未回答/済の3状態 / kind 別件数（4つ） / 未着行 /
//   赤点の有無（異常0件で消える） / 第1段の ALL CLEAR が第3段の異常に影響されないこと
//
// 3段はそれぞれ別の入れ物（日課・学習・人間待ち項目）を読むので、**4つの入力すべてを固定する**
// （どれか1つでも実データだと期待値が作れない。hn6.1 / hn6.2 と同じ方針）:
//   - 日課（GET /api/days/today）… ALL CLEAR は done === total > 0 でしか出ないので固定応答
//   - 学習（GET /api/learning/sets/today と .../result）… 404 が「まだ無い」の正常な答え
//     （docs/specs/14-learning.md §6）なので、3状態は 404 の出し方で作る
//   - 受信（GET /api/inbox/summary）… fullyParallel で他テストの投入が混ざるので固定応答
//   - 名簿（office.json）… :48310 の静的サーバが配信する外部データなので page.route で差し替え
//   - 「いま」… **端末の時計は触らない**。page.clock.setFixedTime でブラウザ内の Date だけ固定
//
// 未着判定そのもの（cadence / 曜日 / 時刻の3条件）は hn6.2 が持つ。ここでは「今日」第3段に
// 出ることだけを見る。

/** 固定する「いま」。2026-09-02 は**水曜**（`shift.days` の曜日判定に使う） */
const TODAY = '2026-09-02';
const YESTERDAY = '2026-09-01';
/** ローカルタイムの正午（日付境界は深夜0時・ローカルタイム。docs/specs/00-overview.md §4） */
const NOON = new Date(2026, 8, 2, 12, 0, 0);

// ---- 第1段: 日課（docs/specs/03-api.md §3 の DayResponse） ----

type TaskSeed = { id: string; content: string; done: boolean };

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

/** 既定の日課。1件だけ残しておく＝ALL CLEAR は出ない（第1段の独立性を測る対照） */
const OPEN_DAY: TaskSeed[] = [
  { id: TODAY + '#1', content: '朝の散歩', done: true },
  { id: TODAY + '#2', content: '夜のふりかえり', done: false },
];

/** 全部消し込んだ日（ALL CLEAR が出る条件・docs/design/02-today.md） */
const CLEARED_DAY: TaskSeed[] = [
  { id: TODAY + '#1', content: '朝の散歩', done: true },
  { id: TODAY + '#2', content: '夜のふりかえり', done: true },
];

// ---- 第2段: 学習（docs/specs/15-web-learning.md §2） ----

/** 学習セットの最小形（第2段は状態1行だけなので問題は1問で足りる） */
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

type GradeSeed = { no: number; grade: 'o' | 'd' | 'x' };

function learningResultJson(grades: GradeSeed[]) {
  return {
    date: TODAY,
    grades,
    feeling: '手が動いた',
    completedAt: TODAY + 'T07:30:00+09:00',
  };
}

/** 未取り込み・未記録は 404 `not_found`（docs/specs/03-api.md §4 のエラー本体） */
function notFound(message: string) {
  return { status: 404, json: { error: { code: 'not_found', message } } };
}

// ---- 第3段: 受信（docs/specs/03-api.md §3 の InboxSourceSummaryDto） ----

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

// ---- 名簿（docs/specs/20-web-office.md §2） ----

type Employee = {
  automation_id: string;
  name: string;
  skill: string | null;
  enabled: boolean;
  shift: { hour: number; minute: number; days: string; label: string } | null;
  next_run_at: null;
  last_run_at: null;
  last_run_id: null;
  profile: {
    job: string;
    command: null;
    checks: null;
    doc: null;
    review?: { kinds: string[]; cadence: string };
  } | null;
};

/** `cadence: shift` の社員（未着判定の対象・docs/specs/25-web-inbox.md §3.3-1） */
function employee(options: { skill: string; name: string; hour?: number; minute?: number }): Employee {
  const hour = options.hour ?? 6;
  const minute = options.minute ?? 20;
  const label = '毎日 ' + String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0');
  return {
    automation_id: 'a-' + options.skill,
    name: options.name,
    skill: options.skill,
    enabled: true,
    shift: { hour, minute, days: '毎日', label },
    next_run_at: null,
    last_run_at: null,
    last_run_id: null,
    profile: {
      job: '人間の確認を待ちます',
      command: null,
      checks: null,
      doc: null,
      review: { kinds: ['alert'], cadence: 'shift' },
    },
  };
}

/** 期待する未着の1行（§3.3-3 の固定書式） */
const missingLine = (employeeItem: Employee) =>
  '未着: ' + employeeItem.name + '（' + (employeeItem.shift?.label ?? '') + ' 予定）';

// ---- 画面の掴み方 ----

const learningStage = (page: Page) => page.getByRole('region', { name: 'LEARNING' });
const waitingStage = (page: Page) => page.getByRole('region', { name: 'WAITING' });
const missingFrame = (page: Page) => page.getByRole('region', { name: '未着' });
/** ヘッダの赤点（§3.1）。押す操作を持たない合図なので role=img で出している */
const redDot = (page: Page) => page.getByRole('img', { name: '確認待ちに異常があります' });

/** 第3段の kind 別件数の1つ（`⚠ 異常` / `承認` / `選択` / `読む`・§3.1 の確定文言） */
function chip(page: Page, label: string): Locator {
  return waitingStage(page).getByRole('link').filter({ hasText: label });
}

function chipCount(page: Page, label: string): Locator {
  return chip(page, label).locator('.wt__chip__n');
}

type Options = {
  tasks?: TaskSeed[];
  /** 学習セットを届いた扱いにする（既定は 404 ＝未着） */
  set?: boolean;
  /** result を記録済み扱いにする（既定は 404 ＝未回答） */
  grades?: GradeSeed[];
  summary?: SummarySeed[];
  employees?: Employee[];
  /** `/api/inbox/summary` が落ちる（§6） */
  summaryDown?: boolean;
};

/** 4つの入力（日課・学習・受信・名簿）と「いま」を固定してから「今日」を開く。 */
async function openToday(page: Page, options: Options = {}) {
  await page.clock.setFixedTime(NOON);

  await page.route(
    (url) => url.pathname === '/api/days/today',
    (route) => route.fulfill({ json: dayJson(options.tasks ?? OPEN_DAY) }),
  );

  await page.route(
    (url) => url.pathname === '/api/learning/sets/today',
    (route) =>
      options.set
        ? route.fulfill({ json: learningSetJson() })
        : route.fulfill(notFound('学習セットが未取り込みです')),
  );
  await page.route(
    (url) => url.pathname === '/api/learning/sets/today/result',
    (route) =>
      options.grades
        ? route.fulfill({ json: learningResultJson(options.grades) })
        : route.fulfill(notFound('成績が未記録です')),
  );

  await page.route(
    (url) => url.pathname === '/api/inbox/summary',
    (route) =>
      options.summaryDown
        ? route.fulfill({ status: 500, json: { error: { code: 'internal', message: 'DB エラー' } } })
        : route.fulfill({ json: summaryJson(options.summary ?? []) }),
  );

  await page.route('**/office.json', (route) =>
    route.fulfill({
      json: {
        generated_at: null,
        window_days: 14,
        employees: options.employees ?? [],
        runs: [],
      },
    }),
  );

  await page.goto('/');
  // 第1段が描けたら3段そろって描かれている（第1段は既存・無変更）
  await expect(page.locator('.hdr')).toBeVisible();
}

// ---- 3枠がそろって描かれること ----
//
// **並びの検証は docs/specs/30-web-today-order.md §3.1 へ移った**（2026-09-03。25 §3.1 冒頭の注記）。
// 旧 TASKS → LEARNING → WAITING は 計器盤 → WAITING → LEARNING → TASKS に置き換わったので、
// ここは「3枠が同時に描かれる」ことだけを見る。並び順は `cerebellum-y7o.1.spec.ts` が持つ。

test('「今日」に日課・LEARNING・WAITING の3枠がそろって描かれる', async ({ page }) => {
  const silent = employee({ skill: 'routine_watchdog', name: 'ルーティン監視' });

  await openToday(page, {
    set: true,
    grades: [{ no: 1, grade: 'o' }],
    summary: [
      { source: 'night-harness', open: { approve: 2, read: 1 } },
      { source: 'routine_watchdog', latestDate: YESTERDAY, open: { alert: 1 } },
    ],
    employees: [silent],
  });

  // 日課の枠は既存のまま（docs/specs/25-web-inbox.md §3.1「第1段は無変更」）
  const tasks = page.locator('.list__head').filter({ hasText: 'TASKS' });
  await expect(tasks).toBeVisible();
  await expect(page.getByRole('button', { name: /朝の散歩/ })).toBeVisible();

  // 計器盤・LEARNING・WAITING も同じ1枚に出ている（3種を1枚に集める・§3.1）
  await expect(page.locator('.hdr')).toBeVisible();
  await expect(learningStage(page)).toBeVisible();
  await expect(waitingStage(page)).toBeVisible();

  await page.screenshot({
    path: 'test-results/screens/cerebellum-hn6.3-today.png',
    fullPage: true,
  });
});

// ---- 第2段: 学習の3状態（§3.1） ----

test('学習セットが届いていない日は第2段が「未着」（異常様式）になる', async ({ page }) => {
  // 学習セット・result とも 404（生成失敗か休み）。summary は空＝第3段の異常は0件
  await openToday(page);

  const stage = learningStage(page);
  await expect(stage).toContainText('未着');
  await expect(stage).not.toContainText('未回答');
  // 異常様式（左辺 error 色）で出す
  await expect(stage.locator('.lx__todayrow--bad')).toBeVisible();
  // タップ先は /learning（§3.1）
  await expect(stage.getByRole('link')).toHaveAttribute('href', '/learning');

  // **第2段の未着は赤点の条件ではない**（§3.1 の赤点は第3段の異常だけ）。
  // ここを混ぜると学習が休みの日に赤点が常時点灯して合図が死ぬ
  await expect(redDot(page)).toHaveCount(0);
});

test('セットはあるが未記録の日は第2段が「未回答」になる', async ({ page }) => {
  await openToday(page, { set: true });

  const stage = learningStage(page);
  await expect(stage).toContainText('未回答');
  // 未着と読み違えない（セットは届いている＝night-study は動いた）
  await expect(stage.locator('.lx__todayrow--bad')).toHaveCount(0);
});

test('記録済みの日は第2段が「済 ○x △y ×z」になる', async ({ page }) => {
  await openToday(page, {
    set: true,
    grades: [
      { no: 1, grade: 'o' },
      { no: 2, grade: 'o' },
      { no: 3, grade: 'd' },
      { no: 4, grade: 'x' },
    ],
  });

  // ○△× の内訳は grades の集計（docs/specs/03-api.md §3 の `o` / `d` / `x`）
  await expect(learningStage(page)).toContainText('済 ○2 △1 ×1');
});

// ---- 第3段: kind 別件数（§3.1） ----

test('第3段に kind 別の件数が4つ並び、0 は薄く出る（タップ先は kind でフィルタした あなた待ち）', async ({
  page,
}) => {
  await openToday(page, {
    set: true,
    grades: [{ no: 1, grade: 'o' }],
    // 2つの送信元にまたがる件数を合計して出す（§3.1 は送信元別に分けない）
    summary: [
      { source: 'night-harness', open: { approve: 2, choose: 1 } },
      { source: 'daily-harness', open: { approve: 1, read: 4 } },
    ],
  });

  const stage = waitingStage(page);
  // 並びは ⚠異常 → 承認 → 選択 → 読む で固定（急ぐものから・§3.2・§4）
  await expect(stage.getByRole('link')).toHaveCount(4);
  await expect(chipCount(page, '⚠ 異常')).toHaveText('0');
  await expect(chipCount(page, '承認')).toHaveText('3');
  await expect(chipCount(page, '選択')).toHaveText('1');
  await expect(chipCount(page, '読む')).toHaveText('4');

  // 0 は消さずに薄く出す（§3.1）——消すと「0件」なのか「件数が出ていない」のか分からない
  await expect(chip(page, '⚠ 異常')).toHaveClass(/wt__chip--zero/);
  await expect(chip(page, '承認')).not.toHaveClass(/wt__chip--zero/);

  // タップ先は kind でフィルタした「あなた待ち」（§3.1）
  await expect(chip(page, '⚠ 異常')).toHaveAttribute('href', '/waiting?kind=alert');
  await expect(chip(page, '承認')).toHaveAttribute('href', '/waiting?kind=approve');
  await expect(chip(page, '選択')).toHaveAttribute('href', '/waiting?kind=choose');
  await expect(chip(page, '読む')).toHaveAttribute('href', '/waiting?kind=read');
});

test('件数が取れないときは 0 と書かず取得の失敗を出す（第2段・第1段は描く）', async ({ page }) => {
  await openToday(page, { set: true, grades: [{ no: 1, grade: 'o' }], summaryDown: true });

  await expect(waitingStage(page)).toContainText('確認待ちの件数を取得できませんでした');
  // 他の段は普通に描く（§6「学習 API 失敗 → 第2段だけ」と同じ分界）
  await expect(learningStage(page)).toContainText('済 ○1 △0 ×0');
  await expect(page.locator('.hdr')).toBeVisible();
});

// ---- 第3段: 未着の送信元（§3.3-3） ----

test('第3段に未着の送信元が1行ずつ出る（受信済みの送信元は出ない）', async ({ page }) => {
  // 06:20 の勤務帯で最後の受信が昨日 → 12:00 の時点で今日ぶんが未着
  const silent = employee({ skill: 'routine_watchdog', name: 'ルーティン監視', hour: 6, minute: 20 });
  // 09:00 の勤務帯で今日ぶんを受信済み（0件でも受信・docs/specs/24-inbox.md §3.5）
  const delivered = employee({ skill: 'night-harness', name: '夜勤ハーネス', hour: 9, minute: 0 });

  await openToday(page, {
    set: true,
    grades: [{ no: 1, grade: 'o' }],
    summary: [
      { source: 'routine_watchdog', latestDate: YESTERDAY },
      { source: 'night-harness', latestDate: TODAY },
    ],
    employees: [silent, delivered],
  });

  const frame = missingFrame(page);
  await expect(frame).toContainText(missingLine(silent));
  await expect(frame).not.toContainText(delivered.name);
  // 押す操作は持たない（§3.3-3）。受信が来れば消える
  await expect(frame.getByRole('button')).toHaveCount(0);
  await expect(frame.getByRole('link')).toHaveCount(0);

  // 未着は第3段の中（件数の下）に出る
  const stageBox = await waitingStage(page).boundingBox();
  const frameBox = await frame.boundingBox();
  expect(frameBox?.y ?? 0).toBeGreaterThan(stageBox?.y ?? Infinity);
});

// ---- ヘッダの赤点（§3.1） ----

test('第3段の異常が1件でもあればヘッダに赤点が出る（alert の未決）', async ({ page }) => {
  await openToday(page, {
    set: true,
    grades: [{ no: 1, grade: 'o' }],
    summary: [{ source: 'routine_watchdog', open: { alert: 1 } }],
  });

  await expect(redDot(page)).toBeVisible();
  // 計器盤の中に出す（§3.1「ProgressHeader の右端」）
  await expect(page.locator('.hdr .hdr__alert')).toHaveCount(1);
});

test('未着の送信元があるだけでもヘッダに赤点が出る', async ({ page }) => {
  const silent = employee({ skill: 'routine_watchdog', name: 'ルーティン監視' });

  await openToday(page, {
    set: true,
    grades: [{ no: 1, grade: 'o' }],
    // 未決は1件も無い（openCount は全部0）。未着だけで赤点が立つ
    summary: [{ source: 'routine_watchdog', latestDate: YESTERDAY }],
    employees: [silent],
  });

  await expect(missingFrame(page)).toContainText(missingLine(silent));
  await expect(redDot(page)).toBeVisible();
});

test('適用に失敗した行があるだけでもヘッダに赤点が出る', async ({ page }) => {
  await openToday(page, {
    set: true,
    grades: [{ no: 1, grade: 'o' }],
    summary: [{ source: 'night-harness', failed: 1 }],
  });

  await expect(redDot(page)).toBeVisible();
});

test('異常が0件なら赤点は消える（未決の承認・選択・読むは異常ではない）', async ({ page }) => {
  await openToday(page, {
    set: true,
    grades: [{ no: 1, grade: 'o' }],
    // alert 0・failed 0・未着なし。approve / choose / read は残っている
    summary: [{ source: 'night-harness', open: { approve: 5, choose: 2, read: 9 } }],
    employees: [employee({ skill: 'night-harness', name: '夜勤ハーネス' })],
  });

  // 件数は出ている（画面が空でないことの確認）
  await expect(chipCount(page, '承認')).toHaveText('5');
  await expect(missingFrame(page)).toHaveCount(0);
  await expect(redDot(page)).toHaveCount(0);
});

// ---- 第1段の独立性（§3.1「ALL CLEAR の判定には含めない」） ----

test('第1段の ALL CLEAR は第3段の異常に影響されない（日課の完了と AI 側の異常は別）', async ({
  page,
}) => {
  const silent = employee({ skill: 'routine_watchdog', name: 'ルーティン監視' });

  await openToday(page, {
    tasks: CLEARED_DAY,
    // 第2段は未着・第3段は異常（alert 未決＋failed＋未着）という最悪の状態
    summary: [
      { source: 'night-harness', open: { alert: 3 }, failed: 2 },
      { source: 'routine_watchdog', latestDate: YESTERDAY },
    ],
    employees: [silent],
  });

  // 日課は全部消し込んだので ALL CLEAR は出る（docs/design/02-today.md の確定文言）
  await expect(page.getByText('ALL CLEAR')).toBeVisible();
  await expect(page.getByText('本日のタスクはすべて消し込み済みです')).toBeVisible();
  await expect(page.locator('.hdr__count')).toHaveText('2 / 2');
  await expect(page.locator('.hdr__foot')).toContainText('PROGRESS 100%');

  // 同時に赤点も出ている（第1段は消し込み済み・第3段は異常あり、が同居する）
  await expect(redDot(page)).toBeVisible();
  await expect(learningStage(page)).toContainText('未着');
  await expect(chipCount(page, '⚠ 異常')).toHaveText('3');

  // 逆向きも確かめる: 異常が0件でも、日課が残っていれば ALL CLEAR は出ない
  await openToday(page, { tasks: OPEN_DAY, set: true, grades: [{ no: 1, grade: 'o' }] });
  await expect(page.getByText('ALL CLEAR')).toHaveCount(0);
  await expect(redDot(page)).toHaveCount(0);
});

// ---- タップ先（§3.1）: kind でフィルタした「あなた待ち」 ----

test('件数をタップすると その kind だけが並んだ「あなた待ち」が開く（未着・失敗枠は絞られない）', async ({
  page,
}) => {
  const items = [
    {
      id: 801,
      source: 'routine_watchdog',
      date: TODAY,
      slug: 'a1',
      kind: 'alert',
      title: 'ルーティン取り込みが失敗しています',
      bodyMd: null,
      options: null,
      refPath: null,
      payload: null,
      expiresAt: null,
      status: 'open',
      choice: null,
      decidedAt: null,
      applyState: 'none',
      appliedAt: null,
      error: null,
      resultPath: null,
      resultUrl: null,
      receivedAt: TODAY + 'T06:20:00+09:00',
    },
    {
      id: 802,
      source: 'night-harness',
      date: TODAY,
      slug: 'b1',
      kind: 'approve',
      title: '朝の取り込みを承認してください',
      bodyMd: null,
      options: null,
      refPath: null,
      payload: null,
      expiresAt: null,
      status: 'open',
      choice: null,
      decidedAt: null,
      applyState: 'pending',
      appliedAt: null,
      error: null,
      resultPath: null,
      resultUrl: null,
      receivedAt: TODAY + 'T06:20:00+09:00',
    },
  ];

  await page.route(
    (url) => url.pathname === '/api/inbox/items' && url.searchParams.get('status') === 'open',
    (route) => route.fulfill({ json: { items } }),
  );
  await page.route(
    (url) => url.pathname === '/api/inbox/items' && url.searchParams.get('applyState') === 'failed',
    (route) => route.fulfill({ json: { items: [] } }),
  );

  await openToday(page, {
    set: true,
    grades: [{ no: 1, grade: 'o' }],
    summary: [{ source: 'routine_watchdog', open: { alert: 1 } }, { source: 'night-harness', open: { approve: 1 } }],
  });

  await chip(page, '承認').click();
  await expect(page.getByRole('heading', { name: 'あなた待ち' })).toBeVisible();

  // 押した種類だけが並ぶ（§3.1 のタップ先）
  await expect(page.getByRole('region', { name: '✅ 承認' })).toBeVisible();
  await expect(page.getByRole('region', { name: '⚠ 異常' })).toHaveCount(0);
  // 何が隠れているか分からない画面にしない（抜け道を必ず出す）
  await expect(page.getByRole('link', { name: 'すべて表示' })).toBeVisible();

  await page.getByRole('link', { name: 'すべて表示' }).click();
  await expect(page.getByRole('region', { name: '⚠ 異常' })).toBeVisible();
  await expect(page.getByRole('region', { name: '✅ 承認' })).toBeVisible();
});
