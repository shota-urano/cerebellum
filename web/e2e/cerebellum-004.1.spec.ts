import { expect, test, type Page } from '@playwright/test';

// cerebellum-004.1 [Frontend] office.json 取得フックと2D「オフィス」画面（/office）
// 受け入れ基準（docs/specs/20-web-office.md §3.1・§3.2・§6）:
//   社員が2Dフロアへ返却順で配置される / 各席に勤務ラベルと直近 run の状態が出る /
//   席タップで headline と報告全文が出る / enabled:false が末尾の「停止中」に入る /
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
  // 直近 run 無し＝報告シートへのリンクを持たない席
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

test('社員が2Dフロアへ返却順で配置され、勤務ラベル・名前・直近 run の状態が出る', async ({
  page,
}) => {
  await mockOffice(page);
  await page.goto('/office');

  await expect(page.getByText('ROUTINE / OFFICE')).toBeVisible();
  const floor = page.getByRole('region', { name: '勤務中の社員フロア' });
  const stations = floor.locator('.of2__station');
  await expect(stations).toHaveCount(7);
  await expect(page.getByLabel('オフィスの稼働状況')).toContainText('勤務中 2');
  await expect(page.getByLabel('オフィスの稼働状況')).toContainText('待機 4');
  await expect(page.getByLabel('オフィスの稼働状況')).toContainText('失敗 1');

  // 生成側の返却順そのままをCSS Gridへ流す。enabled:false はフロアから抜ける（§3.1）。
  await expect(floor.locator('.of2__shift')).toHaveText([
    '毎日 01:00',
    '毎日 02:00',
    '平日 02:40',
    '毎日 05:00',
    '毎日 06:00',
    '月 08:00',
    '毎日 22:00',
  ]);

  // 席と社員の対応を全件固定する。headline は席タップ後の報告シートにだけ出す。
  for (const [index, expected] of EXPECTED.entries()) {
    await expect(stations.nth(index)).toContainText(expected.name);
  }

  // 直近＝`automation_id` 一致の**先頭**（§3.2）。同じ automation の古い run（前日・前々週）の
  // headline は、どの行にも——停止中の帯にも——出てはいけない
  for (const stale of STALE_HEADLINES) {
    await expect(page.getByText(stale)).toHaveCount(0);
  }

  // 直近 run の状態表示（§3.2 の表）。前日分は当日分と別の outcome を持たせてあるので、
  // 古い run を引いていればここも同時に落ちる
  await expect(stations.nth(1).locator('.of2__state--good')).toContainText('成果あり 2件');
  await expect(stations.nth(1)).toContainText('承認待ち');
  await expect(stations.nth(2).locator('.of2__state--bad')).toContainText('失敗');
  await expect(stations.nth(2)).toHaveClass(/of2__station--bad/);
  await expect(stations.nth(3).locator('.of2__state--live')).toContainText('実行中');
  await expect(stations.nth(4).locator('.of2__state--neutral')).toContainText('今日は無し');
  await expect(stations.nth(6).locator('.of2__state--neutral')).toContainText('まだ実行なし');
  await expect(stations.nth(6)).toContainText('次回');
  await expect(stations.nth(0)).not.toHaveClass(/of2__station--bad/);

  // 生成が新しいときは鮮度警告を出さない（§6）
  await expect(page.locator('.dg__warn')).toHaveCount(0);
  // 0件（outcome=none）はエラーにしない（§4・§6）
  await expect(page.locator('.banner')).toHaveCount(0);

  await page.screenshot({
    path: 'test-results/screens/cerebellum-004.1-office.png',
    fullPage: true,
  });
});

test('席タップでURL付き報告シートが開き、headline・メタ・報告全文を読んで閉じられる', async ({
  page,
}) => {
  await mockOffice(page);
  await page.goto('/office');

  await page.getByRole('link', { name: /候補仕入れ.*直近報告を開く/ }).click();
  await expect(page).toHaveURL(/\/office\?run=r-market-intake-today/);
  const sheet = page.getByRole('dialog', { name: '候補仕入れ（market-intake）' });
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

  await sheet.getByRole('link', { name: '閉じる' }).click();
  await expect(page).toHaveURL(/\/office\/?$/);
  await expect(sheet).toBeHidden();
});

test('保持期間外と未知のrunを報告シート内で明示し、ブラウザバックでフロアへ戻る', async ({ page }) => {
  await mockOffice(page);
  await page.goto('/office');

  await page.getByRole('link', { name: /X週次PDCA.*直近報告を開く/ }).click();
  const sheet = page.getByRole('dialog', { name: 'X週次PDCA（x-pdca）' });
  await sheet.getByRole('button', { name: '報告を見る' }).click();
  await expect(sheet).toContainText('報告全文は保持期間外です');

  await page.goBack();
  await expect(page).toHaveURL(/\/office\/?$/);
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

  // hydration は最初の描画で起きるので、フロアが出るまで待ってから判定する
  await expect(page.locator('.of2__station').first()).toContainText('夜勤（night-shift）');
  // 鮮度警告（時計依存の表示）が絡む経路でも出ないことを見る
  await expect(page.locator('.dg__warn')).toHaveCount(0);

  expect(errors).toEqual([]);
});

test('当日 run が無い社員（週次）には直近実行日が出る', async ({ page }) => {
  await mockOffice(page);
  await page.goto('/office');

  // 週次・平日限定の社員が毎日「未実行」に見えるのを防ぐ補助表示（§3.2 末尾）
  const weekly = page.locator('.of2__station', { hasText: 'X週次PDCA（x-pdca）' });
  await expect(weekly).toContainText('直近 ' + LAST_WEEK_DATE);
  expect(LAST_WEEK_DATE).not.toBe(TODAY);

  // 当日 run がある社員には出ない（毎日出ると意味が消えるため）
  const daily = page.locator('.of2__station', { hasText: '夜勤（night-shift）' });
  await expect(daily.locator('.of2__last')).toHaveCount(0);
});

test('enabled:false の社員は末尾の「停止中」に入り、headline は出さない', async ({ page }) => {
  await mockOffice(page);
  await page.goto('/office');

  const stopped = page.getByRole('region', { name: '停止中' });
  await expect(stopped.locator('.of2__station')).toHaveCount(1);
  await expect(stopped.locator('.of2__station')).toContainText('旧ダッシュボード生成（retired）');
  await expect(stopped.locator('.of2__shift')).toHaveText(['毎日 07:00']);

  // 停止中の headline・状態は画面に出さない（run は office.json に入っている）
  await expect(page.getByText('停止前の最後の報告です。')).toHaveCount(0);
  await expect(stopped.locator('.of2__state')).toHaveText('停止中');
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
  // 警告が出ても2Dフロアそのものは通常どおり出る
  await expect(page.locator('.of2__station').first()).toContainText('夜勤（night-shift）');
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
