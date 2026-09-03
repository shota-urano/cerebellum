import { expect, test, type Page } from '@playwright/test';

// cerebellum-004.1 [Frontend] office.json 取得フックと2D「オフィス」画面（/office）
// 受け入れ基準（docs/specs/20-web-office.md §3.1・§3.2・§6）:
//   全景は4部屋＋MY DESKだけ / 部署内で社員が返却順に出る /
//   MY DESKは機械可読な承認待ちだけ / 席タップ→社員名簿→報告全文が出る
//   （席タップの行き先は 21 §3.1-1 で社員名簿へ変わった。報告シート自体は 20 §3.5 のまま）/
//   enabled:false は所属部署内だけに出る /
//   当日 run が無い社員に直近実行日が出る
//   / generated_at が24時間以上前のとき鮮度警告が出る
//
// office.json は :48310 の静的サーバ（夜勤ビューアと同居）が配信する外部データなので、
// **page.route でフィクスチャに差し替えて**検証する。実サーバの起動状態やその日の automation
// 実行結果にテストを依存させない（依存させると停止日や休日に必ず落ちる＝ false-gate）。
// 手法は開発画面の runs.json（e2e/cerebellum-5cl.2.spec.ts・docs/specs/19）と同じ。

/** ローカル ISO（`+09:00` 付き）。office.json の時刻は生成側で解決済みの形（docs/specs/20 §2） */
function localIso(at: Date): string {
  const p = (v: number) => String(v).padStart(2, '0');
  const offset = -at.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const abs = Math.abs(offset);
  return (
    at.getFullYear() +
    '-' + p(at.getMonth() + 1) +
    '-' + p(at.getDate()) +
    'T' + p(at.getHours()) +
    ':' + p(at.getMinutes()) +
    ':' + p(at.getSeconds()) +
    sign + p(Math.floor(abs / 60)) + ':' + p(abs % 60)
  );
}

/** 「n 日ずらしたローカル日付の HH:MM」。画面の当日判定（端末ローカル日付）と同じ基準で作る */
function atLocal(dayOffset: number, hhmm: string): string {
  const at = new Date();
  at.setDate(at.getDate() + dayOffset);
  const [hour, minute] = hhmm.split(':').map(Number);
  at.setHours(hour, minute, 0, 0);
  return localIso(at);
}

const TODAY = atLocal(0, '00:00').slice(0, 10);
/** 週次社員（x-pdca は月曜）の直近実行日。当日ではないので補助表示が出る（§3.2 末尾） */
const LAST_WEEK = atLocal(-6, '08:00');
const LAST_WEEK_DATE = LAST_WEEK.slice(0, 10);

const EMPLOYEES = [
  {
    automation_id: 'a-night-shift',
    name: '夜勤（night-shift）',
    skill: 'night-shift',
    enabled: true,
    shift: { hour: 1, minute: 0, days: '毎日', label: '毎日 01:00' },
    next_run_at: atLocal(1, '01:00'),
    last_run_at: atLocal(0, '01:00'),
    last_run_id: 'r-night-shift',
  },
  {
    automation_id: 'a-night-harness',
    name: 'ハーネス取り込み判定（night-harness）',
    skill: 'night-harness',
    enabled: true,
    shift: { hour: 2, minute: 0, days: '毎日', label: '毎日 02:00' },
    next_run_at: atLocal(1, '02:00'),
    last_run_at: atLocal(0, '02:00'),
    last_run_id: 'r-night-harness',
  },
  {
    automation_id: 'a-market-intake',
    name: '候補仕入れ（market-intake）',
    skill: 'market-intake',
    enabled: true,
    shift: { hour: 2, minute: 40, days: '平日', label: '平日 02:40' },
    next_run_at: atLocal(1, '02:40'),
    last_run_at: atLocal(0, '02:40'),
    last_run_id: 'r-market-intake',
    // 部屋は `profile.dept` で切る（docs/specs/27-web-office-departments.md §3.1-1）。
    // 「その部屋の社員だけが出る」を見たいので、この社員だけ別部署に置く
    profile: { dept: 'biz-harness' },
  },
  {
    automation_id: 'a-collect',
    name: '情報収集（collect）',
    skill: 'collect',
    enabled: true,
    shift: { hour: 5, minute: 0, days: '毎日', label: '毎日 05:00' },
    next_run_at: atLocal(1, '05:00'),
    last_run_at: atLocal(0, '05:00'),
    last_run_id: 'r-collect',
  },
  {
    automation_id: 'a-daily-digest',
    name: 'つながり発見：daily-digest',
    skill: 'daily-digest',
    enabled: true,
    shift: { hour: 6, minute: 0, days: '毎日', label: '毎日 06:00' },
    next_run_at: atLocal(1, '06:00'),
    last_run_at: atLocal(0, '06:00'),
    last_run_id: 'r-daily-digest',
  },
  {
    // 休職者。返却順では真ん中に居るが、画面では末尾の「停止中」へ移る（§3.1-4）
    automation_id: 'a-retired',
    name: '旧ダッシュボード生成（retired）',
    skill: null,
    enabled: false,
    shift: { hour: 7, minute: 0, days: '毎日', label: '毎日 07:00' },
    next_run_at: null,
    last_run_at: atLocal(-30, '07:00'),
    last_run_id: 'r-retired',
  },
  {
    // 週次（月曜）。当日 run が無いので「直近 {日付}」が出る（§3.2 末尾）
    automation_id: 'a-x-pdca',
    name: 'X週次PDCA（x-pdca）',
    skill: 'x-pdca',
    enabled: true,
    shift: { hour: 8, minute: 0, days: '月', label: '月 08:00' },
    next_run_at: atLocal(2, '08:00'),
    last_run_at: LAST_WEEK,
    last_run_id: 'r-x-pdca',
    profile: { dept: 'x-harness' },
  },
  {
    // 直近 run 無し＝「まだ実行なし」＋ next_run_at（§3.2 最終行）
    automation_id: 'a-x-auto-plug',
    name: 'セルフRT見張り（x-auto-plug）',
    skill: 'x-auto-plug',
    enabled: true,
    shift: { hour: 22, minute: 0, days: '毎日', label: '毎日 22:00' },
    next_run_at: atLocal(0, '22:00'),
    last_run_at: null,
    last_run_id: null,
    profile: { dept: 'x-harness' },
  },
];

/**
 * runs は新しい順（§2）。**同じ automation に複数 run を持たせる**——画面は
 * 「`automation_id` 一致の先頭（＝直近）」を引く仕様（§3.2）なので、古い run を
 * 誤って選んだら headline も状態も入れ替わって落ちるようにする。
 * 前日分は当日分と outcome を変えてある（誤選択が2系統で露見する）。
 */
const RUNS = [
  // ---- 当日分（新しい順） ----
  {
    run_id: 'r-daily-digest-today',
    automation_id: 'a-daily-digest',
    title: 'つながり発見：daily-digest run 31',
    run_number: '31',
    scheduled_for: atLocal(0, '06:00'),
    started_at: atLocal(0, '06:00'),
    status: 'completed',
    trigger: 'scheduled',
    outcome: 'none',
    items: null,
    note: null,
    headline: '新しいつながりは見つかりませんでした。',
    output: '新しいつながりは見つかりませんでした。',
    truncated: false,
  },
  {
    run_id: 'r-collect-today',
    automation_id: 'a-collect',
    title: '情報収集（collect） run 40',
    run_number: '40',
    scheduled_for: atLocal(0, '05:00'),
    started_at: atLocal(0, '05:00'),
    status: 'running',
    trigger: 'scheduled',
    outcome: 'running',
    items: null,
    note: null,
    headline: '収集を実行しています。',
    output: null,
    truncated: false,
  },
  {
    run_id: 'r-market-intake-today',
    automation_id: 'a-market-intake',
    title: '候補仕入れ（market-intake） run 12',
    run_number: '12',
    scheduled_for: atLocal(0, '02:40'),
    started_at: atLocal(0, '02:40'),
    status: 'completed',
    trigger: 'scheduled',
    outcome: 'failed',
    items: null,
    note: 'API が 429 を返しました',
    headline: '仕入れに失敗しました（レート制限）。',
    output: '仕入れに失敗しました（レート制限）。',
    truncated: false,
  },
  {
    run_id: 'r-night-harness-today',
    automation_id: 'a-night-harness',
    title: 'ハーネス取り込み判定（night-harness） run 25',
    run_number: '25',
    scheduled_for: atLocal(0, '02:00'),
    started_at: atLocal(0, '02:00'),
    status: 'completed',
    trigger: 'scheduled',
    outcome: 'produced',
    items: 2,
    note: '承認待ち',
    headline: '取り込み候補を2件出しました。',
    output: '取り込み候補を2件出しました。',
    truncated: false,
  },
  {
    run_id: 'r-night-shift-today',
    automation_id: 'a-night-shift',
    title: '夜勤（night-shift） run 60',
    run_number: '60',
    scheduled_for: atLocal(0, '01:00'),
    started_at: atLocal(0, '01:05'),
    status: 'completed',
    trigger: 'scheduled',
    // トレーラ行を持たない run は unknown（2026-08-21 時点は全 run が unknown・§3.4）
    outcome: 'unknown',
    items: null,
    note: null,
    headline: 'cerebellum で4件クローズしました。',
    output: 'cerebellum で4件クローズしました。',
    truncated: false,
  },

  // ---- 前日分（直近選択を誤ったらこちらが出る＝落ちる） ----
  {
    run_id: 'r-daily-digest-prev',
    automation_id: 'a-daily-digest',
    title: 'つながり発見：daily-digest run 30',
    run_number: '30',
    scheduled_for: atLocal(-1, '06:00'),
    started_at: atLocal(-1, '06:00'),
    status: 'completed',
    trigger: 'scheduled',
    outcome: 'produced',
    items: 3,
    note: null,
    headline: '【前日】つながりを3件出しました。',
    output: null,
    truncated: false,
  },
  {
    run_id: 'r-collect-prev',
    automation_id: 'a-collect',
    title: '情報収集（collect） run 39',
    run_number: '39',
    scheduled_for: atLocal(-1, '05:00'),
    started_at: atLocal(-1, '05:00'),
    status: 'completed',
    trigger: 'scheduled',
    outcome: 'unknown',
    items: null,
    note: null,
    headline: '【前日】収集を完了しました。',
    output: null,
    truncated: false,
  },
  {
    run_id: 'r-market-intake-prev',
    automation_id: 'a-market-intake',
    title: '候補仕入れ（market-intake） run 11',
    run_number: '11',
    scheduled_for: atLocal(-1, '02:40'),
    started_at: atLocal(-1, '02:40'),
    status: 'completed',
    trigger: 'scheduled',
    outcome: 'produced',
    items: 5,
    note: null,
    headline: '【前日】候補を5件仕入れました。',
    output: null,
    truncated: false,
  },
  {
    run_id: 'r-night-harness-prev',
    automation_id: 'a-night-harness',
    title: 'ハーネス取り込み判定（night-harness） run 24',
    run_number: '24',
    scheduled_for: atLocal(-1, '02:00'),
    started_at: atLocal(-1, '02:00'),
    status: 'completed',
    trigger: 'scheduled',
    outcome: 'none',
    items: null,
    note: null,
    headline: '【前日】取り込み候補はありませんでした。',
    output: null,
    truncated: false,
  },
  {
    run_id: 'r-night-shift-prev',
    automation_id: 'a-night-shift',
    title: '夜勤（night-shift） run 59',
    run_number: '59',
    scheduled_for: atLocal(-1, '01:00'),
    started_at: atLocal(-1, '01:00'),
    status: 'completed',
    trigger: 'scheduled',
    outcome: 'failed',
    items: null,
    note: null,
    headline: '【前日】夜勤が失敗しました。',
    output: null,
    truncated: false,
  },

  // ---- 週次社員（当日 run が無い社員も「直近」を引けているか見る） ----
  {
    run_id: 'r-x-pdca-last',
    automation_id: 'a-x-pdca',
    title: 'X週次PDCA（x-pdca） run 8',
    run_number: '8',
    scheduled_for: LAST_WEEK,
    started_at: LAST_WEEK,
    status: 'completed',
    trigger: 'scheduled',
    outcome: 'unknown',
    items: null,
    note: null,
    headline: '週次の振り返りを追記しました。',
    output: null,
    truncated: false,
  },
  {
    run_id: 'r-x-pdca-prev',
    automation_id: 'a-x-pdca',
    title: 'X週次PDCA（x-pdca） run 7',
    run_number: '7',
    scheduled_for: atLocal(-13, '08:00'),
    started_at: atLocal(-13, '08:00'),
    status: 'completed',
    trigger: 'scheduled',
    outcome: 'failed',
    items: null,
    note: null,
    headline: '【前々週】x-pdca が失敗しました。',
    output: null,
    truncated: false,
  },
  {
    // 停止中の社員の run。停止中は headline を出さない（§3.1-4）ので画面に現れてはいけない
    run_id: 'r-retired',
    automation_id: 'a-retired',
    title: '旧ダッシュボード生成（retired） run 3',
    run_number: '3',
    scheduled_for: atLocal(-30, '07:00'),
    started_at: atLocal(-30, '07:00'),
    status: 'completed',
    trigger: 'scheduled',
    outcome: 'produced',
    items: 1,
    note: null,
    headline: '停止前の最後の報告です。',
    output: null,
    truncated: false,
  },
];

/**
 * 在籍社員の期待値（返却順）。**headline を持つ全行**を検証する（部分検証をしない）。
 * 状態ラベルは当日分の outcome に対応する——古い run を引いたら headline と状態の
 * 両方が入れ替わるので、直近選択の誤りが2系統で露見する（§3.2）。
 */
const EXPECTED = [
  { name: '夜勤（night-shift）', headline: 'cerebellum で4件クローズしました。' },
  { name: 'ハーネス取り込み判定（night-harness）', headline: '取り込み候補を2件出しました。' },
  { name: '候補仕入れ（market-intake）', headline: '仕入れに失敗しました（レート制限）。' },
  { name: '情報収集（collect）', headline: '収集を実行しています。' },
  { name: 'つながり発見：daily-digest', headline: '新しいつながりは見つかりませんでした。' },
  { name: 'X週次PDCA（x-pdca）', headline: '週次の振り返りを追記しました。' },
  // 直近 run 無し＝名簿は開けるが「報告を見る」を持たない席（21 §3.1-3）
  { name: 'セルフRT見張り（x-auto-plug）', headline: null },
];

/** 直近ではない run の headline。1つでも画面に出たら「先頭＝直近」を引けていない */
const STALE_HEADLINES = [
  '【前日】つながりを3件出しました。',
  '【前日】収集を完了しました。',
  '【前日】候補を5件仕入れました。',
  '【前日】取り込み候補はありませんでした。',
  '【前日】夜勤が失敗しました。',
  '【前々週】x-pdca が失敗しました。',
  '停止前の最後の報告です。',
];

/** 鮮度は「生成が n 時間前」で判定する（§6）。既定は生成直後＝警告なし */
function office(overrides: Record<string, unknown> = {}) {
  return {
    generated_at: localIso(new Date()),
    window_days: 14,
    employees: EMPLOYEES,
    runs: RUNS,
    ...overrides,
  };
}

/**
 * office.json をフィクスチャに差し替える。http（:48310 直）でも https（`/loop-reports` の
 * path マウント）でも同じ1本で捕まえる（接続規則は docs/specs/13 §4・20 §4）。
 */
async function mockOffice(page: Page, body: unknown = office()) {
  await page.route('**/office.json', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) }),
  );
}

/**
 * 全景の部屋は `profile.dept` で切る（docs/specs/27-web-office-departments.md §3.1-1 が
 * 20 §3.1-3 の skill 名分類を置き換えた）。部屋の信号の優先順を**4部屋で**見るために、
 * 旧4部屋と同じ分かれ方になる `dept` を与える（値は second-brain 側の名簿から届くもの）。
 */
const DEPT_BY_AUTOMATION: Record<string, string> = {
  'a-night-harness': 'second-brain-harness',
  'a-daily-digest': 'second-brain-harness',
  'a-market-intake': 'biz-harness',
  'a-collect': 'engineering',
  'a-night-shift': 'engineering',
  'a-x-pdca': 'x-harness',
  'a-x-auto-plug': 'x-harness',
  'a-retired': 'x-harness',
};

const withDept = (employees: typeof EMPLOYEES) =>
  employees.map((employee) => ({
    ...employee,
    profile: { dept: DEPT_BY_AUTOMATION[employee.automation_id] ?? null },
  }));

test('全景は部署の部屋＋MY DESKへ情報を畳み、正常社員の文字を常時読ませない', async ({ page }) => {
  // `departments` は届いていない状態（見出しは id・並びは返却順・27 §3.1-4）
  await mockOffice(page, office({ employees: withDept(EMPLOYEES) }));
  await page.goto('/office');

  await expect(page.getByText('ROUTINE / OFFICE')).toBeVisible();
  const overview = page.getByRole('region', { name: 'AIオフィス全景' });
  await expect(overview.locator('.of3__room')).toHaveCount(4);
  await expect(overview.getByRole('link', { name: /engineeringに入る/ })).toBeVisible();
  await expect(overview.getByRole('link', { name: /second-brain-harnessに入る/ })).toBeVisible();
  await expect(overview.getByRole('link', { name: /biz-harnessに入る/ })).toBeVisible();
  await expect(overview.getByRole('link', { name: /x-harnessに入る/ })).toBeVisible();
  await expect(overview.getByRole('link', { name: /MY DESK、承認待ち2件/ })).toBeVisible();

  const headline = page.getByLabel('昨夜のオフィス概要');
  await expect(headline).toContainText('昨夜：失敗 1');
  await expect(headline).toContainText('あなたの仕事：2件');
  await expect(overview.getByRole('link', { name: /second-brain-harnessに入る/ })).toContainText('確認 2');
  await expect(overview.getByRole('link', { name: /biz-harnessに入る/ })).toContainText('失敗 1');
  await expect(overview.getByRole('link', { name: /engineeringに入る/ })).toContainText('処理中…');
  await expect(overview.getByRole('link', { name: /x-harnessに入る/ })).toContainText('正常');

  // 全景は部屋と自分の机だけ。社員名・勤務時刻・headline は部署へ入るまで出さない。
  for (const expected of EXPECTED) await expect(page.getByText(expected.name)).toHaveCount(0);
  await expect(page.getByText('毎日 01:00')).toHaveCount(0);
  for (const stale of STALE_HEADLINES) await expect(page.getByText(stale)).toHaveCount(0);
  await expect(page.locator('.of3__stopped-count')).toHaveText('停止中 1名');

  // 生成が新しいときは鮮度警告を出さない（§6）
  await expect(page.locator('.dg__warn')).toHaveCount(0);
  // 0件（outcome=none）はエラーにしない（§4・§6）
  await expect(page.locator('.banner')).toHaveCount(0);

  await page.screenshot({
    path: 'test-results/screens/cerebellum-004.1-office.png',
    fullPage: false,
  });
});

test('部署へ入ると所属社員だけが返却順で現れ、席から報告を読んで同じ部署へ戻れる', async ({
  page,
}) => {
  await mockOffice(page);
  // 全景の部屋タップは 27 §3.2（部署ルームの統合）の検証に移った。ここで見るのは
  // 「部屋へ入ってからの席・名簿・報告の往復」なので URL から直接入る
  await page.goto('/office?room=biz-harness');
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  const room = page.getByRole('region', { name: 'DEPT: biz-harnessの社員' });
  await expect(room.locator('.of3__worker')).toHaveCount(1);
  await expect(room).toContainText('候補仕入れ（market-intake）');
  await expect(room).toContainText('平日 02:40');
  await expect(room).toContainText('失敗');
  await expect(room).not.toContainText('夜勤（night-shift）');

  // 席タップは社員名簿へ行き、報告はそこから開く（docs/specs/21-web-office-roster.md §3.1-1）
  await page.getByRole('link', { name: /候補仕入れ.*名簿を開く/ }).click();
  await expect(page).toHaveURL(/\/office\?room=biz-harness&employee=a-market-intake/);
  const card = page.getByRole('dialog', { name: '候補仕入れ（market-intake）の名簿' });
  await card.getByRole('link', { name: '報告を見る' }).click();
  await expect(page).toHaveURL(/\/office\?room=biz-harness&employee=a-market-intake&run=r-market-intake-today/);
  // `exact` を付ける。既定の部分一致では名簿カード（「…の名簿」）にも当たる
  const sheet = page.getByRole('dialog', { name: '候補仕入れ（market-intake）', exact: true });
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('.of2__headline')).toHaveText('仕入れに失敗しました（レート制限）。');
  await expect(sheet).toContainText('RUN');
  await expect(sheet).toContainText('12');
  await expect(sheet).toContainText('予定');
  await expect(sheet).toContainText('開始');
  await expect(sheet).toContainText('状態');
  await expect(sheet).toContainText('起動');

  await sheet.getByRole('button', { name: '報告を見る' }).click();
  await expect(sheet).toContainText('仕入れに失敗しました（レート制限）。');
  await expect(sheet.getByRole('button', { name: '報告を閉じる' })).toHaveAttribute('aria-expanded', 'true');

  // 名簿経由で開いた報告は名簿へ返す（21 §3.1-4）
  await sheet.getByRole('link', { name: '閉じる' }).click();
  await expect(page).toHaveURL(/\/office\?room=biz-harness&employee=a-market-intake$/);
  await expect(sheet).toBeHidden();
  await card.getByRole('link', { name: '閉じる' }).click();
  await expect(page).toHaveURL(/\/office\?room=biz-harness$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('7人の部署でも最終行が部屋の下壁より内側に収まる', async ({ page }) => {
  const crowdedEmployees = Array.from({ length: 7 }, (_, index) => ({
    ...EMPLOYEES[1],
    automation_id: `a-lab-${index + 1}`,
    name: `LAB社員 ${index + 1}`,
    last_run_at: null,
    last_run_id: null,
  }));
  await mockOffice(page, office({ employees: crowdedEmployees, runs: [] }));
  await page.goto('/office?room=unassigned');

  const room = page.getByRole('region', { name: 'DEPT: unassignedの社員' });
  await expect(room.locator('.of3__worker')).toHaveCount(7);
  const geometry = await room.evaluate((floor) => {
    const floorRect = floor.getBoundingClientRect();
    const workerBottom = Math.max(
      ...Array.from(floor.querySelectorAll('.of3__worker'), (worker) => worker.getBoundingClientRect().bottom),
    );
    return {
      backgroundSize: getComputedStyle(floor).backgroundSize,
      floorHeight: floorRect.height,
      workerBottomFromFloorTop: workerBottom - floorRect.top,
    };
  });
  // room-floor.png の下壁（画像内のおよそ80%）を床面末尾へ送るため、下側をクロップする。
  expect(geometry.backgroundSize).toBe('100% 128%');
  expect(geometry.workerBottomFromFloorTop).toBeLessThanOrEqual(geometry.floorHeight);
});

test('MY DESKは承認待ちだけを集め、内容確認後も自分の机へ戻る', async ({ page }) => {
  await mockOffice(page);
  await page.goto('/office');

  await page.getByRole('link', { name: /MY DESK、承認待ち2件/ }).click();
  await expect(page).toHaveURL(/\/office\?desk=1/);
  const desk = page.getByRole('dialog', { name: '承認待ち 2件' });
  await expect(desk).toContainText('ハーネス取り込み判定（night-harness）');
  await expect(desk).toContainText('取り込み候補を2件出しました。');
  await expect(desk).not.toContainText('仕入れに失敗しました');

  await desk.getByRole('link', { name: /ハーネス取り込み判定/ }).click();
  const report = page.getByRole('dialog', { name: 'ハーネス取り込み判定（night-harness）' });
  await expect(report).toBeVisible();
  await report.getByRole('link', { name: '閉じる' }).click();
  await expect(page).toHaveURL(/\/office\?desk=1/);
  await expect(page.getByRole('dialog', { name: '承認待ち 2件' })).toBeVisible();
});

test('保持期間外と未知のrunを報告シート内で明示し、ブラウザバックで部署へ戻る', async ({ page }) => {
  await mockOffice(page);
  await page.goto('/office?room=x-harness');

  await page.getByRole('link', { name: /X週次PDCA.*名簿を開く/ }).click();
  await page
    .getByRole('dialog', { name: 'X週次PDCA（x-pdca）の名簿' })
    .getByRole('link', { name: '報告を見る' })
    .click();
  const sheet = page.getByRole('dialog', { name: 'X週次PDCA（x-pdca）', exact: true });
  await sheet.getByRole('button', { name: '報告を見る' }).click();
  await expect(sheet).toContainText('報告全文は保持期間外です');

  // ブラウザバックは 報告 → 名簿 → 部署 の順に1枚ずつ閉じる（21 §3.1-4・§3.1-5）
  await page.goBack();
  await expect(page).toHaveURL(/\/office\?room=x-harness&employee=a-x-pdca$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/office\?room=x-harness$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.goto('/office?run=missing-run');
  await expect(page.getByRole('dialog', { name: 'その run は見つかりません' })).toBeVisible();
});

test('/office にコンソールエラーが出ない（hydration mismatch の再発検知）', async ({ page }) => {
  // 静的 export はビルド時に HTML を焼くので、時計や `window` に依存した描画をそのまま
  // 出すと「ビルド時の描画」と「閲覧時の描画」が食い違い hydration error #418 になる
  // （2026-08-23 実機検証で実際に出た）。再発したらここで落ちる。
  // 手法は e2e/smoke.spec.ts と同じ（console error / pageerror の収集）。
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await mockOffice(page);
  await page.goto('/office');

  // hydration は最初の描画で起きるので、全景が出るまで待ってから判定する
  await expect(page.getByRole('region', { name: 'AIオフィス全景' })).toBeVisible();
  // 鮮度警告（時計依存の表示）が絡む経路でも出ないことを見る
  await expect(page.locator('.dg__warn')).toHaveCount(0);

  expect(errors).toEqual([]);
});

test('当日 run が無い社員（週次）には直近実行日が出る', async ({ page }) => {
  await mockOffice(page);
  await page.goto('/office?room=x-harness');

  // 週次・平日限定の社員が毎日「未実行」に見えるのを防ぐ補助表示（§3.2 末尾）
  const weekly = page.locator('.of3__worker', { hasText: 'X週次PDCA（x-pdca）' });
  await expect(weekly).toContainText('直近 ' + LAST_WEEK_DATE);
  expect(LAST_WEEK_DATE).not.toBe(TODAY);

  // 別部署の社員は混ざらない
  await expect(page.getByText('夜勤（night-shift）')).toHaveCount(0);
});

test('enabled:false の社員は全景で件数だけ、所属部署内で停止中として見える', async ({ page }) => {
  await mockOffice(page);
  await page.goto('/office');

  await expect(page.locator('.of3__stopped-count')).toHaveText('停止中 1名');
  await expect(page.getByText('旧ダッシュボード生成（retired）')).toHaveCount(0);

  // 全景から入る導線の検証は 27 §3.2 側。ここは「所属部屋の中でだけ停止中が見える」ことを見る
  await page.goto('/office?room=unassigned');
  const stopped = page.locator('.of3__worker--stopped');
  await expect(stopped).toHaveCount(1);
  await expect(stopped).toContainText('旧ダッシュボード生成（retired）');
  await expect(stopped).toContainText('毎日 07:00');
  await expect(stopped).toContainText('停止中');

  // 停止前の headline は出さない（run は office.json に入っている）
  await expect(page.getByText('停止前の最後の報告です。')).toHaveCount(0);
});

test('generated_at が24時間以上前ならフロアの上に鮮度警告が出る（エラーにはしない）', async ({
  page,
}) => {
  const staleAt = new Date(Date.now() - (30 * 3_600_000 + 60_000));
  await mockOffice(page, office({ generated_at: localIso(staleAt) }));
  await page.goto('/office');

  const warn = page.locator('.dg__warn');
  await expect(warn).toHaveCount(1);
  await expect(warn).toContainText('データが 30 時間前のものです');
  // 生成の停止に気付けるようにするための表示。エラーバナーにはしない（§6）
  await expect(page.locator('.banner')).toHaveCount(0);
  // 警告が出ても2D全景そのものは通常どおり出る
  await expect(page.getByRole('region', { name: 'AIオフィス全景' })).toBeVisible();
});

test('employees が空なら空状態（エラーにしない）', async ({ page }) => {
  await mockOffice(page, office({ employees: [], runs: [] }));
  await page.goto('/office');

  await expect(page.getByText('登録されている automation がありません')).toBeVisible();
  await expect(page.locator('.banner')).toHaveCount(0);
});

test('office.json が取れないときは ErrorBanner', async ({ page }) => {
  await page.route('**/office.json', (route) => route.abort());
  await page.goto('/office');

  await expect(page.locator('.banner')).toContainText('オフィスのデータに接続できません');
});
