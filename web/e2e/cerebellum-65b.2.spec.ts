import { expect, test, type Page } from '@playwright/test';

// cerebellum-65b.2 [Frontend] 部署絞り込み（/office?dept=）
// 受け入れ基準（docs/specs/26-web-office-company.md §3.3）:
//   社員カードの所属部署タップで /office?dept={id} へ入る / 部屋をまたいで dept 一致の在籍社員だけが
//   部署ルームと同じ席・ブロック分け・状態表示で出る / ヘッダに DEPT: {id} と内訳 /
//   矢印や連結線を描かない / 未知の dept で空状態＋全景への導線 /
//   room・line・dept 同時指定で room → line → dept の優先順 / 全景に部署導線が増えていない
//
// office.json は :48310 の静的サーバが配信する外部データなので page.route で差し替える
// （実サーバの起動状態やその日の automation 実行結果にテストを依存させない。5k5.4・65b.1 と同じ手法）。

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
 * 部屋（skill 名の分類・docs/specs/20-web-office.md §3.1-3）・ライン（`profile.line`）・
 * 部署（`profile.dept`）の3軸を**どれも一致させない**名簿。
 *
 * 3軸のどれかが同じ集合になっていると、別の軸で絞る誤実装がテストを素通りする。
 * 各軸の所属集合を実データから引くと:
 *
 * | 軸 | 集合 |
 * |---|---|
 * | `room=market` | x-benchmark・x-followers |
 * | `line=x` | x-benchmark・x-followers・x-post・x-pdca |
 * | `line=knowledge` | collect・**ask**・blindspot |
 * | `dept=x-harness` | **ask**・x-benchmark・x-post・x-pdca |
 * | `dept=second-brain-harness` | collect・blindspot |
 * | `dept=growth-harness` | **x-followers** |
 *
 * 判別の要は2名:
 * - **a-ask**（LIBRARY / `line:knowledge` / `dept:x-harness`）——部署には入るがラインには入らない
 * - **a-x-followers**（MARKET / `line:x` / `dept:growth-harness`）——ラインと部屋には入るが部署には入らない
 */
const EMPLOYEES = [
  {
    // LIBRARY / line:knowledge / dept:second-brain-harness
    automation_id: 'a-collect',
    name: '情報収集（collect）',
    skill: 'collect',
    enabled: true,
    shift: { hour: 5, minute: 0, days: '毎日', label: '毎日 05:00' },
    next_run_at: atLocal(1, '05:00'),
    last_run_at: atLocal(0, '05:00'),
    last_run_id: 'r-collect',
    trigger: 'scheduled',
    profile: profile({ job: '受信箱を仕分けます', dept: 'second-brain-harness' }),
  },
  {
    // **判別の要①**: LIBRARY / line:knowledge / dept:**x-harness**。
    // 部署 x-harness には入るがライン x には入らない社員。ライン由来で絞る誤実装だと
    // dept=x-harness のフロアからこの社員が消える（§3.3-1）
    automation_id: 'a-ask',
    name: '相談窓口（ask）',
    skill: 'ask',
    enabled: true,
    shift: { hour: 5, minute: 30, days: '毎日', label: '毎日 05:30' },
    next_run_at: atLocal(1, '05:30'),
    last_run_at: null,
    last_run_id: null,
    trigger: 'scheduled',
    profile: profile({ job: '第二の脳に聞いて答えを返します', line: 'knowledge', dept: 'x-harness' }),
  },
  {
    // MARKET / line:x / dept:x-harness。承認待ちの run を持つ（席の状態表示の主役）
    automation_id: 'a-x-benchmark',
    name: '小垢ベンチ（x-benchmark）',
    skill: 'x-benchmark',
    enabled: true,
    shift: { hour: 6, minute: 0, days: '毎日', label: '毎日 06:00' },
    next_run_at: atLocal(1, '06:00'),
    last_run_at: atLocal(0, '06:00'),
    last_run_id: 'r-x-benchmark',
    trigger: 'scheduled',
    profile: profile({
      job: '小垢のベンチマークを集めます',
      line: 'x',
      dept: 'x-harness',
      review: { kinds: ['alert'], cadence: 'shift' },
    }),
  },
  {
    // **判別の要②**: MARKET / line:x / dept:**growth-harness**。
    // ライン x と部屋 MARKET には入るが部署 x-harness には入らない社員。
    // ライン由来で絞る誤実装だと dept=x-harness にこの社員が混ざり、
    // room ∩ dept で絞る誤実装だと room=market からこの社員が消える（§3.3-1・§3.3-4）
    automation_id: 'a-x-followers',
    name: 'フォロワー日次（x-followers）',
    skill: 'x-followers',
    enabled: true,
    shift: { hour: 6, minute: 30, days: '毎日', label: '毎日 06:30' },
    next_run_at: atLocal(1, '06:30'),
    last_run_at: null,
    last_run_id: null,
    trigger: 'scheduled',
    profile: profile({ job: 'フォロワー数を毎日控えます', line: 'x', dept: 'growth-harness' }),
  },
  {
    // LAB / line:knowledge / dept:second-brain-harness
    automation_id: 'a-blindspot',
    name: '死角点検（night-blindspot）',
    skill: 'night-blindspot',
    enabled: true,
    shift: { hour: 7, minute: 0, days: '毎日', label: '毎日 07:00' },
    next_run_at: atLocal(1, '07:00'),
    last_run_at: null,
    last_run_id: null,
    trigger: 'scheduled',
    profile: profile({ job: '見落としを洗い出します', dept: 'second-brain-harness' }),
  },
  {
    // STUDIO / 手動起動 / line:x / dept:x-harness
    automation_id: 'a-x-post',
    name: 'X投稿（x-post）',
    skill: 'x-post',
    enabled: true,
    shift: null,
    next_run_at: null,
    last_run_at: null,
    last_run_id: null,
    trigger: 'manual',
    profile: profile({ job: 'ポストを書きます', command: '/x-post', line: 'x', dept: 'x-harness' }),
  },
  {
    // STUDIO / 停止中 / line:x / dept:x-harness
    automation_id: 'a-x-pdca',
    name: 'X週次PDCA（x-pdca）',
    skill: 'x-pdca',
    enabled: false,
    shift: { hour: 8, minute: 0, days: '週末', label: '週末 08:00' },
    next_run_at: null,
    last_run_at: null,
    last_run_id: null,
    trigger: 'scheduled',
    profile: profile({ job: '週次で振り返ります', line: 'x', dept: 'x-harness' }),
  },
  {
    // `dept` を明示的な null で受ける社員。どの部署フロアにも出ない（§3.1-3・§9）
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
    // 名簿そのものが無い社員。部署フロアには出ないが全景・部屋からは消えない
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
];

function office(overrides: Record<string, unknown> = {}) {
  return { generated_at: localIso(new Date()), window_days: 14, employees: EMPLOYEES, runs: RUNS, ...overrides };
}

async function mockOffice(page: Page, body: unknown = office()) {
  await page.route('**/office.json', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) }),
  );
}

// ---- 入口は社員カードの所属部署タップ（§3.3-6） ----

test('社員カードの所属部署タップで /office?dept={id} へ入る', async ({ page }) => {
  await mockOffice(page);
  await page.goto('/office?room=market&employee=a-x-benchmark');

  const card = page.getByRole('dialog', { name: '小垢ベンチ（x-benchmark）の名簿' });
  // 部署 id はそのままリンクの文言になる（日本語ラベルへ翻訳しない・§3.3-2・§4）
  await card.getByRole('link', { name: 'x-harness' }).click();

  await expect(page).toHaveURL(/\/office\?dept=x-harness$/);
  await expect(page.locator('.of3__room-title')).toHaveText('DEPT: x-harness');
});

test('部署が未記載の社員カードには部署の導線が無い（行き先が無いリンクを作らない）', async ({ page }) => {
  await mockOffice(page);
  await page.goto('/office?room=library&employee=a-idea-forge');

  const card = page.getByRole('dialog', { name: '着想鍛造（idea-forge）の名簿' });
  await expect(card.locator('.of__card-meta-wide dd')).toHaveText('部署 未記載');
  await expect(card.locator('a[href*="dept="]')).toHaveCount(0);
});

// ---- 部屋をまたいで dept 一致の在籍社員だけ（§3.3-1） ----

test('部屋をまたいで dept 一致の社員だけが部署ルームと同じ席・ブロック分け・状態表示で出る', async ({
  page,
}) => {
  await mockOffice(page);
  await page.goto('/office?dept=x-harness');

  const floor = page.getByRole('region', { name: 'DEPT: x-harnessの社員' });
  // LIBRARY（ask）・MARKET（x-benchmark）・STUDIO（x-post・x-pdca）の3部屋をまたいで集まる。
  // 並びは返却順のまま、ブロックは 勤務帯 → 手動起動 → 停止中（21 §3.4-1）
  await expect(floor.locator('.of3__worker-name')).toHaveText([
    '相談窓口（ask）',
    '小垢ベンチ（x-benchmark）',
    'X投稿（x-post）',
    'X週次PDCA（x-pdca）',
  ]);
  await expect(floor.locator('.of3__block-label')).toHaveText(['手動起動', '停止中']);
  await expect(floor.locator('.of3__worker--stopped')).toHaveCount(1);
  // 同じ状態表示（承認待ちの run は席で「確認待ち」）と同じ席の名簿項目（起動コマンド）
  await expect(floor).toContainText('確認待ち 1');
  await expect(floor).toContainText('/x-post');

  await page.screenshot({ path: 'test-results/screens/cerebellum-65b.2-office-dept.png', fullPage: false });
});

test('絞るのは dept であってライン・部屋ではない（食い違う2名で判別する）', async ({ page }) => {
  await mockOffice(page);
  await page.goto('/office?dept=x-harness');

  const floor = page.getByRole('region', { name: 'DEPT: x-harnessの社員' });
  // ①`dept:x-harness` だが `line:knowledge` の a-ask は**居る**——ライン由来で絞っていたら消える
  await expect(floor.getByText('相談窓口（ask）')).toBeVisible();
  // ②`line:x` だが `dept:growth-harness` の a-x-followers は**居ない**——ライン由来で絞っていたら混ざる
  await expect(page.getByText('フォロワー日次（x-followers）')).toHaveCount(0);
  // 別部署・部署未記載・名簿なしの社員も混ざらない
  await expect(page.getByText('情報収集（collect）')).toHaveCount(0);
  await expect(page.getByText('死角点検（night-blindspot）')).toHaveCount(0);
  await expect(page.getByText('着想鍛造（idea-forge）')).toHaveCount(0);
  await expect(page.getByText('旧ジョブ（legacy）')).toHaveCount(0);
});

test('部署が1名だけの dept でも、同じラインの他部署を巻き込まない', async ({ page }) => {
  await mockOffice(page);
  // `dept:growth-harness` は a-x-followers 1名だけ。同じ `line:x` には他部署の3名が居る
  await page.goto('/office?dept=growth-harness');

  const floor = page.getByRole('region', { name: 'DEPT: growth-harnessの社員' });
  await expect(floor.locator('.of3__worker-name')).toHaveText(['フォロワー日次（x-followers）']);
  await expect(page.locator('.of3__room-breakdown')).toHaveText('勤務帯 1名');
});

// ---- ヘッダ（§3.3-2） ----

test('ヘッダに DEPT: {id} と内訳が出る', async ({ page }) => {
  await mockOffice(page);
  await page.goto('/office?dept=x-harness');

  await expect(page.locator('.of3__room-title')).toHaveText('DEPT: x-harness');
  // 内訳の形は部屋・ラインと同じ（21 §3.4-3 ＋ 26 §3.2）。0名の項は書かない。
  // 勤務帯は ask・x-benchmark の2名／`review` を持つのは x-benchmark だけ／`profile` 不在は居ない
  await expect(page.locator('.of3__room-breakdown')).toHaveText(
    '勤務帯 2名・手動 1名・停止中 1名・人間確認あり 1名',
  );
  await expect(page.locator('.of3__room-action-copy')).toContainText('確認が必要な仕事：1件');
});

// ---- 矢印・連結線を描かない（§3.3-3） ----

test('部署のフロアに矢印や連結線を描かない', async ({ page }) => {
  await mockOffice(page);
  await page.goto('/office?dept=x-harness');

  // 流れを図にするのはカード内のミニラインだけ（21 §3.7-4 と同じ規律）
  await expect(page.locator('.of__ml')).toHaveCount(0);
  await expect(page.locator('.of__ml-arrow')).toHaveCount(0);
  await expect(page.locator('.of3__room-floor svg')).toHaveCount(0);
});

// ---- 未知の dept（§3.3-5・§6） ----

test('未知の dept は空状態にして落とさず、全景への導線を出す', async ({ page }) => {
  await mockOffice(page);
  // 8部署 id ではあるが在籍が居ない値。画面は値域を検査しない（§4）ので同じ扱い
  await page.goto('/office?dept=note-harness');

  await expect(page.locator('.of3__room-title')).toHaveText('DEPT: note-harness');
  await expect(page.getByText('この部署の社員は居ません')).toBeVisible();
  await expect(page.locator('.banner')).toHaveCount(0);

  await page.getByRole('link', { name: '‹ OFFICE' }).click();
  await expect(page).toHaveURL(/\/office$/);
  await expect(page.getByRole('region', { name: 'AIオフィス全景' })).toBeVisible();
});

// ---- 優先順 room → line → dept（§3.3-4） ----

test('room・line・dept が同時に来たら room を優先し、dept を完全に無視する', async ({ page }) => {
  await mockOffice(page);
  await page.goto('/office?room=market&line=knowledge&dept=x-harness');

  await expect(page.locator('.of3__room-title')).toHaveText('MARKET');
  const floor = page.getByRole('region', { name: 'MARKETの社員' });
  // MARKET の2名がそろって出る。`dept:growth-harness` の x-followers が居ることが
  // 「room ∩ dept で絞っていない」＝ dept を完全に無視している証拠
  await expect(floor.locator('.of3__worker-name')).toHaveText([
    '小垢ベンチ（x-benchmark）',
    'フォロワー日次（x-followers）',
  ]);
  // 部屋の外の dept 仲間（LIBRARY の ask・STUDIO の x-post）は出ない＝ dept で解釈していない
  await expect(page.getByText('相談窓口（ask）')).toHaveCount(0);
  await expect(page.getByText('X投稿（x-post）')).toHaveCount(0);
  // 同時指定の line（knowledge）でも解釈していない
  await expect(page.getByText('情報収集（collect）')).toHaveCount(0);
});

test('line と dept が同時に来たら line を優先する（既存の room > line を壊さない）', async ({ page }) => {
  await mockOffice(page);
  await page.goto('/office?line=knowledge&dept=x-harness');

  await expect(page.locator('.of3__room-title')).toHaveText('LINE: 知識');
  const floor = page.getByRole('region', { name: 'LINE: 知識の社員' });
  await expect(floor.locator('.of3__worker-name')).toHaveText([
    '情報収集（collect）',
    '相談窓口（ask）',
    '死角点検（night-blindspot）',
  ]);
  // dept:x-harness だけの社員（line は x）は出ない＝ dept で解釈していない
  await expect(page.getByText('小垢ベンチ（x-benchmark）')).toHaveCount(0);
  await expect(page.getByText('X投稿（x-post）')).toHaveCount(0);
});

test('dept だけなら部署で解釈する（優先順の末尾が効いている）', async ({ page }) => {
  await mockOffice(page);
  await page.goto('/office?dept=second-brain-harness');

  await expect(page.locator('.of3__room-title')).toHaveText('DEPT: second-brain-harness');
  const floor = page.getByRole('region', { name: 'DEPT: second-brain-harnessの社員' });
  // LIBRARY と LAB をまたぐ2名。同じ `line:knowledge` の a-ask は `dept:x-harness` なので入らない
  await expect(floor.locator('.of3__worker-name')).toHaveText([
    '情報収集（collect）',
    '死角点検（night-blindspot）',
  ]);
  await expect(page.getByText('相談窓口（ask）')).toHaveCount(0);
});

// ---- 全景の部屋そのものが部署になった（§3.3-6 は 27 §3.1-1 で取り消し） ----

test('全景の部屋が dept で切られ、部屋リンクがそのまま部署のフロアへ入る', async ({ page }) => {
  await mockOffice(page);
  await page.goto('/office');

  const overview = page.getByRole('region', { name: 'AIオフィス全景' });
  // 「全景に部署の導線を増やさない」（§3.3-6）は
  // docs/specs/27-web-office-departments.md §3.1-1 で取り消し。部屋＝部署になり、
  // `dept` の値ごとに1部屋（`departments` 未着なので見出しは id・並びは返却順・27 §3.1-4）
  await expect(overview.locator('.of3__room')).toHaveCount(4);
  await expect(overview.locator('a[href*="dept="]')).toHaveCount(4);
  await expect(overview.locator('.of3__room-name')).toHaveText([
    'second-brain-harness',
    'x-harness',
    'growth-harness',
    '部署 未記載',
  ]);
  await expect(overview.locator('a, div.of3__desk')).toHaveCount(5);
  // 勤務形態の1行（部署ルームのヘッダ内訳）は依然として部屋へ入るまで出さない
  await expect(page.locator('.of3__room-breakdown')).toHaveCount(0);
});

// ---- 席からの往復も部署の文脈を保つ（21 §3.7 と同型） ----

test('部署の席から名簿を開き、閉じると同じ部署へ戻る', async ({ page }) => {
  await mockOffice(page);
  await page.goto('/office?dept=x-harness');

  await page.getByRole('link', { name: /X投稿（x-post）の名簿を開く/ }).click();
  await expect(page).toHaveURL(/\/office\?dept=x-harness&employee=a-x-post$/);
  const card = page.getByRole('dialog', { name: 'X投稿（x-post）の名簿' });
  await expect(card).toBeVisible();

  await card.getByRole('link', { name: '閉じる' }).click();
  await expect(page).toHaveURL(/\/office\?dept=x-harness$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
