import { expect, test, type Page } from '@playwright/test';

// cerebellum-1wl.3 [Frontend] 会社案内の並びと見出し（docs/specs/27-web-office-departments.md §3.3）
// 受け入れ基準:
//   `departments` 付きフィクスチャで会社案内の部署が order 順・label 主の見出しで出る /
//   無しフィクスチャで 26 §3.4-2 の返却順・id 見出しに戻る / 部署 未記載が末尾に残る /
//   社員1行の4項目・停止中小見出し・タップ先・`img` 無し・鮮度警告が 26 のまま変わらない
//
// office.json は :48310 の静的サーバが配信する外部データなので page.route で差し替える
// （実サーバの起動状態やその日の automation 実行結果にテストを依存させない。65b.3・1wl.1・
// 1wl.2 と同じ手法）。

/** ローカル ISO（`+09:00` 付き）。office.json の時刻は生成側で解決済みの形（20 §2） */
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

const employee = (over: Record<string, unknown>) => ({
  automation_id: 'a-x',
  name: '社員',
  skill: 'skill',
  enabled: true,
  shift: { hour: 5, minute: 0, days: '毎日', label: '毎日 05:00' },
  next_run_at: atLocal(1, '05:00'),
  last_run_at: atLocal(0, '05:00'),
  last_run_id: null,
  trigger: 'scheduled',
  profile: profile(),
  ...over,
});

/**
 * 部署一覧（27 §2・§9 で second-brain 側が載せてくる値＝正本の編成表8部署）。
 * **cerebellum は表を持たない**ので、これはフィクスチャであって実装の定数ではない。
 * 配列の並び自体も `order` と食い違わせてある（`order` で並べていることを見るため）。
 */
const DEPARTMENTS = [
  { id: 'engineering', label: '技術', order: 8 },
  { id: 'x-harness', label: 'X運用', order: 2 },
  { id: 'growth-harness', label: '学習・成長', order: 7 },
  { id: 'second-brain-harness', label: '記憶整備', order: 1 },
  { id: 'marketing-harness', label: 'マーケ', order: 6 },
  { id: 'note-harness', label: 'note', order: 3 },
  { id: 'biz-harness', label: '事業開発', order: 5 },
  { id: 'rakuten-harness', label: '楽天', order: 4 },
];

/**
 * 部署の並びが **`order` でしか説明できない**名簿。返却順（勤務開始時刻の昇順）を
 * `order` とわざと食い違わせ、`departments` を落とした実装・配列の届いた順で並べる実装が
 * 素通りしないようにしてある。期待値はこの表から先に引いたもので、実装の出力に合わせて
 * 書いたものではない。
 *
 * | 並べ方 | 出る順（会社案内の見出し） |
 * |---|---|
 * | **`order` 昇順 → 未知 → 未記載（= 27 §3.3-1）** | 記憶整備 → X運用 → note → 楽天 → 事業開発 → 学習・成長 → 技術 → podcast-harness → 部署 未記載 |
 * | 返却順で最初に現れた順（= 26 §3.4-2 のフォールバック） | 技術 → X運用 → 楽天 → 記憶整備 → note → podcast-harness → 学習・成長 → 事業開発 → 部署 未記載 |
 * | `departments` 配列の届いた順 | 技術 → X運用 → 学習・成長 → 記憶整備 → note → 事業開発 → 楽天 → … |
 *
 * 判別の要が2つ:
 * - **x-harness の初出（idx1 の a-x-post）は停止中**。停止中を並び決定から外した実装は
 *   フォールバック側の期待値が変わるので、`departments` 無しのテストがそれを捕まえる
 * - **marketing-harness（order 6）に所属社員が0人**。会社案内の束は名簿由来なので出ない
 *   （全景の部屋は 27 §6 で出る）——並びから「マーケ」が抜けても後続が繰り上がるだけ
 */
const EMPLOYEES = [
  employee({
    // engineering（order 8）の初出。kinds が alert だけ＝「異常のみ通知」（26 §3.1-1）
    automation_id: 'a-eng-watchdog',
    name: '監視（watchdog）',
    skill: 'watchdog',
    shift: { hour: 1, minute: 0, days: '毎日', label: '毎日 01:00' },
    profile: profile({
      job: 'プロセスの生死を見張ります',
      line: 'dev',
      dept: 'engineering',
      review: { kinds: ['alert'], cadence: 'shift' },
    }),
  }),
  employee({
    // x-harness（order 2）の初出が**停止中**。部署の並びは在籍状態に左右されない（26 §3.4-2）
    automation_id: 'a-x-post',
    name: 'X投稿（x-post）',
    skill: 'x-post',
    enabled: false,
    shift: { hour: 2, minute: 0, days: '週末', label: '週末 02:00' },
    next_run_at: null,
    last_run_at: null,
    profile: profile({ job: 'ポストを書きます', line: 'x', dept: 'x-harness' }),
  }),
  employee({
    // rakuten-harness（order 4）の手動起動。1行の勤務欄が「手動起動」になる（26 §3.4-1）
    automation_id: 'a-rakuten',
    name: '楽天巡回（rakuten-watch）',
    skill: 'rakuten-watch',
    shift: null,
    next_run_at: null,
    last_run_at: null,
    trigger: 'manual',
    profile: profile({
      job: '商品ページを見回ります',
      command: '/rakuten-watch',
      line: 'rakuten',
      dept: 'rakuten-harness',
    }),
  }),
  employee({
    // second-brain-harness（order 1）。承認待ちの run を持つ（MY DESK の件数の出どころ）
    automation_id: 'a-collect',
    name: '情報収集（collect）',
    skill: 'collect',
    shift: { hour: 4, minute: 0, days: '毎日', label: '毎日 04:00' },
    last_run_id: 'r-collect',
    profile: profile({
      job: '受信箱を仕分けます',
      dept: 'second-brain-harness',
      review: { kinds: ['approve', 'read'], cadence: 'shift' },
    }),
  }),
  employee({
    // `dept` が明示的な null → 末尾の「部署 未記載」（26 §3.4-2・27 §3.1-2）
    automation_id: 'a-idea-forge',
    name: '着想鍛造（idea-forge）',
    skill: 'idea-forge',
    shift: { hour: 5, minute: 0, days: '毎日', label: '毎日 05:00' },
    last_run_at: null,
    profile: profile({ job: '思いつきを鍛えます', line: 'incubate', dept: null }),
  }),
  employee({
    automation_id: 'a-note',
    name: 'note下書き（note-draft）',
    skill: 'note-draft',
    shift: { hour: 6, minute: 0, days: '毎日', label: '毎日 06:00' },
    last_run_at: null,
    profile: profile({ job: '記事の下書きを作ります', line: 'note', dept: 'note-harness' }),
  }),
  employee({
    // `departments` に無い `dept` 値（未知の部署）。`departments` の**後ろ**に id 見出しで出る
    automation_id: 'a-podcast',
    name: '音声台本（podcast-script）',
    skill: 'podcast-script',
    shift: { hour: 7, minute: 0, days: '毎日', label: '毎日 07:00' },
    last_run_at: null,
    profile: profile({ job: '台本を書きます', line: 'none', dept: 'podcast-harness' }),
  }),
  employee({
    // growth-harness（order 7）。cadence:adhoc → 文言が「不定期」（26 §3.1-1）
    automation_id: 'a-growth',
    name: '学習計画（night-study）',
    skill: 'night-study',
    shift: { hour: 8, minute: 0, days: '毎日', label: '毎日 08:00' },
    last_run_at: null,
    profile: profile({
      job: '学ぶ順番を決めます',
      line: 'learning',
      dept: 'growth-harness',
      review: { kinds: ['choose'], cadence: 'adhoc' },
    }),
  }),
  employee({
    automation_id: 'a-biz',
    name: '事業探索（biz-scan）',
    skill: 'biz-scan',
    shift: { hour: 9, minute: 0, days: '毎日', label: '毎日 09:00' },
    last_run_at: null,
    profile: profile({ job: '種を探します', line: 'incubate', dept: 'biz-harness' }),
  }),
  employee({
    // x-harness の在籍。**返却順では停止中の a-x-post より後ろ**だが、部署内では先に出る
    // （勤務帯 → 手動起動 → 停止中・26 §3.4-4）
    automation_id: 'a-x-ask',
    name: '相談窓口（ask）',
    skill: 'ask',
    shift: { hour: 10, minute: 0, days: '毎日', label: '毎日 10:00' },
    last_run_at: null,
    profile: profile({ job: '第二の脳に聞いて答えを返します', line: 'x', dept: 'x-harness' }),
  }),
  employee({
    // `profile` ごと無い社員。「部署 未記載」の束に入り job は「名簿 未記載」（26 §6）
    automation_id: 'a-legacy',
    name: '旧ジョブ（legacy）',
    skill: null,
    shift: { hour: 11, minute: 0, days: '毎日', label: '毎日 11:00' },
    last_run_at: null,
    profile: null,
  }),
];

/** MY DESK と席の「確認待ち」に立つのは `produced` × `note:承認待ち` だけ（20 §3.3） */
const RUNS = [
  {
    run_id: 'r-collect',
    automation_id: 'a-collect',
    title: '情報収集 run 30',
    run_number: '30',
    scheduled_for: atLocal(0, '04:00'),
    started_at: atLocal(0, '04:00'),
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
  return {
    generated_at: localIso(new Date()),
    window_days: 14,
    employees: EMPLOYEES,
    runs: RUNS,
    departments: DEPARTMENTS,
    ...overrides,
  };
}

async function mockOffice(page: Page, body: unknown = office()) {
  await page.route('**/office.json', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) }),
  );
}

/** フィクスチャの表から先に引いた期待値（実装の出力を見て書いたものではない） */
// `order` 昇順 → 未知の部署（返却順）→ 部署 未記載（27 §3.3-1 → §3.1-3）
const BY_ORDER = [
  '記憶整備',
  'X運用',
  'note',
  '楽天',
  '事業開発',
  '学習・成長',
  '技術',
  'podcast-harness',
  '部署 未記載',
];
// label が届いた部署だけ id を添える（未知の部署と未記載には添えない・§3.1-5）
const BY_ORDER_IDS = [
  'second-brain-harness',
  'x-harness',
  'note-harness',
  'rakuten-harness',
  'biz-harness',
  'growth-harness',
  'engineering',
];
// `departments` が無いときのフォールバック（26 §3.4-2。停止中の初出も数える）
const BY_RETURN = [
  'engineering',
  'x-harness',
  'rakuten-harness',
  'second-brain-harness',
  'note-harness',
  'podcast-harness',
  'growth-harness',
  'biz-harness',
  '部署 未記載',
];
/** 返却順のまま label を出した実装が出す並び（＝取り違えの典型。否定に使う） */
const BY_RETURN_LABELS = [
  '技術',
  'X運用',
  '楽天',
  '記憶整備',
  'note',
  'podcast-harness',
  '学習・成長',
  '事業開発',
  '部署 未記載',
];

const sheet = (page: Page) => page.getByRole('region', { name: '会社案内', exact: true });
const dept = (page: Page, name: string) => page.getByRole('region', { name, exact: true });
const deptNames = (page: Page) => sheet(page).locator('.of__co-dept-name');

// ---- 並び: `departments[].order` 昇順（§3.3-1 → §3.1-3） ----

test('departments 付きで会社案内の部署が order 順に並ぶ（返却順でも配列の届いた順でもない）', async ({
  page,
}) => {
  await mockOffice(page);
  await page.goto('/office?company=1');

  await expect(sheet(page)).toBeVisible();
  await expect(deptNames(page)).toHaveText(BY_ORDER);

  // 上のフィクスチャ表のとおり、この並びは他のどの規則でも再現できない。
  // 取り違えやすいものを名指しで否定する（同じ並びのフィクスチャでは何も検証していない）
  const shown = await deptNames(page).allTextContents();
  // `departments` を無視して返却順で並べた実装（＝ 27 前の姿）
  expect(shown).not.toEqual(BY_RETURN_LABELS);
  // `departments` 配列の届いた順で並べた実装（`order` を読んでいない）
  expect(shown).not.toEqual([
    '技術',
    'X運用',
    '学習・成長',
    '記憶整備',
    'note',
    '事業開発',
    '楽天',
    'podcast-harness',
    '部署 未記載',
  ]);
  // 未知の部署を `departments` の前に置いた実装・未記載を末尾から動かした実装
  expect(shown.indexOf('podcast-harness')).toBe(shown.length - 2);
  expect(shown[shown.length - 1]).toBe('部署 未記載');

  await page.screenshot({ path: 'test-results/screens/cerebellum-1wl.3-office-company.png', fullPage: true });
});

test('見出しは label 主・id 添え（§3.3-2 → §3.1-5）', async ({ page }) => {
  await mockOffice(page);
  await page.goto('/office?company=1');

  // 主は日本語ラベル。id は等幅で小さく添える（全景タイル・部署ルームのヘッダと同じ見出し形）
  const ids = sheet(page).locator('.of__co-dept-id');
  await expect(ids).toHaveText(BY_ORDER_IDS);
  await expect(ids.first()).toHaveClass(/mono/);

  const memory = dept(page, '記憶整備');
  await expect(memory.locator('.of__co-dept-name')).toHaveText('記憶整備');
  await expect(memory.locator('.of__co-dept-id')).toHaveText('second-brain-harness');
  // 見出しの主に id を出していない（26 §3.4-2 の id 見出しから置き換わっている）
  await expect(memory.locator('.of__co-dept-name')).not.toContainText('second-brain-harness');

  // label が届いていない部署（未知の部署・未記載）は id / 文言だけで、添えを二重に出さない
  await expect(dept(page, 'podcast-harness').locator('.of__co-dept-id')).toHaveCount(0);
  await expect(dept(page, '部署 未記載').locator('.of__co-dept-id')).toHaveCount(0);
  // 添えの id は label が届いた7部署ぶんだけ（未知＋未記載を足した9束より少ない）
  await expect(deptNames(page)).toHaveCount(BY_ORDER.length);
});

test('order 順にしても社員は1人も消えない（束の付け替えで落ちていない）', async ({ page }) => {
  await mockOffice(page);
  await page.goto('/office?company=1');

  // フィクスチャの全社員がどこかの束に1行ずつ出る（26 §3.4-1）
  await expect(sheet(page).locator('.of__co-member')).toHaveCount(EMPLOYEES.length);
  await expect(sheet(page).locator('.of__co-name')).toHaveText([
    // 記憶整備
    '情報収集（collect）',
    // X運用: 勤務帯 → 停止中（返却順では停止中が先・26 §3.4-4）
    '相談窓口（ask）',
    'X投稿（x-post）',
    // note
    'note下書き（note-draft）',
    // 楽天（手動起動）
    '楽天巡回（rakuten-watch）',
    // 事業開発
    '事業探索（biz-scan）',
    // 学習・成長
    '学習計画（night-study）',
    // 技術
    '監視（watchdog）',
    // podcast-harness（未知の部署）
    '音声台本（podcast-script）',
    // 部署 未記載
    '着想鍛造（idea-forge）',
    '旧ジョブ（legacy）',
  ]);
});

test('departments にあって所属0人の部署は会社案内に束を作らない（全景の部屋には出る）', async ({
  page,
}) => {
  await mockOffice(page);

  // 全景は 27 §6 のとおり「マーケ」の部屋を出す（正本にある部署が空なのは見せるべき事実）
  await page.goto('/office');
  const marketing = page.getByRole('link', { name: /^マーケに入る/ });
  await expect(marketing).toBeVisible();
  await expect(marketing.locator('.of3__room-crew')).toHaveText('勤務帯 0名');

  // 会社案内の束は名簿由来のまま（26 §3.4-1「各部署に…所属社員を1行ずつ」）。
  // 27 §3.3 は並びと見出しだけの増分で、束の集合を変えていない
  await page.goto('/office?company=1');
  await expect(dept(page, 'マーケ')).toHaveCount(0);
  await expect(deptNames(page)).toHaveText(BY_ORDER);
});

// ---- `departments` 無し: 26 §3.4-2 の返却順・id 見出しへ戻る（§3.1-4） ----

test('departments が無いと返却順・id 見出しに戻る（暫定の表を持たない）', async ({ page }) => {
  await mockOffice(page, office({ departments: undefined }));
  await page.goto('/office?company=1');

  // 並びは返却順で最初に現れた順。停止中の初出（x-harness）も数える（26 §3.4-2）
  await expect(deptNames(page)).toHaveText(BY_RETURN);
  const shown = await deptNames(page).allTextContents();
  // order 順にはならない＝ id から表示名も並びも推測していない（§3.1-4・§4）
  expect(shown).not.toEqual(BY_ORDER);
  expect(shown).not.toEqual(BY_RETURN_LABELS);

  // 見出しは id そのまま・添えの id は出さない（同じ文字を2度書かない）
  await expect(sheet(page).locator('.of__co-dept-id')).toHaveCount(0);
  await expect(sheet(page).getByText('記憶整備', { exact: true })).toHaveCount(0);
  await expect(sheet(page).getByText('X運用', { exact: true })).toHaveCount(0);
  // 警告は出さない（second-brain 側の対応前の正常状態・§6）
  await expect(page.locator('.dg__warn')).toHaveCount(0);
  // 社員は1人も消えない
  await expect(sheet(page).locator('.of__co-member')).toHaveCount(EMPLOYEES.length);
});

test('departments が空配列でも返却順・id 見出し（欠落と同じ扱い）', async ({ page }) => {
  await mockOffice(page, office({ departments: [] }));
  await page.goto('/office?company=1');

  await expect(deptNames(page)).toHaveText(BY_RETURN);
  await expect(sheet(page).locator('.of__co-dept-id')).toHaveCount(0);
});

// ---- 部署 未記載は末尾（26 §3.4-2・§3.1-3） ----

test('部署 未記載はどちらのフィクスチャでも末尾に残る', async ({ page }) => {
  for (const body of [office(), office({ departments: undefined })]) {
    await page.unrouteAll();
    await mockOffice(page, body);
    await page.goto('/office?company=1');

    await expect(deptNames(page).last()).toHaveText('部署 未記載');
    const unlisted = dept(page, '部署 未記載');
    // `dept:null` の社員と `profile` ごと無い社員の両方が入る（隠さない・26 §6）
    await expect(unlisted.locator('.of__co-name')).toHaveText(['着想鍛造（idea-forge）', '旧ジョブ（legacy）']);
    await expect(
      unlisted.locator('.of__co-row').filter({ hasText: '旧ジョブ（legacy）' }).locator('.of__co-job'),
    ).toHaveText('名簿 未記載');
    // 行き先が無いのでリンクにしない（部署 id を捏造しない・26 §3.1-3）
    await expect(unlisted.locator('a[href*="dept="]')).toHaveCount(0);
    await expect(unlisted.locator('.of__co-breakdown')).toHaveText('勤務帯 2名・名簿未記載 1名');
  }
});

// ---- 26 §3.4 のまま変わらないもの: 1行の4項目・内訳（§3.3-2） ----

test('社員1行は 名前・勤務帯 or 手動起動・job・人間確認 の4つのまま', async ({ page }) => {
  await mockOffice(page);
  await page.goto('/office?company=1');

  const collect = dept(page, '記憶整備').locator('.of__co-row').filter({ hasText: '情報収集（collect）' });
  await expect(collect.locator('.of__co-work')).toHaveText('毎日 04:00');
  await expect(collect.locator('.of__co-job')).toHaveText('受信箱を仕分けます');
  await expect(collect.locator('.of__co-review')).toHaveText('人間確認: approve・read（勤務帯どおり毎回）');

  // 手動起動。`shift:null` を「勤務時間未設定」に落とさない（21 §3.3-1）
  const rakuten = dept(page, '楽天').locator('.of__co-row').filter({ hasText: '楽天巡回（rakuten-watch）' });
  await expect(rakuten.locator('.of__co-work')).toHaveText('手動起動');
  // review:null は「なし」＝正常な状態（欠損様式に寄せない・26 §3.1-1）
  await expect(rakuten.locator('.of__co-review')).toHaveText('人間確認: なし');

  // kinds が alert だけ → 「異常のみ通知」／cadence:adhoc → 「不定期」
  await expect(
    dept(page, '技術').locator('.of__co-row').filter({ hasText: '監視（watchdog）' }).locator('.of__co-review'),
  ).toHaveText('人間確認: 異常のみ通知（勤務帯どおり毎回）');
  await expect(
    dept(page, '学習・成長')
      .locator('.of__co-row')
      .filter({ hasText: '学習計画（night-study）' })
      .locator('.of__co-review'),
  ).toHaveText('人間確認: choose（不定期）');

  // 成果物の行き先（downstream）は1行に入れない（26 §3.4-1）。ミニラインも持ち込まない（§3.4-5）
  await expect(sheet(page).locator('.of__ml')).toHaveCount(0);
});

test('各部署の内訳は 26 §3.2 の形のまま（部屋のヘッダと同じ）', async ({ page }) => {
  await mockOffice(page);
  await page.goto('/office?company=1');

  // 0名の項は書かない。人間確認・名簿未記載は停止中も含めて数える（26 §3.2）
  await expect(dept(page, '記憶整備').locator('.of__co-breakdown')).toHaveText('勤務帯 1名・人間確認あり 1名');
  await expect(dept(page, 'X運用').locator('.of__co-breakdown')).toHaveText('勤務帯 1名・停止中 1名');
  await expect(dept(page, '楽天').locator('.of__co-breakdown')).toHaveText('勤務帯 0名・手動 1名');
  await expect(dept(page, '技術').locator('.of__co-breakdown')).toHaveText('勤務帯 1名・人間確認あり 1名');
});

// ---- 停止中は各部署の末尾（26 §3.4-4） ----

test('停止中の社員は部署の末尾の「停止中」小見出しの下に出る', async ({ page }) => {
  await mockOffice(page);
  await page.goto('/office?company=1');

  const x = dept(page, 'X運用');
  // 返却順では停止中の X投稿 が先。それでも末尾に来る
  await expect(x.locator('.of__co-name')).toHaveText(['相談窓口（ask）', 'X投稿（x-post）']);
  await expect(x.locator('.of__co-block')).toHaveText(['停止中']);
  // 「停止中」の小見出し**より後ろ**に居るのは停止中の1名だけ（DOM 順＝画面の並び）
  await expect(x.locator('.of__co-block ~ .of__co-list .of__co-name')).toHaveText(['X投稿（x-post）']);

  // 停止中が居ない部署に空の小見出しを立てない
  await expect(dept(page, '記憶整備').locator('.of__co-block')).toHaveCount(0);
  await expect(dept(page, '部署 未記載').locator('.of__co-block')).toHaveCount(0);
});

// ---- タップ先（26 §3.4-3） ----

test('部署見出しタップで /office?dept={id} の部署フロアへ移る（label 主でも href は id）', async ({
  page,
}) => {
  await mockOffice(page);
  await page.goto('/office?company=1');

  const link = dept(page, '記憶整備').getByRole('link', { name: '記憶整備の部署フロアへ' });
  await expect(link).toHaveAttribute('href', '/office?dept=second-brain-harness');
  await link.click();

  await expect(page).toHaveURL(/\/office\?dept=second-brain-harness$/);
  // 部署ルームのヘッダも同じ見出し形（27 §3.1-5・1wl.2 で実装済み）
  await expect(page.locator('.of3__room-title')).toHaveText('記憶整備');
  await expect(page.locator('.of3__room-header .of3__room-id')).toHaveText('second-brain-harness');
  await expect(page.getByRole('region', { name: '記憶整備の社員' }).locator('.of3__worker-name')).toHaveText([
    '情報収集（collect）',
  ]);
});

test('label が無い部署の見出しタップも id で部署フロアへ移る', async ({ page }) => {
  await mockOffice(page);
  await page.goto('/office?company=1');

  await dept(page, 'podcast-harness').getByRole('link', { name: 'podcast-harnessの部署フロアへ' }).click();
  await expect(page).toHaveURL(/\/office\?dept=podcast-harness$/);
  await expect(page.locator('.of3__room-title')).toHaveText('DEPT: podcast-harness');
});

test('社員行タップで /office?employee= の社員カードへ移る', async ({ page }) => {
  await mockOffice(page);
  await page.goto('/office?company=1');

  await sheet(page).getByRole('link', { name: '楽天巡回（rakuten-watch）の名簿を開く' }).click();

  await expect(page).toHaveURL(/\/office\?employee=a-rakuten$/);
  await expect(page.getByRole('dialog', { name: '楽天巡回（rakuten-watch）の名簿' })).toBeVisible();
});

// ---- 画像を使わない（26 §3.4-5） ----

test('会社案内は画像要素（img）も SVG も含まない', async ({ page }) => {
  await mockOffice(page);

  // まず全景に img が居ることを確かめる（company 側の0件が「そもそも画像が無い」ではないこと）
  await page.goto('/office');
  expect(await page.locator('img').count()).toBeGreaterThan(0);

  await page.goto('/office?company=1');
  await expect(sheet(page)).toBeVisible();
  await expect(page.locator('img')).toHaveCount(0);
  await expect(page.locator('svg')).toHaveCount(0);
});

// ---- 鮮度警告（26 §3.4-7 → 20 §6） ----

test('generated_at が24時間以上前なら会社案内にも鮮度警告が出る', async ({ page }) => {
  const at = new Date();
  at.setHours(at.getHours() - 30);
  await mockOffice(page, office({ generated_at: localIso(at) }));
  await page.goto('/office?company=1');

  const warn = page.locator('.of__stale');
  await expect(warn).toBeVisible();
  await expect(warn).toContainText('30 時間前のものです');
  // 警告は出しても中身は出す（エラーにしない・20 §6）。並びも label 主のまま
  await expect(deptNames(page)).toHaveText(BY_ORDER);
  await expect(sheet(page).locator('.of__co-member')).toHaveCount(EMPLOYEES.length);
});

test('生成が新しいときは鮮度警告を出さない', async ({ page }) => {
  await mockOffice(page);
  await page.goto('/office?company=1');

  await expect(sheet(page)).toBeVisible();
  await expect(page.locator('.of__stale')).toHaveCount(0);
});

// ---- デザイン正本の撮り直し（§5・実装単位3） ----

/**
 * デザイン正本（20 §5 の `cerebellum-office-my-desk-focus.png`）用の名簿。
 * 正本は「うちの会社の姿」を見せる画なので、未知の部署・部署 未記載を混ぜず
 * **正本の編成表8部署がそろった状態**にする（構図は元の画像に合わせて
 * 昨夜：正常・あなたの仕事：2件・MY DESK に承認待ちの書類）。
 */
const DESIGN_KEEP = ['a-collect', 'a-x-ask', 'a-note', 'a-rakuten', 'a-biz', 'a-growth', 'a-eng-watchdog'];
const DESIGN_EMPLOYEES = [
  ...EMPLOYEES.filter((member) => DESIGN_KEEP.includes(member.automation_id)),
  employee({
    automation_id: 'a-marketing',
    name: '市場観測（marketing-scan）',
    skill: 'marketing-scan',
    shift: { hour: 12, minute: 0, days: '毎日', label: '毎日 12:00' },
    last_run_at: null,
    profile: profile({ job: '売れ筋を観測します', line: 'none', dept: 'marketing-harness' }),
  }),
];

test('全景は8部署＋MY DESK（デザイン正本 cerebellum-office-my-desk-focus.png の撮り直し）', async ({
  page,
}) => {
  await mockOffice(page, office({ employees: DESIGN_EMPLOYEES }));
  await page.goto('/office');

  // 撮る前に構図を確かめる（正本の画像が「いまの画面」であることの担保）。
  // MY DESK は据え置き（27 §3.1-7）で、承認待ちがあるので書類が出る（20 §3.3）
  const campus = page.getByRole('region', { name: 'AIオフィス全景' });
  await expect(campus.locator('.of3__desk')).toHaveCount(1);
  await expect(campus.locator('.of3__desk-status')).toContainText('承認待ち 2');
  await expect(campus.locator('.of3__folders')).toHaveCount(1);
  // 部屋は正本の編成表8部署が order 順（未知の部署・部署 未記載は混ざらない）
  await expect(campus.locator('.of3__room-name')).toHaveText([
    '記憶整備',
    'X運用',
    'note',
    '楽天',
    '事業開発',
    'マーケ',
    '学習・成長',
    '技術',
  ]);
  await expect(page.locator('.of3__headline p')).toHaveCount(2);
  await expect(page.locator('.of3__headline')).toContainText('昨夜：正常');
  await expect(page.locator('.of3__headline')).toContainText('あなたの仕事：2件');

  await page.screenshot({ path: 'test-results/screens/cerebellum-1wl.3-office-overview.png', fullPage: true });
});
