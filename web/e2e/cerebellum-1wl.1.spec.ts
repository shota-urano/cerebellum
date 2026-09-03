import { expect, test, type Page } from '@playwright/test';

// cerebellum-1wl.1 [Frontend] 全景の部屋を `dept` で切る（docs/specs/27-web-office-departments.md §3.1）
// 受け入れ基準:
//   `departments` 付きで8部屋が order 順・見出しが label 主 / id 添え /
//   `departments` 無しで見出しが id・並びが返却順（警告なし）/
//   `dept:null` と `profile` 無しが末尾「部署 未記載」に入り、0人ならその部屋が出ない /
//   `departments` にあって所属0人の部署は「0名」で出る / 未知の `dept` は departments の後に id 見出し /
//   skill 名が market / post を含む社員が旧規則の部屋に振られない（`dept` だけで決まる）/
//   部屋の信号と文言が 20 §3.1-4 のまま / 最上部2行と MY DESK が変わっていない /
//   390px の最初の viewport に最上部2行・MY DESK・先頭4部屋が入り、社員数を倍にしても全景の高さが変わらない
//
// office.json は :48310 の静的サーバが配信する外部データなので page.route で差し替える
// （実サーバの起動状態やその日の automation 実行結果にテストを依存させない。004.1・65b.* と同じ手法）。

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
  line: null,
  upstream: [],
  downstream: [],
  review: null,
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
 * 正本の編成表（Vault `85_定義/ハーネス組織.md`）と同じ8部署。**cerebellum は表を持たない**ので、
 * これはフィクスチャ（second-brain 側が office.json に載せてくる値・§9）であって実装の定数ではない。
 * `order` は返却順とわざと食い違わせる（並びが order で決まっていることを見るため）。
 */
const DEPARTMENTS = [
  { id: 'engineering', label: '技術', order: 8 },
  { id: 'second-brain-harness', label: '記憶整備', order: 1 },
  { id: 'x-harness', label: 'X運用', order: 2 },
  { id: 'note-harness', label: 'note', order: 3 },
  { id: 'rakuten-harness', label: '楽天', order: 4 },
  { id: 'biz-harness', label: '事業開発', order: 5 },
  { id: 'marketing-harness', label: 'マーケ', order: 6 },
  { id: 'growth-harness', label: '学習・成長', order: 7 },
];

const ORDERED_LABELS = ['記憶整備', 'X運用', 'note', '楽天', '事業開発', 'マーケ', '学習・成長', '技術'];
const ORDERED_IDS = [
  'second-brain-harness',
  'x-harness',
  'note-harness',
  'rakuten-harness',
  'biz-harness',
  'marketing-harness',
  'growth-harness',
  'engineering',
];

/**
 * 8部署ぶんの社員。返却順（勤務開始時刻の昇順）は `order` と違う並びにしてある。
 *
 * 旧規則（20 §3.1-3 の正規表現）の道連れを混ぜてある:
 * - `a-market-intake`（skill `market-intake`）は旧 MARKET 行き。`dept` は `second-brain-harness`
 * - `a-x-post`（skill `x-post`）は旧 STUDIO 行き。`dept` は `note-harness`
 * どちらも **`dept` の部屋にだけ**出ることを見る（§3.1-1）。
 */
const EMPLOYEES = [
  employee({
    automation_id: 'a-market-intake',
    name: '候補仕入れ（market-intake）',
    skill: 'market-intake',
    shift: { hour: 2, minute: 40, days: '平日', label: '平日 02:40' },
    profile: profile({ dept: 'second-brain-harness' }),
    last_run_id: 'r-market-intake',
  }),
  employee({
    automation_id: 'a-x-post',
    name: 'X投稿（x-post）',
    skill: 'x-post',
    shift: { hour: 3, minute: 0, days: '毎日', label: '毎日 03:00' },
    profile: profile({ dept: 'note-harness' }),
    last_run_id: 'r-x-post',
  }),
  employee({
    automation_id: 'a-consolidate',
    name: '記憶整理（consolidate）',
    skill: 'consolidate',
    shift: { hour: 4, minute: 0, days: '毎日', label: '毎日 04:00' },
    profile: profile({ dept: 'second-brain-harness' }),
    last_run_id: 'r-consolidate',
  }),
  employee({
    automation_id: 'a-x-reply',
    name: 'リプ補助（x-reply）',
    skill: 'x-reply',
    profile: profile({ dept: 'x-harness' }),
    last_run_id: 'r-x-reply',
  }),
  employee({
    automation_id: 'a-rakuten',
    name: '楽天棚卸し（rakuten-audit）',
    skill: 'rakuten-audit',
    shift: { hour: 6, minute: 0, days: '毎日', label: '毎日 06:00' },
    profile: profile({ dept: 'rakuten-harness' }),
  }),
  employee({
    automation_id: 'a-biz',
    name: '事業ネタ出し（biz-seed）',
    skill: 'biz-seed',
    shift: { hour: 7, minute: 0, days: '毎日', label: '毎日 07:00' },
    profile: profile({ dept: 'biz-harness' }),
  }),
  employee({
    automation_id: 'a-marketing',
    name: '販路点検（marketing-scan）',
    skill: 'marketing-scan',
    shift: { hour: 8, minute: 0, days: '毎日', label: '毎日 08:00' },
    profile: profile({ dept: 'marketing-harness' }),
  }),
  employee({
    // 手動起動（内訳に「手動 1名」が出る部署）
    automation_id: 'a-study',
    name: '夜学（night-study）',
    skill: 'night-study',
    shift: null,
    next_run_at: null,
    trigger: 'manual',
    profile: profile({ command: '/night-study', dept: 'growth-harness' }),
  }),
  employee({
    // 停止中（内訳に「停止中 1名」が出る部署）
    automation_id: 'a-eng-retired',
    name: '旧監視（retired-watchdog）',
    skill: 'watchdog',
    enabled: false,
    shift: { hour: 9, minute: 0, days: '毎日', label: '毎日 09:00' },
    next_run_at: null,
    profile: profile({ dept: 'engineering' }),
  }),
  employee({
    automation_id: 'a-eng-ci',
    name: 'CI見張り（ci-watch）',
    skill: 'ci-watch',
    shift: { hour: 10, minute: 0, days: '毎日', label: '毎日 10:00' },
    profile: profile({ dept: 'engineering' }),
  }),
];

/** `dept` が届かない社員2名（明示 null と `profile` ごと無い社員。どちらも「部署 未記載」・§3.1-2） */
const UNASSIGNED = [
  employee({
    automation_id: 'a-idea-forge',
    name: '着想鍛造（idea-forge）',
    skill: 'idea-forge',
    shift: { hour: 11, minute: 0, days: '毎日', label: '毎日 11:00' },
    profile: profile({ dept: null }),
  }),
  employee({
    automation_id: 'a-bare',
    name: '旧バックアップ（bare）',
    skill: null,
    shift: { hour: 12, minute: 0, days: '毎日', label: '毎日 12:00' },
    profile: null,
  }),
];

/** 信号の優先順（20 §3.1-4）を4部署に散らす。人間対応→失敗→実行中→正常 */
const RUNS = [
  {
    run_id: 'r-market-intake',
    automation_id: 'a-market-intake',
    title: '候補仕入れ run 12',
    run_number: '12',
    scheduled_for: atLocal(0, '02:40'),
    started_at: atLocal(0, '02:40'),
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
    run_id: 'r-x-post',
    automation_id: 'a-x-post',
    title: 'X投稿 run 30',
    run_number: '30',
    scheduled_for: atLocal(0, '03:00'),
    started_at: atLocal(0, '03:00'),
    status: 'error',
    trigger: 'scheduled',
    outcome: 'failed',
    items: null,
    note: null,
    headline: '投稿に失敗しました。',
    output: '投稿に失敗しました。',
    truncated: false,
  },
  {
    run_id: 'r-x-reply',
    automation_id: 'a-x-reply',
    title: 'リプ補助 run 4',
    run_number: '4',
    scheduled_for: atLocal(0, '05:00'),
    started_at: atLocal(0, '05:00'),
    status: 'running',
    trigger: 'scheduled',
    outcome: 'running',
    items: null,
    note: null,
    headline: null,
    output: null,
    truncated: false,
  },
  {
    run_id: 'r-consolidate',
    automation_id: 'a-consolidate',
    title: '記憶整理 run 8',
    run_number: '8',
    scheduled_for: atLocal(0, '04:00'),
    started_at: atLocal(0, '04:00'),
    status: 'completed',
    trigger: 'scheduled',
    outcome: 'produced',
    items: 3,
    note: null,
    headline: '3件まとめました。',
    output: '3件まとめました。',
    truncated: false,
  },
];

function office(overrides: Record<string, unknown> = {}) {
  return {
    generated_at: localIso(new Date()),
    window_days: 14,
    employees: [...EMPLOYEES, ...UNASSIGNED],
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

const campus = (page: Page) => page.getByRole('region', { name: 'AIオフィス全景' });
const room = (page: Page, title: string) => page.getByRole('link', { name: new RegExp(`^${title}に入る`) });

// ---- `departments` 付き: order 順・label 主 / id 添え（§3.1-3・§3.1-5） ----

test('departments 付きで8部屋が order 順に出て、見出しが label 主・id 添えになる', async ({ page }) => {
  await mockOffice(page, office({ employees: EMPLOYEES }));
  await page.goto('/office');

  // `dept` の値ごとに1部屋。旧4部屋（LIBRARY / LAB / MARKET / STUDIO）は消えている
  await expect(campus(page).locator('.of3__room')).toHaveCount(8);
  await expect(campus(page).locator('.of3__room-name')).toHaveText(ORDERED_LABELS);
  // 見出しは label が主で、id を等幅で小さく添える（§3.1-5）
  await expect(campus(page).locator('.of3__room-id')).toHaveText(ORDERED_IDS);
  for (const legacy of ['LIBRARY', 'LAB', 'MARKET', 'STUDIO']) {
    await expect(campus(page).getByText(legacy, { exact: true })).toHaveCount(0);
  }
  // 部屋タップの行き先はその部署のフロア（部屋 id ＝ `dept` の id・§3.2-1）。
  // cerebellum-1wl.2 で §3.2-1 の正規の入口が `?room=` になったのでクエリ名だけ更新した
  // （`?dept=` は互換の別名として残る）。行き先の部署は変えていない
  await expect(room(page, '記憶整備')).toHaveAttribute('href', '/office?room=second-brain-harness');

  await page.screenshot({ path: 'test-results/screens/cerebellum-1wl.1-office.png', fullPage: false });
});

test('所属社員数の内訳が部屋ごとに 26 §3.2 の形で出る', async ({ page }) => {
  await mockOffice(page, office({ employees: EMPLOYEES }));
  await page.goto('/office');

  const crew = (title: string) => room(page, title).locator('.of3__room-crew');
  await expect(crew('記憶整備')).toHaveText('勤務帯 2名');
  await expect(crew('学習・成長')).toHaveText('勤務帯 0名・手動 1名');
  await expect(crew('技術')).toHaveText('勤務帯 1名・停止中 1名');
  await expect(crew('楽天')).toHaveText('勤務帯 1名');
});

test('departments にあって所属0人の部署も部屋を出す（内訳は「0名」）', async ({ page }) => {
  // マーケの唯一の社員を抜く。`departments` には残るので**部屋は出続ける**
  // （正本にある部署が空なのは見せるべき事実・§6）
  const withoutMarketing = EMPLOYEES.filter((employee) => employee.automation_id !== 'a-marketing');
  await mockOffice(page, office({ employees: withoutMarketing }));
  await page.goto('/office');

  // 8部屋のまま。0人の部署だけが消える実装だと7部屋になる
  await expect(campus(page).locator('.of3__room')).toHaveCount(8);
  await expect(campus(page).locator('.of3__room-name')).toHaveText(ORDERED_LABELS);
  const marketing = room(page, 'マーケ');
  await expect(marketing).toBeVisible();
  await expect(marketing.locator('.of3__room-crew')).toHaveText('勤務帯 0名');
  await expect(marketing).toHaveAttribute('aria-label', 'マーケに入る、社員0名');
  // 0人でも信号は 20 §3.1-4 の文言のまま（空をエラーにしない・20 §4）
  await expect(marketing.locator('.of3__room-signal')).toHaveText('正常');
  await expect(page.locator('.banner')).toHaveCount(0);
  // 他の部屋は動かない（抜いた社員が別の部屋へ寄せられていない）
  await expect(room(page, '事業開発').locator('.of3__room-crew')).toHaveText('勤務帯 1名');
});

// ---- `departments` 無し: 見出しは id・並びは返却順（§3.1-4） ----

test('departments が無ければ見出しは id・並びは返却順になり、警告は出ない', async ({ page }) => {
  await mockOffice(page, office({ employees: EMPLOYEES, departments: undefined }));
  await page.goto('/office');

  // 返却順（勤務開始時刻の昇順）で最初に現れた順。order 順（記憶整備→X運用→…）にはならない
  await expect(campus(page).locator('.of3__room-name')).toHaveText([
    'second-brain-harness',
    'note-harness',
    'x-harness',
    'rakuten-harness',
    'biz-harness',
    'marketing-harness',
    'growth-harness',
    'engineering',
  ]);
  // id を見出しに出したので、添えの id 行は出さない（同じ文字を2度書かない・§3.1-5）
  await expect(campus(page).locator('.of3__room-id')).toHaveCount(0);
  // id から表示名を推測しない（暫定の対応表を画面に持たない・§3.1-4）
  for (const label of ORDERED_LABELS) {
    await expect(campus(page).getByText(label, { exact: true })).toHaveCount(0);
  }
  // second-brain 側の対応前の**正常な状態**なので警告もエラーも出さない（§6）
  await expect(page.locator('.dg__warn')).toHaveCount(0);
  await expect(page.locator('.banner')).toHaveCount(0);
});

// ---- 「部署 未記載」（§3.1-2） ----

test('dept:null と profile 無しの社員は末尾の「部署 未記載」に入る', async ({ page }) => {
  await mockOffice(page);
  await page.goto('/office');

  const names = campus(page).locator('.of3__room-name');
  await expect(names).toHaveText([...ORDERED_LABELS, '部署 未記載']);
  // 未記載は常に最後（未知の部署より後・§3.1-3）
  await expect(room(page, '部署 未記載').locator('.of3__room-crew')).toHaveText(
    '勤務帯 2名・名簿未記載 1名',
  );
  // 予約語 `unassigned` の部屋（§3.2-1・§4）。cerebellum-1wl.2 で入口が `?room=` になった
  await expect(room(page, '部署 未記載')).toHaveAttribute('href', '/office?room=unassigned');
  // 全景では社員名を出さない（20 §3.1-1 のまま）
  await expect(campus(page)).not.toContainText('着想鍛造');
});

test('該当0人なら「部署 未記載」の部屋は出ない', async ({ page }) => {
  await mockOffice(page, office({ employees: EMPLOYEES }));
  await page.goto('/office');

  await expect(campus(page).locator('.of3__room')).toHaveCount(8);
  await expect(campus(page)).not.toContainText('部署 未記載');
});

// ---- 未知の `dept`（§3.1-3・§6） ----

test('departments に無い dept 値は departments の後に id 見出しで出る', async ({ page }) => {
  const unknown = employee({
    automation_id: 'a-podcast',
    name: '音声収録（podcast）',
    skill: 'podcast',
    shift: { hour: 1, minute: 0, days: '毎日', label: '毎日 01:00' },
    profile: profile({ dept: 'podcast-harness' }),
  });
  // 返却順では**先頭**（01:00）。それでも departments の8部署より後に出る
  await mockOffice(page, office({ employees: [unknown, ...EMPLOYEES, ...UNASSIGNED] }));
  await page.goto('/office');

  await expect(campus(page).locator('.of3__room-name')).toHaveText([
    ...ORDERED_LABELS,
    'podcast-harness',
    '部署 未記載',
  ]);
  // 未知の値も検査せず・翻訳せず、id のまま出す（§4・§6）
  await expect(room(page, 'podcast-harness').locator('.of3__room-id')).toHaveCount(0);
  await expect(room(page, 'podcast-harness').locator('.of3__room-crew')).toHaveText('勤務帯 1名');
});

// ---- 旧規則は効いていない（§3.1-1） ----

test('skill 名が market / post を含む社員も dept の部屋にだけ出る', async ({ page }) => {
  await mockOffice(page, office({ employees: EMPLOYEES }));
  await page.goto('/office');

  // 旧規則なら market-intake → MARKET、x-post → STUDIO。いまは `dept` だけで決まる。
  // 記憶整備 = market-intake + consolidate の2名、note = x-post の1名
  await expect(room(page, '記憶整備').locator('.of3__room-crew')).toHaveText('勤務帯 2名');
  await expect(room(page, 'note').locator('.of3__room-crew')).toHaveText('勤務帯 1名');
  await expect(room(page, '記憶整備')).toHaveAttribute('aria-label', '記憶整備に入る、社員2名');
  await expect(room(page, 'note')).toHaveAttribute('aria-label', 'noteに入る、社員1名');
});

// ---- 信号と文言は 20 §3.1-4 のまま ----

test('部屋の信号は 人間対応→失敗→実行中→正常 の優先順と文言のまま', async ({ page }) => {
  await mockOffice(page, office({ employees: EMPLOYEES }));
  await page.goto('/office');

  // 記憶整備: 承認待ち2件（market-intake）と成果あり（consolidate）→ 人間対応が勝つ
  await expect(room(page, '記憶整備')).toContainText('確認 2');
  await expect(room(page, '記憶整備').locator('.of3__room-signal--action')).toBeVisible();
  // note: failed のみ → 失敗
  await expect(room(page, 'note')).toContainText('失敗 1');
  await expect(room(page, 'note').locator('.of3__room-signal--bad')).toBeVisible();
  // X運用: running のみ → 処理中…
  await expect(room(page, 'X運用')).toContainText('処理中…');
  await expect(room(page, 'X運用').locator('.of3__room-signal--live')).toBeVisible();
  // 楽天: run 無し → 正常（0件はエラーにしない・20 §4）
  await expect(room(page, '楽天')).toContainText('正常');
  await expect(page.locator('.banner')).toHaveCount(0);
});

// ---- 最上部2行と MY DESK は据え置き（§3.1-7） ----

test('最上部の2行と MY DESK が変わっていない', async ({ page }) => {
  await mockOffice(page);
  await page.goto('/office');

  const headline = page.getByLabel('昨夜のオフィス概要');
  await expect(page.locator('.of3__headline p')).toHaveCount(2);
  await expect(headline).toContainText('昨夜：失敗 1');
  await expect(headline).toContainText('あなたの仕事：2件');

  // MY DESK の件数の出どころ（直近 run の `note = "承認待ち"`）も変えない（§7）
  const desk = campus(page).getByRole('link', { name: 'MY DESK、承認待ち2件' });
  await expect(desk).toBeVisible();
  await expect(desk).toHaveAttribute('href', '/office?desk=1');
  await expect(campus(page).locator('.of3__desk')).toHaveCount(1);
  await expect(page.locator('.of3__stopped-count')).toHaveText('停止中 1名');
  // 会社案内への導線は全景から1つだけ（26 §3.4-6）
  await expect(page.locator('a[href*="company="]')).toHaveCount(1);
});

// ---- 390px の最初の viewport と、社員数に依存しない高さ（§3.1-8） ----

test('390px の最初の viewport に最上部2行・MY DESK・先頭4部屋が入る', async ({ page }) => {
  await mockOffice(page);
  await page.goto('/office');

  await expect(campus(page).locator('.of3__room')).toHaveCount(9);
  const bottoms = await page.evaluate(() => {
    const bottom = (selector: string) =>
      document.querySelector(selector)?.getBoundingClientRect().bottom ?? Number.NaN;
    const rooms = Array.from(document.querySelectorAll('.of3__room'));
    return {
      viewport: window.innerHeight,
      headline: bottom('.of3__headline'),
      desk: bottom('.of3__desk'),
      // 部屋の先頭2行分＝2列タイルの4部屋（§3.1-8）
      fourthRoom: rooms[3].getBoundingClientRect().bottom,
      scrollY: window.scrollY,
    };
  });
  expect(bottoms.viewport).toBe(844);
  expect(bottoms.scrollY).toBe(0);
  expect(bottoms.headline).toBeLessThanOrEqual(bottoms.viewport);
  expect(bottoms.desk).toBeLessThanOrEqual(bottoms.viewport);
  expect(bottoms.fourthRoom).toBeLessThanOrEqual(bottoms.viewport);
});

test('社員数を倍にしても全景の高さは変わらない（部屋数にだけ依存する）', async ({ page }) => {
  const height = async () => {
    const box = await campus(page).boundingBox();
    return box?.height ?? Number.NaN;
  };

  await mockOffice(page);
  await page.goto('/office');
  await expect(campus(page).locator('.of3__room')).toHaveCount(9);
  const before = await height();

  // 同じ部署に社員を増やす（部屋数は変わらない）。全景は社員名も席も出さないので伸びない
  const doubled = [...EMPLOYEES, ...UNASSIGNED].map((original) => ({
    ...original,
    automation_id: original.automation_id + '-2',
    name: original.name + '（増員）',
  }));
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await mockOffice(page, office({ employees: [...EMPLOYEES, ...UNASSIGNED, ...doubled] }));
  await page.goto('/office');
  await expect(campus(page).locator('.of3__room')).toHaveCount(9);
  await expect(room(page, '記憶整備').locator('.of3__room-crew')).toHaveText('勤務帯 4名');

  expect(await height()).toBe(before);
});
