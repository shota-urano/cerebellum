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
 * 部署（`profile.dept`）と部屋（skill 名の分類規則・docs/specs/20-web-office.md §3.1-3）を
 * **わざと食い違わせた**名簿。`x-harness` の3名は MARKET / STUDIO に散っているので、
 * 部署絞り込みが部屋をまたぐ（§3.3-1）ことを1フロアで検証できる。
 * ライン（`line`）も別軸として食い違わせ、優先順（§3.3-4）が読めるようにしてある。
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
    shift: { hour: 4, minute: 0, days: '毎日', label: '毎日 04:00' },
    next_run_at: atLocal(1, '04:00'),
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
  // MARKET（x-benchmark）と STUDIO（x-post・x-pdca）に散っている社員が1フロアに集まる
  await expect(floor.locator('.of3__worker-name')).toHaveText([
    '小垢ベンチ（x-benchmark）',
    'X投稿（x-post）',
    'X週次PDCA（x-pdca）',
  ]);
  // 部署ルームと同じブロック分け（勤務帯 → 手動起動 → 停止中・21 §3.4-1）
  await expect(floor.locator('.of3__block-label')).toHaveText(['手動起動', '停止中']);
  await expect(floor.locator('.of3__worker--stopped')).toHaveCount(1);
  // 同じ状態表示（承認待ちの run は席で「確認待ち」）と同じ席の名簿項目（起動コマンド）
  await expect(floor).toContainText('確認待ち 1');
  await expect(floor).toContainText('/x-post');

  // 別部署・部署未記載・名簿なしの社員は混ざらない（§3.3-1）
  await expect(page.getByText('情報収集（collect）')).toHaveCount(0);
  await expect(page.getByText('死角点検（night-blindspot）')).toHaveCount(0);
  await expect(page.getByText('着想鍛造（idea-forge）')).toHaveCount(0);
  await expect(page.getByText('旧ジョブ（legacy）')).toHaveCount(0);

  await page.screenshot({ path: 'test-results/screens/cerebellum-65b.2-office-dept.png', fullPage: false });
});

// ---- ヘッダ（§3.3-2） ----

test('ヘッダに DEPT: {id} と内訳が出る', async ({ page }) => {
  await mockOffice(page);
  await page.goto('/office?dept=x-harness');

  await expect(page.locator('.of3__room-title')).toHaveText('DEPT: x-harness');
  // 内訳の形は部屋・ラインと同じ（21 §3.4-3 ＋ 26 §3.2）。0名の項は書かない
  await expect(page.locator('.of3__room-breakdown')).toHaveText(
    '勤務帯 1名・手動 1名・停止中 1名・人間確認あり 1名',
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

test('room・line・dept が同時に来たら room を優先する', async ({ page }) => {
  await mockOffice(page);
  await page.goto('/office?room=market&line=knowledge&dept=x-harness');

  await expect(page.locator('.of3__room-title')).toHaveText('MARKET');
  await expect(page.getByRole('region', { name: 'MARKETの社員' })).toContainText('小垢ベンチ（x-benchmark）');
  // 部屋に居ない dept 仲間（STUDIO の2名）は出ない＝ dept で解釈していない
  await expect(page.getByText('X投稿（x-post）')).toHaveCount(0);
});

test('line と dept が同時に来たら line を優先する（既存の room > line を壊さない）', async ({ page }) => {
  await mockOffice(page);
  await page.goto('/office?line=knowledge&dept=x-harness');

  await expect(page.locator('.of3__room-title')).toHaveText('LINE: 知識');
  const floor = page.getByRole('region', { name: 'LINE: 知識の社員' });
  await expect(floor.locator('.of3__worker-name')).toHaveText([
    '情報収集（collect）',
    '死角点検（night-blindspot）',
  ]);
  await expect(page.getByText('小垢ベンチ（x-benchmark）')).toHaveCount(0);
});

test('dept だけなら部署で解釈する（優先順の末尾が効いている）', async ({ page }) => {
  await mockOffice(page);
  await page.goto('/office?dept=second-brain-harness');

  await expect(page.locator('.of3__room-title')).toHaveText('DEPT: second-brain-harness');
  const floor = page.getByRole('region', { name: 'DEPT: second-brain-harnessの社員' });
  // LIBRARY と LAB をまたぐ2名。ライン絞り込みと同じ並び（返却順のまま）
  await expect(floor.locator('.of3__worker-name')).toHaveText([
    '情報収集（collect）',
    '死角点検（night-blindspot）',
  ]);
});

// ---- 全景は変えない（§3.3-6） ----

test('全景に部署導線は増えていない（4部屋＋MY DESKのまま）', async ({ page }) => {
  await mockOffice(page);
  await page.goto('/office');

  const overview = page.getByRole('region', { name: 'AIオフィス全景' });
  await expect(overview.locator('a[href*="dept="]')).toHaveCount(0);
  await expect(overview.locator('a, div.of3__desk')).toHaveCount(5);
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
