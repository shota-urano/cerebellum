import { expect, test, type Page } from '@playwright/test';

// cerebellum-1wl.2 [Frontend] 部署ルームの統合（docs/specs/27-web-office-departments.md §3.2）
// 受け入れ基準:
//   全景の部屋タップで /office?room={deptId} に入り 26 §3.3 と同じ席・ブロック分け・状態表示で
//   所属社員だけが出る / /office?dept={id} が同じ画面になる /
//   /office?room=unassigned に部署 未記載の社員が出る /
//   library / lab / market / studio と未知 id で空状態＋全景への導線が出る（リダイレクトしない）/
//   room と line 同時指定で room が勝つ / ヘッダが label 主・id 添え＋内訳になる
//
// office.json は :48310 の静的サーバが配信する外部データなので page.route で差し替える
// （実サーバの起動状態やその日の automation 実行結果にテストを依存させない。1wl.1・65b.2 と同じ手法）。

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
 * 部署一覧（27 §2・§9 で second-brain 側が載せてくる値）。**cerebellum は表を持たない**ので
 * これはフィクスチャであって実装の定数ではない。`order` は返却順とわざと食い違わせる。
 */
const DEPARTMENTS = [
  { id: 'growth-harness', label: '学習・成長', order: 7 },
  { id: 'second-brain-harness', label: '記憶整備', order: 1 },
  { id: 'x-harness', label: 'X運用', order: 2 },
];

/**
 * 部屋（＝部署・27 §3.1-1）とライン（`profile.line`）の軸を**一致させない**名簿。
 * 軸が同じ集合だと「line で絞る誤実装」「room と line を掛ける誤実装」が素通りする。
 *
 * | 軸 | 集合 |
 * |---|---|
 * | `room=x-harness`（=`dept=x-harness`） | **ask**・x-benchmark・x-post・x-pdca |
 * | `room=growth-harness` | **x-followers** |
 * | `room=second-brain-harness` | collect |
 * | `room=unassigned` | idea-forge・legacy |
 * | `line=x` | x-benchmark・**x-followers**・x-post・x-pdca |
 * | `line=knowledge` | collect・**ask** |
 *
 * 判別の要は2名——**a-ask**（`line:knowledge` / `dept:x-harness`）と
 * **a-x-followers**（`line:x` / `dept:growth-harness`）。
 */
const EMPLOYEES = [
  employee({
    automation_id: 'a-collect',
    name: '情報収集（collect）',
    skill: 'collect',
    shift: { hour: 5, minute: 0, days: '毎日', label: '毎日 05:00' },
    last_run_id: 'r-collect',
    profile: profile({ job: '受信箱を仕分けます', line: 'knowledge', dept: 'second-brain-harness' }),
  }),
  employee({
    // 判別の要①: `dept:x-harness` だが `line:knowledge`
    automation_id: 'a-ask',
    name: '相談窓口（ask）',
    skill: 'ask',
    shift: { hour: 5, minute: 30, days: '毎日', label: '毎日 05:30' },
    last_run_at: null,
    profile: profile({ job: '第二の脳に聞いて答えを返します', line: 'knowledge', dept: 'x-harness' }),
  }),
  employee({
    // 承認待ちの run を持つ（席の状態表示の主役・20 §3.3-1）
    automation_id: 'a-x-benchmark',
    name: '小垢ベンチ（x-benchmark）',
    skill: 'x-benchmark',
    shift: { hour: 6, minute: 0, days: '毎日', label: '毎日 06:00' },
    last_run_id: 'r-x-benchmark',
    profile: profile({
      job: '小垢のベンチマークを集めます',
      line: 'x',
      dept: 'x-harness',
      review: { kinds: ['alert'], cadence: 'shift' },
    }),
  }),
  employee({
    // 判別の要②: `line:x` だが `dept:growth-harness`
    automation_id: 'a-x-followers',
    name: 'フォロワー日次（x-followers）',
    skill: 'x-followers',
    shift: { hour: 6, minute: 30, days: '毎日', label: '毎日 06:30' },
    last_run_id: 'r-x-followers',
    profile: profile({ job: 'フォロワー数を毎日控えます', line: 'x', dept: 'growth-harness' }),
  }),
  employee({
    // 手動起動（部署内の「手動起動」ブロック・21 §3.4-1）
    automation_id: 'a-x-post',
    name: 'X投稿（x-post）',
    skill: 'x-post',
    shift: null,
    next_run_at: null,
    last_run_at: null,
    trigger: 'manual',
    profile: profile({ job: 'ポストを書きます', command: '/x-post', line: 'x', dept: 'x-harness' }),
  }),
  employee({
    // 停止中（部署内の「停止中」ブロック）
    automation_id: 'a-x-pdca',
    name: 'X週次PDCA（x-pdca）',
    skill: 'x-pdca',
    enabled: false,
    shift: { hour: 8, minute: 0, days: '週末', label: '週末 08:00' },
    next_run_at: null,
    last_run_at: null,
    profile: profile({ job: '週次で振り返ります', line: 'x', dept: 'x-harness' }),
  }),
  employee({
    // `dept` が明示的な null → 「部署 未記載」の部屋（§3.1-2・§3.2-1 の予約語）
    automation_id: 'a-idea-forge',
    name: '着想鍛造（idea-forge）',
    skill: 'idea-forge',
    shift: { hour: 9, minute: 0, days: '毎日', label: '毎日 09:00' },
    last_run_at: null,
    profile: profile({ job: '思いつきを鍛えます', line: 'incubate', dept: null }),
  }),
  employee({
    // `profile` ごと無い社員。やはり「部署 未記載」（内訳の「名簿未記載」に数える・26 §3.2-2）
    automation_id: 'a-legacy',
    name: '旧ジョブ（legacy）',
    skill: null,
    shift: { hour: 10, minute: 0, days: '毎日', label: '毎日 10:00' },
    last_run_at: null,
    profile: null,
  }),
];

const RUNS = [
  {
    // 人間対応（黄）。X運用の部屋・席に「確認待ち 1」が立つ
    run_id: 'r-x-benchmark',
    automation_id: 'a-x-benchmark',
    title: '小垢ベンチ run 8',
    run_number: '8',
    scheduled_for: atLocal(0, '06:00'),
    started_at: atLocal(0, '06:00'),
    status: 'completed',
    trigger: 'scheduled',
    outcome: 'produced',
    items: 1,
    note: '承認待ち',
    headline: 'ベンチ候補を1件出しました。',
    output: 'ベンチ候補を1件出しました。',
    truncated: false,
  },
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
    items: 3,
    note: null,
    headline: '3件仕分けました。',
    output: '3件仕分けました。',
    truncated: false,
  },
  {
    // 実行中（シアン）。学習・成長の部屋・席が「処理中…」になる
    run_id: 'r-x-followers',
    automation_id: 'a-x-followers',
    title: 'フォロワー日次 run 4',
    run_number: '4',
    scheduled_for: atLocal(0, '06:30'),
    started_at: atLocal(0, '06:30'),
    status: 'running',
    trigger: 'scheduled',
    outcome: 'running',
    items: null,
    note: null,
    headline: null,
    output: null,
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

const campus = (page: Page) => page.getByRole('region', { name: 'AIオフィス全景' });
const roomTile = (page: Page, title: string) =>
  page.getByRole('link', { name: new RegExp(`^${title}に入る`) });
const floorOf = (page: Page, title: string) => page.getByRole('region', { name: `${title}の社員` });
/** X運用（dept:x-harness）の席の並び。ブロックは 勤務帯 → 手動起動 → 停止中（21 §3.4-1） */
const X_HARNESS_SEATS = [
  '相談窓口（ask）',
  '小垢ベンチ（x-benchmark）',
  'X投稿（x-post）',
  'X週次PDCA（x-pdca）',
];
/** X運用に居ない社員（別部署・部署未記載・名簿なし）。フロアに混ざってはいけない */
const NOT_IN_X_HARNESS = [
  '情報収集（collect）',
  'フォロワー日次（x-followers）',
  '着想鍛造（idea-forge）',
  '旧ジョブ（legacy）',
];

// ---- 全景の部屋タップ → /office?room={deptId}（§3.2-1・§3.2-2） ----

test('全景の部屋タップで /office?room={deptId} に入り、所属社員だけが 26 §3.3 と同じ席・ブロック分け・状態表示で出る', async ({
  page,
}) => {
  await mockOffice(page);
  await page.goto('/office');

  // 部屋 id ＝ `dept` の id。正規の入口は `?room=`（§3.2-1）
  await expect(roomTile(page, 'X運用')).toHaveAttribute('href', '/office?room=x-harness');
  await roomTile(page, 'X運用').click();
  await expect(page).toHaveURL(/\/office\?room=x-harness$/);

  const floor = floorOf(page, 'X運用');
  await expect(floor).toBeVisible();
  // 席の並びは返却順のまま、ブロックは 勤務帯 → 手動起動 → 停止中（26 §3.3-1 と同じ部品）
  await expect(floor.locator('.of3__worker-name')).toHaveText(X_HARNESS_SEATS);
  await expect(floor.locator('.of3__block-label')).toHaveText(['手動起動', '停止中']);
  await expect(floor.locator('.of3__worker--stopped')).toHaveCount(1);
  // 状態表示（承認待ちの run は席で「確認待ち」）と席の名簿項目（起動コマンド）も同じ
  await expect(floor).toContainText('確認待ち 1');
  await expect(floor).toContainText('ベンチ候補を1件出しました。');
  await expect(floor).toContainText('/x-post');
  // 所属していない社員は1人も混ざらない（部屋を「またぐ」概念は消えた・§3.2-2）
  for (const name of NOT_IN_X_HARNESS) {
    await expect(page.getByText(name)).toHaveCount(0);
  }
  // 矢印・連結線を描かないのも 26 §3.3-3 のまま
  await expect(page.locator('.of3__room-floor svg')).toHaveCount(0);

  await page.screenshot({ path: 'test-results/screens/cerebellum-1wl.2-office-room.png', fullPage: false });
});

test('部署ルーム下部の導線も `?room=` で、いまの部屋が現在地になる', async ({ page }) => {
  await mockOffice(page);
  await page.goto('/office?room=x-harness');

  const nav = page.getByRole('navigation', { name: '部署を移動' });
  // 部屋の一覧は office.json 由来（3部署＋部署 未記載）。cerebellum に部屋の表を持たない（§4）
  await expect(nav.locator('.of3__room-nav-link')).toHaveText([
    '記憶整備',
    'X運用',
    '学習・成長',
    '部署 未記載',
  ]);
  await expect(nav.locator('.of3__room-nav-link.is-active')).toHaveText('X運用');
  await expect(nav.getByRole('link', { name: '記憶整備' })).toHaveAttribute(
    'href',
    '/office?room=second-brain-harness',
  );

  await nav.getByRole('link', { name: '記憶整備' }).click();
  await expect(page).toHaveURL(/\/office\?room=second-brain-harness$/);
  await expect(floorOf(page, '記憶整備').locator('.of3__worker-name')).toHaveText([
    '情報収集（collect）',
  ]);
});

// ---- `?dept=` は `?room=` の別名（§3.2-1） ----

test('/office?dept={id} が /office?room={id} と同じ画面になる', async ({ page }) => {
  await mockOffice(page);

  await page.goto('/office?room=x-harness');
  const byRoom = {
    title: await page.locator('.of3__room-title').textContent(),
    subId: await page.locator('.of3__room-header .of3__room-id').textContent(),
    breakdown: await page.locator('.of3__room-breakdown').textContent(),
    seats: await floorOf(page, 'X運用').locator('.of3__worker-name').allTextContents(),
  };

  await page.goto('/office?dept=x-harness');
  // リダイレクトしない（URL は `?dept=` のまま）が、描画は `?room=` と同じ1画面
  await expect(page).toHaveURL(/\/office\?dept=x-harness$/);
  await expect(page.locator('.of3__room-title')).toHaveText(byRoom.title ?? '');
  await expect(page.locator('.of3__room-header .of3__room-id')).toHaveText(byRoom.subId ?? '');
  await expect(page.locator('.of3__room-breakdown')).toHaveText(byRoom.breakdown ?? '');
  await expect(floorOf(page, 'X運用').locator('.of3__worker-name')).toHaveText(byRoom.seats);
  expect(byRoom.seats).toEqual(X_HARNESS_SEATS);
});

test('`?dept=` で入った文脈は席の往復でも保たれる（別名を書き換えない）', async ({ page }) => {
  await mockOffice(page);
  await page.goto('/office?dept=x-harness');

  await page.getByRole('link', { name: /X投稿（x-post）の名簿を開く/ }).click();
  await expect(page).toHaveURL(/\/office\?dept=x-harness&employee=a-x-post$/);
  await page.getByRole('dialog', { name: 'X投稿（x-post）の名簿' }).getByRole('link', { name: '閉じる' }).click();
  await expect(page).toHaveURL(/\/office\?dept=x-harness$/);
});

// ---- 部署 未記載の部屋（§3.1-2・§3.2-1 の予約語 `unassigned`） ----

test('/office?room=unassigned に部署 未記載の社員が出る', async ({ page }) => {
  await mockOffice(page);
  await page.goto('/office?room=unassigned');

  await expect(page).toHaveURL(/\/office\?room=unassigned$/);
  const floor = floorOf(page, '部署 未記載');
  // `dept:null` の社員と `profile` ごと無い社員の2名（隠さない・§3.1-2）
  await expect(floor.locator('.of3__worker-name')).toHaveText([
    '着想鍛造（idea-forge）',
    '旧ジョブ（legacy）',
  ]);
  await expect(page.locator('.of3__room-breakdown')).toHaveText('勤務帯 2名・名簿未記載 1名');
  // 部署が付いている社員は1人も入らない
  await expect(page.getByText('相談窓口（ask）')).toHaveCount(0);
  await expect(page.getByText('情報収集（collect）')).toHaveCount(0);
  await expect(page.locator('.of3__floor-empty')).toHaveCount(0);
});

// ---- 旧4部屋 id・未知 id は空状態（§3.2-3・§6） ----

for (const legacy of ['library', 'lab', 'market', 'studio']) {
  test(`旧4部屋の id (${legacy}) は解決せず、空状態＋全景への導線になる（リダイレクトしない）`, async ({
    page,
  }) => {
    await mockOffice(page);
    await page.goto(`/office?room=${legacy}`);

    // リダイレクトしない——URL はそのまま（対応表も置かない・§3.2-3）
    await expect(page).toHaveURL(new RegExp(`/office\\?room=${legacy}$`));
    // 見出しは id のまま（label が無い部屋は 26 §3.3-2 の `DEPT: {id}` の形・§3.1-4）
    await expect(page.locator('.of3__room-title')).toHaveText(`DEPT: ${legacy}`);
    await expect(page.locator('.of3__room-header .of3__room-id')).toHaveCount(0);
    // 空状態。誰も居ないがエラーにはしない（20 §4）
    await expect(page.getByText('この部署の社員は居ません')).toBeVisible();
    await expect(page.locator('.of3__worker')).toHaveCount(0);
    await expect(page.locator('.banner')).toHaveCount(0);
    // 旧4部屋 id に紐づく部署も作らない（下部導線に現在地が立たない）
    await expect(page.locator('.of3__room-nav-link.is-active')).toHaveCount(0);

    // 全景への導線が出ていて、押せば全景に戻れる（26 §3.3-5）
    await page.getByRole('link', { name: '‹ OFFICE' }).click();
    await expect(page).toHaveURL(/\/office$/);
    await expect(campus(page)).toBeVisible();
  });
}

test('未知の部署 id も同じ空状態になる（値域を検査しない）', async ({ page }) => {
  await mockOffice(page);
  await page.goto('/office?room=podcast-harness');

  await expect(page).toHaveURL(/\/office\?room=podcast-harness$/);
  await expect(page.locator('.of3__room-title')).toHaveText('DEPT: podcast-harness');
  await expect(page.getByText('この部署の社員は居ません')).toBeVisible();
  await expect(page.locator('.of3__worker')).toHaveCount(0);
  await expect(page.locator('.banner')).toHaveCount(0);
  // 全景の部屋一覧（＝下部導線）は名簿由来のままで、未知 id を足さない（§3.1-3）
  await expect(page.getByRole('navigation', { name: '部署を移動' }).locator('.of3__room-nav-link')).toHaveCount(4);
});

// ---- `room` > `line` の2段優先（§3.2-4） ----

test('room と line が同時に来たら room が勝つ', async ({ page }) => {
  await mockOffice(page);
  // `room=growth-harness` は x-followers 1名だけ。`line=x` は他部署3名を含む別の集合
  await page.goto('/office?room=growth-harness&line=x');

  // URL は書き換えない（リダイレクトしない）
  await expect(page).toHaveURL(/\/office\?room=growth-harness&line=x$/);
  // 描画は部屋のフロア。ラインのヘッダにならない
  await expect(page.locator('.of3__room-title')).toHaveText('学習・成長');
  await expect(page.locator('.of3__room-header .of3__room-id')).toHaveText('growth-harness');
  await expect(page.locator('.of3__room-title')).not.toContainText('LINE:');
  const floor = floorOf(page, '学習・成長');
  await expect(floor.locator('.of3__worker-name')).toHaveText(['フォロワー日次（x-followers）']);
  // `line=x` の他部署3名は出ない＝ line で解釈していない・掛けてもいない
  for (const name of ['小垢ベンチ（x-benchmark）', 'X投稿（x-post）', 'X週次PDCA（x-pdca）']) {
    await expect(page.getByText(name)).toHaveCount(0);
  }
  await expect(page.locator('.of3__room-breakdown')).toHaveText('勤務帯 1名');
});

test('dept と line が同時に来ても dept（=room の別名）が勝つ', async ({ page }) => {
  await mockOffice(page);
  await page.goto('/office?dept=growth-harness&line=x');

  await expect(page).toHaveURL(/\/office\?dept=growth-harness&line=x$/);
  await expect(page.locator('.of3__room-title')).toHaveText('学習・成長');
  await expect(floorOf(page, '学習・成長').locator('.of3__worker-name')).toHaveText([
    'フォロワー日次（x-followers）',
  ]);
  await expect(page.getByText('小垢ベンチ（x-benchmark）')).toHaveCount(0);
});

test('line だけならライン絞り込みのまま（2段目が生きている）', async ({ page }) => {
  await mockOffice(page);
  await page.goto('/office?line=x');

  await expect(page.locator('.of3__room-title')).toHaveText('LINE: X運用');
  const floor = page.getByRole('region', { name: 'LINE: X運用の社員' });
  // 部署をまたいで `line:x` の社員が集まる（21 §3.7 のまま）
  await expect(floor.locator('.of3__worker-name')).toHaveText([
    '小垢ベンチ（x-benchmark）',
    'フォロワー日次（x-followers）',
    'X投稿（x-post）',
    'X週次PDCA（x-pdca）',
  ]);
  await expect(page.getByText('相談窓口（ask）')).toHaveCount(0);
});

// ---- ヘッダは label 主・id 添え＋内訳（§3.1-5・§3.2-5） ----

test('ヘッダが label 主・id 添え＋内訳になる', async ({ page }) => {
  await mockOffice(page);
  await page.goto('/office?room=x-harness');

  // 主は日本語ラベル、id は等幅で小さく添える（全景タイルと同じ見出し形）
  await expect(page.locator('.of3__room-title')).toHaveText('X運用');
  const subId = page.locator('.of3__room-header .of3__room-id');
  await expect(subId).toHaveText('x-harness');
  await expect(subId).toHaveClass(/mono/);
  // 見出しの主に id を出していない（26 §3.3-2 の `DEPT: {id}` 形から置き換わっている）
  await expect(page.locator('.of3__room-title')).not.toContainText('DEPT:');
  await expect(page.locator('.of3__room-title')).not.toContainText('x-harness');
  // 内訳は 26 §3.2 の形のまま（0名の項は書かない）
  await expect(page.locator('.of3__room-breakdown')).toHaveText(
    '勤務帯 2名・手動 1名・停止中 1名・人間確認あり 1名',
  );
  await expect(page.locator('.of3__room-action-copy')).toContainText('確認が必要な仕事：1件');
  // フロアのアクセシブル名も見出しに揃う
  await expect(floorOf(page, 'X運用')).toBeVisible();
});

test('部署 未記載の部屋も同じ見出し形（label 主・id 添え）で出る', async ({ page }) => {
  await mockOffice(page);
  await page.goto('/office?room=unassigned');

  await expect(page.locator('.of3__room-title')).toHaveText('部署 未記載');
  await expect(page.locator('.of3__room-header .of3__room-id')).toHaveText('unassigned');
});

test('departments が届いていない部屋の見出しは id のまま（添えの id を二重に出さない）', async ({
  page,
}) => {
  await mockOffice(page, office({ departments: undefined }));
  await page.goto('/office?room=x-harness');

  // §3.1-4: id から表示名を推測しない・暫定の表を持たない
  await expect(page.locator('.of3__room-title')).toHaveText('DEPT: x-harness');
  await expect(page.locator('.of3__room-header .of3__room-id')).toHaveCount(0);
  await expect(page.getByText('X運用', { exact: true })).toHaveCount(0);
  // 席とブロック分けは label の有無と無関係（同じ画面）
  await expect(page.getByRole('region', { name: 'DEPT: x-harnessの社員' }).locator('.of3__worker-name')).toHaveText(
    X_HARNESS_SEATS,
  );
  await expect(page.locator('.dg__warn')).toHaveCount(0);
});
