import { expect, test, type Page } from '@playwright/test';

// cerebellum-65b.3 [Frontend] 会社案内シート（/office?company=1）
// 受け入れ基準（docs/specs/26-web-office-company.md §3.4）:
//   全景ヘッダの「会社案内」から開く / 部署が employees の返却順で最初に現れた順に並ぶ /
//   各部署に内訳と社員1行（名前・勤務帯 or 手動起動・job・人間確認） /
//   dept:null の社員が末尾の「部署 未記載」に出て消えていない /
//   停止中社員が各部署末尾の「停止中」小見出しの下に出る /
//   部署見出しタップで /office?dept=、社員行タップで /office?employee= /
//   画像要素（img）を含まない / generated_at が24時間以上前で鮮度警告 /
//   全景の4部屋＋MY DESK の構図が変わっていない
//
// office.json は :48310 の静的サーバが配信する外部データなので page.route で差し替える
// （実サーバの起動状態やその日の automation 実行結果にテストを依存させない。65b.1・65b.2 と同じ手法）。

function localIso(at: Date): string {
  const p = (v: number) => String(v).padStart(2, '0');
  const offset = -at.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const abs = Math.abs(offset);
  return (
    at.getFullYear() + '-' + p(at.getMonth() + 1) + '-' + p(at.getDate()) +
    'T' + p(at.getHours()) + ':' + p(at.getMinutes()) + ':' + p(at.getSeconds()) +
    sign + p(Math.floor(abs / 60)) + ':' + p(abs % 60)
  );
}

function atLocal(dayOffset: number, hhmm: string): string {
  const at = new Date();
  at.setDate(at.getDate() + dayOffset);
  const [hour, minute] = hhmm.split(':').map(Number);
  at.setHours(hour, minute, 0, 0);
  return localIso(at);
}

const profile = (over: Record<string, unknown> = {}) => ({
  job: '仕事の説明',
  command: null,
  agent: 'claude-code (opus)',
  checks: [],
  line: 'knowledge',
  upstream: [],
  downstream: [],
  dept: null,
  review: null,
  doc: null,
  ...over,
});

/**
 * 部署の並びを**返却順でしか説明できない**名簿。
 *
 * `employees` の返却順で最初に現れた `dept` の順（§3.4-2）が、他のどの並べ方とも一致しないように
 * 組んである。期待値はこの表から先に引いたもので、実装の出力に合わせて書いたものではない。
 *
 * | 並べ方 | 出る順 |
 * |---|---|
 * | **返却順で最初に現れた順（= 仕様）** | note-harness → x-harness → engineering → biz-harness |
 * | アルファベット昇順 | biz-harness → engineering → note-harness → x-harness |
 * | アルファベット降順 | x-harness → note-harness → engineering → biz-harness |
 * | 8部署 id の定義順（§4 の値域の並び） | x-harness → note-harness → biz-harness → engineering |
 * | 在籍社員だけの返却順（停止中を数え落とした実装） | note-harness → x-harness → biz-harness → engineering |
 * | 人数の多い順 | note-harness(3) → engineering(2) → biz-harness(2) → x-harness(1) |
 *
 * 最後の1つが要で、**engineering の初出（idx2 の a-x-post）は停止中**。停止中を並び決定から
 * 外した実装だと engineering が biz-harness の後ろへ落ちる（§3.4-2）。
 *
 * 停止中の位置も同様に、**返却順では停止中が先に来る**ように置いてある:
 * - note-harness: a-collect(0) → a-x-benchmark(**停止中**・4) → a-blindspot(手動・5)
 * - engineering: a-x-post(**停止中**・2) → a-eng-watchdog(6)
 * 「返却順のまま出す」だけの実装だと停止中が部署の途中に混ざる（§3.4-4 違反）。
 */
const EMPLOYEES = [
  {
    // dept:note-harness の初出。review あり（kinds 2つ・cadence:shift）
    automation_id: 'a-collect',
    name: '情報収集（collect）',
    skill: 'collect',
    enabled: true,
    shift: { hour: 5, minute: 0, days: '毎日', label: '毎日 05:00' },
    next_run_at: atLocal(1, '05:00'),
    last_run_at: atLocal(0, '05:00'),
    last_run_id: 'r-collect',
    trigger: 'scheduled',
    profile: profile({
      job: '受信箱を仕分けます',
      dept: 'note-harness',
      review: { kinds: ['approve', 'read'], cadence: 'shift' },
    }),
  },
  {
    // dept:x-harness の初出。この部署はこの1名だけ（内訳が最小になる部署）
    automation_id: 'a-ask',
    name: '相談窓口（ask）',
    skill: 'ask',
    enabled: true,
    shift: { hour: 5, minute: 30, days: '毎日', label: '毎日 05:30' },
    next_run_at: atLocal(1, '05:30'),
    last_run_at: null,
    last_run_id: null,
    trigger: 'scheduled',
    profile: profile({ job: '第二の脳に聞いて答えを返します', dept: 'x-harness' }),
  },
  {
    // dept:engineering の初出が**停止中**の社員。部署の並びは在籍状態に左右されない（§3.4-2）
    automation_id: 'a-x-post',
    name: 'X投稿（x-post）',
    skill: 'x-post',
    enabled: false,
    shift: { hour: 8, minute: 0, days: '週末', label: '週末 08:00' },
    next_run_at: null,
    last_run_at: null,
    last_run_id: null,
    trigger: 'scheduled',
    profile: profile({ job: 'ポストを書きます', line: 'x', dept: 'engineering' }),
  },
  {
    // dept:biz-harness の初出。cadence:adhoc の review（文言が「不定期」になる・§3.1-1）
    automation_id: 'a-x-followers',
    name: 'フォロワー日次（x-followers）',
    skill: 'x-followers',
    enabled: true,
    shift: { hour: 6, minute: 30, days: '毎日', label: '毎日 06:30' },
    next_run_at: atLocal(1, '06:30'),
    last_run_at: null,
    last_run_id: null,
    trigger: 'scheduled',
    profile: profile({
      job: 'フォロワー数を毎日控えます',
      line: 'x',
      dept: 'biz-harness',
      review: { kinds: ['choose'], cadence: 'adhoc' },
    }),
  },
  {
    // note-harness の停止中。**返却順では次の a-blindspot より先**（末尾送りの判別材料）
    automation_id: 'a-x-benchmark',
    name: '小垢ベンチ（x-benchmark）',
    skill: 'x-benchmark',
    enabled: false,
    shift: { hour: 6, minute: 0, days: '毎日', label: '毎日 06:00' },
    next_run_at: null,
    last_run_at: null,
    last_run_id: null,
    trigger: 'scheduled',
    profile: profile({
      job: '小垢のベンチマークを集めます',
      dept: 'note-harness',
      review: { kinds: ['alert'], cadence: 'shift' },
    }),
  },
  {
    // note-harness の手動起動。1行の勤務欄が「手動起動」になる（§3.4-1）
    automation_id: 'a-blindspot',
    name: '死角点検（night-blindspot）',
    skill: 'night-blindspot',
    enabled: true,
    shift: null,
    next_run_at: null,
    last_run_at: null,
    last_run_id: null,
    trigger: 'manual',
    profile: profile({ job: '見落としを洗い出します', command: '/blindspot', dept: 'note-harness' }),
  },
  {
    // engineering の在籍。kinds が alert だけ＝「異常のみ通知」（§3.1-1）
    automation_id: 'a-eng-watchdog',
    name: '監視（watchdog）',
    skill: 'watchdog',
    enabled: true,
    shift: { hour: 7, minute: 0, days: '毎日', label: '毎日 07:00' },
    next_run_at: atLocal(1, '07:00'),
    last_run_at: null,
    last_run_id: null,
    trigger: 'scheduled',
    profile: profile({
      job: 'プロセスの生死を見張ります',
      line: 'dev',
      dept: 'engineering',
      review: { kinds: ['alert'], cadence: 'shift' },
    }),
  },
  {
    // biz-harness の2人目。review なし＝「人間確認: なし」（欠損ではない・§3.1-1）
    automation_id: 'a-x-pdca',
    name: 'X週次PDCA（x-pdca）',
    skill: 'x-pdca',
    enabled: true,
    shift: { hour: 8, minute: 30, days: '週末', label: '週末 08:30' },
    next_run_at: atLocal(2, '08:30'),
    last_run_at: null,
    last_run_id: null,
    trigger: 'scheduled',
    profile: profile({ job: '週次で振り返ります', line: 'x', dept: 'biz-harness' }),
  },
  {
    // `dept` が明示的な null。末尾の「部署 未記載」へ（§3.4-2）
    automation_id: 'a-idea-forge',
    name: '着想鍛造（idea-forge）',
    skill: 'idea-forge',
    enabled: true,
    shift: { hour: 9, minute: 0, days: '毎日', label: '毎日 09:00' },
    next_run_at: atLocal(1, '09:00'),
    last_run_at: null,
    last_run_id: null,
    trigger: 'scheduled',
    profile: profile({ job: '思いつきを鍛えます', line: 'incubate', dept: null }),
  },
  {
    // 名簿（profile）そのものが無い社員。「部署 未記載」の束に入り、job は「名簿 未記載」（§6）
    automation_id: 'a-legacy',
    name: '旧ジョブ（legacy）',
    skill: null,
    enabled: true,
    shift: { hour: 10, minute: 0, days: '毎日', label: '毎日 10:00' },
    next_run_at: atLocal(1, '10:00'),
    last_run_at: null,
    last_run_id: null,
    trigger: 'scheduled',
    profile: null,
  },
];

/** MY DESK と席の「確認待ち」に立つのは `produced` × `note:承認待ち` だけ（20 §3.3） */
const RUNS = [
  {
    run_id: 'r-collect',
    automation_id: 'a-collect',
    title: '情報収集 run 30',
    run_number: '30',
    scheduled_for: atLocal(0, '05:00'),
    started_at: atLocal(0, '05:00'),
    status: 'completed',
    trigger: 'scheduled',
    outcome: 'produced',
    items: 2,
    note: '承認待ち',
    headline: '2件の仕分けを確認してください。',
    output: '2件の仕分けを確認してください。',
    truncated: false,
  },
];

function office(overrides: Record<string, unknown> = {}) {
  return { generated_at: localIso(new Date()), window_days: 14, employees: EMPLOYEES, runs: RUNS, ...overrides };
}

async function mockOffice(page: Page, body: unknown = office()) {
  await page.route('**/office.json', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) }),
  );
}

/** フィクスチャから先に引いた期待値（実装の出力を見て書いたものではない） */
const DEPT_ORDER = ['note-harness', 'x-harness', 'engineering', 'biz-harness', '部署 未記載'];
const ROW_ORDER = [
  // note-harness: 勤務帯 → 手動起動 → 停止中
  '情報収集（collect）',
  '死角点検（night-blindspot）',
  '小垢ベンチ（x-benchmark）',
  // x-harness
  '相談窓口（ask）',
  // engineering: 在籍 → 停止中（返却順では停止中の方が先）
  '監視（watchdog）',
  'X投稿（x-post）',
  // biz-harness
  'フォロワー日次（x-followers）',
  'X週次PDCA（x-pdca）',
  // 部署 未記載
  '着想鍛造（idea-forge）',
  '旧ジョブ（legacy）',
];

const sheet = (page: Page) => page.getByRole('region', { name: '会社案内', exact: true });
const dept = (page: Page, name: string) => page.getByRole('region', { name, exact: true });

// ---- 入口は全景ヘッダの「会社案内」1つだけ（§3.4-6） ----

test('全景ヘッダの「会社案内」から /office?company=1 を開く', async ({ page }) => {
  await mockOffice(page);
  await page.goto('/office');

  // 全景から会社案内へ行ける導線はこの1本だけ
  await expect(page.locator('a[href*="company="]')).toHaveCount(1);
  await page.getByRole('link', { name: '会社案内' }).click();

  await expect(page).toHaveURL(/\/office\?company=1$/);
  await expect(page.locator('.of3__room-title')).toHaveText('会社案内');
  await expect(sheet(page)).toBeVisible();

  await page.screenshot({ path: 'test-results/screens/cerebellum-65b.3-office-company.png', fullPage: true });
});

// ---- 部署の並び（§3.4-2） ----

test('部署は employees の返却順で最初に現れた順に並ぶ（名前順でも id 定義順でもない）', async ({ page }) => {
  await mockOffice(page);
  await page.goto('/office?company=1');

  const names = sheet(page).locator('.of__co-dept-name');
  await expect(names).toHaveText(DEPT_ORDER);

  // 上のフィクスチャ表のとおり、この並びは他のどの規則でも再現できない。
  // 取り違えやすい4つを名指しで否定しておく（同じ並びのフィクスチャでは何も検証していない）
  const shown = await names.allTextContents();
  expect(shown).not.toEqual(['biz-harness', 'engineering', 'note-harness', 'x-harness', '部署 未記載']);
  expect(shown).not.toEqual(['x-harness', 'note-harness', 'engineering', 'biz-harness', '部署 未記載']);
  expect(shown).not.toEqual(['x-harness', 'note-harness', 'biz-harness', 'engineering', '部署 未記載']);
  // 停止中の社員を並び決定から数え落とすと engineering が biz-harness の後ろへ落ちる
  expect(shown).not.toEqual(['note-harness', 'x-harness', 'biz-harness', 'engineering', '部署 未記載']);
});

// ---- 各部署の内訳と社員1行（§3.4-1・§3.2） ----

test('各部署に §3.2 の内訳が出る（部屋のヘッダと同じ形）', async ({ page }) => {
  await mockOffice(page);
  await page.goto('/office?company=1');

  // 0名の項は書かない。人間確認・名簿未記載は停止中も含めて数える（26 §3.2）
  await expect(dept(page, 'note-harness').locator('.of__co-breakdown')).toHaveText(
    '勤務帯 1名・手動 1名・停止中 1名・人間確認あり 2名',
  );
  await expect(dept(page, 'x-harness').locator('.of__co-breakdown')).toHaveText('勤務帯 1名');
  await expect(dept(page, 'engineering').locator('.of__co-breakdown')).toHaveText(
    '勤務帯 1名・停止中 1名・人間確認あり 1名',
  );
  await expect(dept(page, 'biz-harness').locator('.of__co-breakdown')).toHaveText('勤務帯 2名・人間確認あり 1名');
  await expect(dept(page, '部署 未記載').locator('.of__co-breakdown')).toHaveText('勤務帯 2名・名簿未記載 1名');
});

test('社員1行に 名前・勤務帯 or 手動起動・job・人間確認 の4つが出る', async ({ page }) => {
  await mockOffice(page);
  await page.goto('/office?company=1');

  const note = dept(page, 'note-harness');
  // 勤務帯の社員（kinds 2つ・cadence:shift）
  const collect = note.locator('.of__co-row').filter({ hasText: '情報収集（collect）' });
  await expect(collect.locator('.of__co-work')).toHaveText('毎日 05:00');
  await expect(collect.locator('.of__co-job')).toHaveText('受信箱を仕分けます');
  await expect(collect.locator('.of__co-review')).toHaveText('人間確認: approve・read（勤務帯どおり毎回）');

  // 手動起動の社員。`shift:null` を「勤務時間未設定」に落とさない（21 §3.3-1）
  const blindspot = note.locator('.of__co-row').filter({ hasText: '死角点検（night-blindspot）' });
  await expect(blindspot.locator('.of__co-work')).toHaveText('手動起動');
  await expect(blindspot.locator('.of__co-job')).toHaveText('見落としを洗い出します');
  // review:null は「なし」＝正常な状態（欠損様式に寄せない・§3.1-1）
  await expect(blindspot.locator('.of__co-review')).toHaveText('人間確認: なし');

  // kinds が alert だけ → 「異常のみ通知」（§3.1-1）
  await expect(
    dept(page, 'engineering').locator('.of__co-row').filter({ hasText: '監視（watchdog）' }).locator('.of__co-review'),
  ).toHaveText('人間確認: 異常のみ通知（勤務帯どおり毎回）');
  // cadence:adhoc → 「不定期」
  await expect(
    dept(page, 'biz-harness')
      .locator('.of__co-row')
      .filter({ hasText: 'フォロワー日次（x-followers）' })
      .locator('.of__co-review'),
  ).toHaveText('人間確認: choose（不定期）');

  // 成果物の行き先（downstream）は1行に入れない（§3.4-1）。ミニラインも持ち込まない（§3.4-5）
  await expect(sheet(page).locator('.of__ml')).toHaveCount(0);
});

// ---- dept:null は末尾の「部署 未記載」へ。消さない（§3.4-2） ----

test('dept:null の社員は末尾の「部署 未記載」に出て、1人も消えていない', async ({ page }) => {
  await mockOffice(page);
  await page.goto('/office?company=1');

  const names = sheet(page).locator('.of__co-dept-name');
  // 「末尾」であること（並びの最後の1つが未記載の束）
  await expect(names.last()).toHaveText('部署 未記載');

  const unlisted = dept(page, '部署 未記載');
  // `dept:null` の社員と `profile` ごと無い社員の両方が入る（§6）
  await expect(unlisted.locator('.of__co-name')).toHaveText(['着想鍛造（idea-forge）', '旧ジョブ（legacy）']);
  // 名簿が無い社員の job は欠損様式のまま。skill 名から補わない（21 §3.2-3）
  await expect(
    unlisted.locator('.of__co-row').filter({ hasText: '旧ジョブ（legacy）' }).locator('.of__co-job'),
  ).toHaveText('名簿 未記載');
  // 行き先が無いのでリンクにしない（部署 id を捏造しない・§3.1-3）
  await expect(unlisted.locator('a[href*="dept="]')).toHaveCount(0);

  // **消えていないこと**を員数で確かめる。フィクスチャの全社員がどこかの束に1行ずつ出る
  await expect(sheet(page).locator('.of__co-member')).toHaveCount(EMPLOYEES.length);
  await expect(sheet(page).locator('.of__co-name')).toHaveText(ROW_ORDER);
});

// ---- 停止中は各部署の末尾（§3.4-4） ----

test('停止中の社員は各部署の末尾の「停止中」小見出しの下に出る', async ({ page }) => {
  await mockOffice(page);
  await page.goto('/office?company=1');

  const note = dept(page, 'note-harness');
  // 返却順では a-x-benchmark（停止中）が a-blindspot より先。それでも末尾に来る
  await expect(note.locator('.of__co-name')).toHaveText([
    '情報収集（collect）',
    '死角点検（night-blindspot）',
    '小垢ベンチ（x-benchmark）',
  ]);
  await expect(note.locator('.of__co-block')).toHaveText(['停止中']);
  // 「停止中」の小見出し**より後ろ**に居るのは停止中の1名だけ（DOM 順＝画面の並び）
  await expect(note.locator('.of__co-block ~ .of__co-list .of__co-name')).toHaveText(['小垢ベンチ（x-benchmark）']);

  const engineering = dept(page, 'engineering');
  // engineering も同じ。返却順では停止中の X投稿 が先だが、出るのは末尾
  await expect(engineering.locator('.of__co-name')).toHaveText(['監視（watchdog）', 'X投稿（x-post）']);
  await expect(engineering.locator('.of__co-block ~ .of__co-list .of__co-name')).toHaveText(['X投稿（x-post）']);

  // 停止中が居ない部署に空の小見出しを立てない
  await expect(dept(page, 'x-harness').locator('.of__co-block')).toHaveCount(0);
  await expect(dept(page, 'biz-harness').locator('.of__co-block')).toHaveCount(0);
});

// ---- 遷移（§3.4-3） ----

test('部署見出しタップで /office?dept= の部署フロアへ移る', async ({ page }) => {
  await mockOffice(page);
  await page.goto('/office?company=1');

  await dept(page, 'engineering').getByRole('link', { name: 'engineeringの部署フロアへ' }).click();

  await expect(page).toHaveURL(/\/office\?dept=engineering$/);
  await expect(page.locator('.of3__room-title')).toHaveText('DEPT: engineering');
  // 会社案内で engineering に出ていた2名が、部署フロアにも出る（同じ束であることの確認）
  const floor = page.getByRole('region', { name: 'DEPT: engineeringの社員' });
  await expect(floor.locator('.of3__worker-name')).toHaveText(['監視（watchdog）', 'X投稿（x-post）']);
});

test('社員行タップで /office?employee= の社員カードへ移る', async ({ page }) => {
  await mockOffice(page);
  await page.goto('/office?company=1');

  await sheet(page).getByRole('link', { name: '死角点検（night-blindspot）の名簿を開く' }).click();

  await expect(page).toHaveURL(/\/office\?employee=a-blindspot$/);
  await expect(page.getByRole('dialog', { name: '死角点検（night-blindspot）の名簿' })).toBeVisible();
});

// ---- 画像を使わない（§3.4-5） ----

test('会社案内は画像要素（img）も SVG も含まない', async ({ page }) => {
  await mockOffice(page);

  // まず全景に img が居ることを確かめる（company 側の0件が「そもそも画像が無い」ではないこと）
  await page.goto('/office');
  expect(await page.locator('img').count()).toBeGreaterThan(0);

  await page.goto('/office?company=1');
  await expect(sheet(page)).toBeVisible();
  await expect(page.locator('img')).toHaveCount(0);
  // ノードグラフも持ち込まない（§3.4-5）
  await expect(page.locator('svg')).toHaveCount(0);
});

// ---- 鮮度警告（§3.4-7 → 20 §6） ----

test('generated_at が24時間以上前なら会社案内にも鮮度警告が出る', async ({ page }) => {
  const at = new Date();
  at.setHours(at.getHours() - 30);
  await mockOffice(page, office({ generated_at: localIso(at) }));
  await page.goto('/office?company=1');

  const warn = page.locator('.of__stale');
  await expect(warn).toBeVisible();
  await expect(warn).toContainText('30 時間前のものです');
  // 警告は出しても中身は出す（エラーにしない・20 §6）
  await expect(sheet(page).locator('.of__co-member')).toHaveCount(EMPLOYEES.length);
});

test('生成が新しいときは鮮度警告を出さない', async ({ page }) => {
  await mockOffice(page);
  await page.goto('/office?company=1');

  await expect(sheet(page)).toBeVisible();
  await expect(page.locator('.of__stale')).toHaveCount(0);
});

// ---- 全景の構図は変えない（§3.4-6・§3.3-6） ----

test('全景の4部屋＋MY DESK の構図が変わっていない', async ({ page }) => {
  await mockOffice(page);
  await page.goto('/office');

  const campus = page.getByRole('region', { name: 'AIオフィス全景' });
  // 実カウント: 部屋4つ・MY DESK 1つ・それ以外の子要素は無い
  await expect(campus.locator('.of3__room')).toHaveCount(4);
  await expect(campus.locator('.of3__desk')).toHaveCount(1);
  await expect(campus.locator('a, div.of3__desk')).toHaveCount(5);
  await expect(campus.locator('.of3__room-name')).toHaveText(['LIBRARY', 'LAB', 'MARKET', 'STUDIO']);
  // 会社案内・部署の導線を構図の中へ足していない（入口はヘッダ側の1本だけ）
  await expect(campus.locator('a[href*="company="]')).toHaveCount(0);
  await expect(campus.locator('a[href*="dept="]')).toHaveCount(0);
  // 全景の見出しも2項のまま。部署の内訳を全景へ持ち出さない
  await expect(page.locator('.of3__headline p')).toHaveCount(2);
  await expect(page.locator('.of3__room-breakdown')).toHaveCount(0);
});
