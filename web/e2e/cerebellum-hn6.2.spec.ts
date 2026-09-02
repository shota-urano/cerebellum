import { expect, test, type Page } from '@playwright/test';

// cerebellum-hn6.2 [Frontend] 未着判定（docs/specs/25-web-inbox.md §3.3）
// 受け入れ基準:
//   due かつ未受信の送信元が未着として出る / `cadence: adhoc` は出ない /
//   勤務開始時刻の前は出ない / office.json 取得失敗時は判定を諦めて1行通知する
//
// 突合の3入力すべてを固定する（判定は「名簿 × 勤務帯 × 受信」の関数なので、
// どれか1つでも実データだと期待値が作れない）:
//   - 名簿（office.json）… :48310 の静的サーバが配信する外部データなので page.route で差し替え
//     （実サーバの起動状態にテストを依存させない。hn6.1 と同じ手法）
//   - 受信（GET /api/inbox/summary）… fullyParallel で他テストの投入が混ざるので固定応答にする
//   - 「いま」… **端末の時計は触らない**。`page.clock.setFixedTime` でブラウザ内の Date だけを
//     固定する（タイマーは動いたままなので SWR の再検証は普通に走る）
//
// サーバーの受信記録そのものの挙動は docs/specs/24-inbox.md 側のテストが持つ。

/** 固定する「いま」。2026-09-02 は**水曜**（`shift.days` の曜日判定に使う） */
const TODAY = '2026-09-02';
const YESTERDAY = '2026-09-01';
/** ローカルタイムの正午（日付境界は深夜0時・ローカルタイム。docs/specs/00-overview.md §4） */
const NOON = new Date(2026, 8, 2, 12, 0, 0);

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

/**
 * 名簿の1行。`skill` が `source` と突き合わせる鍵（docs/specs/24-inbox.md §3.1）。
 * `cadence` を省くと「`review` を持たない社員」＝未着判定の対象外になる（§3.3 末尾）。
 */
function employee(options: {
  skill: string;
  name: string;
  days?: string;
  hour?: number;
  minute?: number;
  cadence?: 'shift' | 'adhoc';
}): Employee {
  const days = options.days ?? '毎日';
  const hour = options.hour ?? 6;
  const minute = options.minute ?? 20;
  const label = days + ' ' + String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0');
  return {
    automation_id: 'a-' + options.skill,
    name: options.name,
    skill: options.skill,
    enabled: true,
    shift: { hour, minute, days, label },
    next_run_at: null,
    last_run_at: null,
    last_run_id: null,
    profile: {
      job: '人間の確認を待ちます',
      command: null,
      checks: null,
      doc: null,
      ...(options.cadence ? { review: { kinds: ['alert'], cadence: options.cadence } } : {}),
    },
  };
}

/** 期待する未着の1行（§3.3-3 の固定書式） */
const missingLine = (employeeItem: Employee) =>
  '未着: ' + employeeItem.name + '（' + (employeeItem.shift?.label ?? '') + ' 予定）';

async function mockOffice(page: Page, employees: Employee[]) {
  await page.route('**/office.json', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        generated_at: null,
        window_days: 14,
        employees,
        runs: [],
      }),
    }),
  );
}

/** office.json が取れない状態（:48310 停止・非 tailnet 相当）。 */
async function breakOffice(page: Page) {
  await page.route('**/office.json', (route) => route.fulfill({ status: 500, body: 'down' }));
}

/** `GET /api/inbox/summary`（docs/specs/03-api.md §3）。受信の事実だけを持つ */
type SummarySource = { source: string; latestDate: string; latestItemCount: number };

async function stubSummary(page: Page, sources: SummarySource[]) {
  await page.route(
    (url) => url.pathname === '/api/inbox/summary',
    (route) =>
      route.fulfill({
        json: {
          sources: sources.map((source) => ({
            source: source.source,
            latestDate: source.latestDate,
            latestReceivedAt: source.latestDate + 'T06:20:00+09:00',
            latestItemCount: source.latestItemCount,
            openCount: { approve: 0, choose: 0, read: 0, alert: 0 },
            failedCount: 0,
          })),
        },
      }),
  );
}

type StoredItem = Record<string, unknown> & { id: number; title: string };

/** 未決1件ぶんの固定応答（画面が空にならないように置く。行の作りは hn6.1 が検証済み） */
function stubItem(id: number, title: string, source: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    source,
    date: TODAY,
    slug: 'slug-' + id,
    kind: 'alert',
    title,
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
    ...extra,
  } satisfies StoredItem;
}

async function stubList(page: Page, open: StoredItem[], failed: StoredItem[] = []) {
  await page.route(
    (url) => url.pathname === '/api/inbox/items' && url.searchParams.get('status') === 'open',
    (route) => route.fulfill({ json: { items: open } }),
  );
  await page.route(
    (url) => url.pathname === '/api/inbox/items' && url.searchParams.get('applyState') === 'failed',
    (route) => route.fulfill({ json: { items: failed } }),
  );
}

/** 未着の枠（`<section aria-label="未着">`）。押す操作を持たない1行の集まり */
const missingFrame = (page: Page) => page.getByRole('region', { name: '未着' });

/** 3入力（名簿・受信・いま）を固定してから開く。 */
async function open(
  page: Page,
  options: {
    employees?: Employee[];
    summary?: SummarySource[];
    open?: StoredItem[];
    failed?: StoredItem[];
    officeDown?: boolean;
  },
) {
  await page.clock.setFixedTime(NOON);
  if (options.officeDown) await breakOffice(page);
  else await mockOffice(page, options.employees ?? []);
  await stubSummary(page, options.summary ?? []);
  await stubList(page, options.open ?? [], options.failed ?? []);
  await page.goto('/waiting');
  await expect(page.getByRole('heading', { name: 'あなた待ち' })).toBeVisible();
}

// ---- due かつ未受信（§3.3-2） ----

test('due かつ未受信の送信元が未着として出る（今日の受信がある送信元は出ない）', async ({
  page,
}) => {
  // 06:20 の勤務帯で、最後の受信は昨日 → 12:00 の時点で今日ぶんが届いていない
  const silent = employee({ skill: 'routine_watchdog', name: 'ルーティン監視', hour: 6, minute: 20, cadence: 'shift' });
  // 09:00 の勤務帯で、今日ぶんを **0件で** 受信済み → 未着ではない（0件の受信も受信・24 §3.5）
  const delivered = employee({ skill: 'night-harness', name: '夜勤ハーネス', hour: 9, minute: 0, cadence: 'shift' });

  await open(page, {
    employees: [silent, delivered],
    summary: [
      { source: 'routine_watchdog', latestDate: YESTERDAY, latestItemCount: 1 },
      { source: 'night-harness', latestDate: TODAY, latestItemCount: 0 },
    ],
    open: [stubItem(901, '受信済みの異常はそのまま出る', 'night-harness')],
    failed: [
      stubItem(902, '適用に失敗した提案', 'night-harness', {
        kind: 'approve',
        date: '2026-08-04',
        status: 'approved',
        applyState: 'failed',
        error: '対象ファイルの見出しが見つかりません',
      }),
    ],
  });

  const frame = missingFrame(page);
  await expect(frame).toContainText(missingLine(silent));
  // 今日ぶんを受信済みの送信元は出ない（受信が来れば消える表示・§3.3-3）
  await expect(frame).not.toContainText(delivered.name);

  // 押す操作は無い（§3.3-3）。直す先は second-brain 側で、画面から出来ることは無い
  await expect(frame.getByRole('button')).toHaveCount(0);
  await expect(frame.getByRole('link')).toHaveCount(0);
  await expect(frame.getByRole('radio')).toHaveCount(0);

  // 最上部（§3.3-3）。失敗枠より上に出す——監視の監視はここしか無い（24 §9）
  const missingBox = await frame.boundingBox();
  const failedBox = await page.getByRole('region', { name: '未処理の失敗' }).boundingBox();
  expect(missingBox?.y ?? Infinity).toBeLessThan(failedBox?.y ?? 0);

  // 受信済みの項目は普通に出たまま（未着は突合の結果を足すだけで、一覧を置き換えない）
  await expect(page.getByRole('region', { name: '受信済みの異常はそのまま出る' })).toBeVisible();

  await page.screenshot({
    path: 'test-results/screens/cerebellum-hn6.2-inbox-missing.png',
    fullPage: true,
  });
});

// ---- 判定の対象（§3.3 末尾） ----

test('cadence が adhoc の社員と review を持たない社員は未着にならない', async ({ page }) => {
  const adhoc = employee({ skill: 'x-post', name: '不定期の投稿係', hour: 0, minute: 5, cadence: 'adhoc' });
  // `review` そのものが無い＝「人間確認なし」（24 §9）
  const noReview = employee({ skill: 'a-collect', name: '確認なしの収集係', hour: 0, minute: 10 });
  // 判定が実際に動いていることを示す対照（同じ条件で cadence だけ shift）
  const control = employee({ skill: 'routine_watchdog', name: 'ルーティン監視', hour: 0, minute: 15, cadence: 'shift' });

  // どの送信元も今日ぶんを受信していない（summary は空）
  await open(page, { employees: [adhoc, noReview, control], summary: [] });

  const frame = missingFrame(page);
  await expect(frame).toContainText(missingLine(control));
  await expect(frame).not.toContainText(adhoc.name);
  await expect(frame).not.toContainText(noReview.name);
});

// ---- 時刻前（§3.3-2 の `hour:minute` を過ぎているかも見る） ----

test('勤務開始時刻を過ぎていない社員は未着にならない（端末の時計は触らずブラウザ内の Date を固定）', async ({
  page,
}) => {
  const past = employee({ skill: 'routine_watchdog', name: 'ルーティン監視', hour: 6, minute: 20, cadence: 'shift' });
  // 固定した「いま」（12:00）より後の勤務帯。まだ来ていないだけで未着ではない
  const upcoming = employee({ skill: 'night-harness', name: '夜勤ハーネス', hour: 23, minute: 50, cadence: 'shift' });

  await open(page, { employees: [past, upcoming], summary: [] });

  const frame = missingFrame(page);
  await expect(frame).toContainText(missingLine(past));
  await expect(frame).not.toContainText(upcoming.name);
});

// ---- 曜日（§3.3-2 の `days` と曜日で判定） ----

test('days が今日の曜日に当たらない社員は未着にならない（2026-09-02 は水曜）', async ({ page }) => {
  const weekday = employee({ skill: 'daily-harness', name: '平日の係', days: '平日', cadence: 'shift' });
  const wed = employee({ skill: 'x-pdca', name: '月水の係', days: '月・水', cadence: 'shift' });
  const weekend = employee({ skill: 'night-incubate', name: '週末の係', days: '週末', cadence: 'shift' });
  const tue = employee({ skill: 'night-blindspot', name: '火木の係', days: '火・木', cadence: 'shift' });

  await open(page, { employees: [weekday, wed, weekend, tue], summary: [] });

  const frame = missingFrame(page);
  await expect(frame).toContainText(missingLine(weekday));
  await expect(frame).toContainText(missingLine(wed));
  await expect(frame).not.toContainText(weekend.name);
  await expect(frame).not.toContainText(tue.name);
});

// ---- office.json 取得失敗（§3.3 末尾・§6） ----

test('office.json が取れないときは未着判定を諦めて1行で通知する（エラーバナーにしない）', async ({
  page,
}) => {
  await open(page, {
    officeDown: true,
    // 名簿があれば未着になる条件（未受信・時刻経過済み）でも、名簿が読めなければ判定しない
    summary: [{ source: 'routine_watchdog', latestDate: YESTERDAY, latestItemCount: 1 }],
    open: [stubItem(921, '受信済みの異常', 'routine_watchdog')],
  });

  await expect(page.getByText('名簿が取得できないため、未着は判定していません。')).toBeVisible();
  // 未着の枠そのものは出ない（全員を未着扱いにしない）
  await expect(missingFrame(page)).toHaveCount(0);
  // エラーバナーにしない（§3.3 末尾）。諦めたのは未着判定だけ
  await expect(page.locator('.banner')).toHaveCount(0);

  // 受信済みの項目は普通に出て、そのまま決定できる
  const card = page.getByRole('region', { name: '受信済みの異常' });
  await expect(card).toBeVisible();
  await expect(card.getByRole('button', { name: '確認' })).toBeVisible();
});
