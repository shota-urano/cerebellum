import { expect, test, type Page } from '@playwright/test';

// cerebellum-5k5.4 [Frontend] ライン絞り込み（/office?line=）
// 受け入れ基準（docs/specs/21-web-office-roster.md §3.7）:
//   カードのライン見出しから /office?line={id} へ入る / 部屋をまたいで line 一致の在籍社員だけが
//   部署ルームと同じ席・ブロック分け・状態表示で出る / ヘッダに LINE: <ラベル> と内訳 /
//   矢印や連結線を描かない / 未知の line 値はラベルでなく値のまま / 該当なしで空状態＋全景導線 /
//   room と line 同時指定で room 優先 / 全景にライン導線が増えていない

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
  line: 'x',
  upstream: [],
  downstream: [],
  doc: null,
  ...over,
});

/** `line: "x"` の社員を**別の部屋**に散らす（部屋とは別軸だと分かるようにする・§3.7-1） */
const EMPLOYEES = [
  {
    // 部屋は `profile.dept`（docs/specs/27-web-office-departments.md §3.1-1）。
    // この社員だけ別部署に置き、`line=x` の集合と食い違わせる
    automation_id: 'a-bench',
    name: '小垢ベンチ（x-benchmark）',
    skill: 'x-benchmark',
    enabled: true,
    shift: { hour: 3, minute: 20, days: '毎日', label: '毎日 03:20' },
    next_run_at: atLocal(1, '03:20'),
    last_run_at: null,
    last_run_id: null,
    trigger: 'scheduled',
    profile: profile({ job: '小垢のベンチを取ります', dept: 'growth-harness' }),
  },
  {
    // skill x-post → STUDIO
    automation_id: 'a-x-post',
    name: 'X投稿（x-post）',
    skill: 'x-post',
    enabled: true,
    shift: { hour: 21, minute: 0, days: '毎日', label: '毎日 21:00' },
    next_run_at: atLocal(1, '21:00'),
    last_run_at: atLocal(0, '21:00'),
    last_run_id: 'r-x-post',
    trigger: 'scheduled',
    profile: profile({ job: '投稿案を作ります', downstream: ['place:Typefully draft', 'human:送信判断'] }),
  },
  {
    // 同じラインの手動社員（手動起動ブロックへ）
    automation_id: 'a-x-article',
    name: 'X記事（x-article）',
    skill: 'x-article',
    enabled: true,
    shift: null,
    next_run_at: null,
    last_run_at: null,
    last_run_id: null,
    trigger: 'manual',
    profile: profile({ job: '長文記事を作ります', command: '/x-article' }),
  },
  {
    // 同じラインの停止中社員（停止中ブロックへ）
    automation_id: 'a-x-pdca',
    name: 'X週次PDCA（x-pdca）',
    skill: 'x-pdca',
    enabled: false,
    shift: { hour: 8, minute: 0, days: '月', label: '月 08:00' },
    next_run_at: null,
    last_run_at: null,
    last_run_id: null,
    trigger: 'scheduled',
    profile: profile({ job: '週次で振り返ります' }),
  },
  {
    // 別ライン。混ざってはいけない
    automation_id: 'a-collect',
    name: '情報収集（collect）',
    skill: 'collect',
    enabled: true,
    shift: { hour: 5, minute: 0, days: '毎日', label: '毎日 05:00' },
    next_run_at: atLocal(1, '05:00'),
    last_run_at: null,
    last_run_id: null,
    trigger: 'scheduled',
    profile: profile({ job: '受信箱を仕分けます', line: 'knowledge' }),
  },
  {
    // 生成側が知らない値を出してきた場合（§3.7-3）
    automation_id: 'a-future',
    name: '新規ライン社員（future）',
    skill: 'future',
    enabled: true,
    shift: { hour: 9, minute: 0, days: '毎日', label: '毎日 09:00' },
    next_run_at: atLocal(1, '09:00'),
    last_run_at: null,
    last_run_id: null,
    trigger: 'scheduled',
    profile: profile({ job: '新しい工程です', line: 'podcast' }),
  },
];

const RUNS = [
  {
    run_id: 'r-x-post',
    automation_id: 'a-x-post',
    title: 'X投稿 run 4',
    run_number: '4',
    scheduled_for: atLocal(0, '21:00'),
    started_at: atLocal(0, '21:00'),
    status: 'completed',
    trigger: 'scheduled',
    outcome: 'produced',
    items: 1,
    note: '承認待ち',
    headline: '投稿案を1件作りました。',
    output: '投稿案を1件作りました。',
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

test('カードのライン見出しから入り、部屋をまたいで同じラインの社員が並ぶ', async ({ page }) => {
  await mockOffice(page);
  await page.goto('/office?room=unassigned&employee=a-x-post');

  await page.getByRole('dialog', { name: 'X投稿（x-post）の名簿' }).getByRole('link', { name: 'LINE: X運用' }).click();
  await expect(page).toHaveURL(/\/office\?line=x$/);

  const floor = page.getByRole('region', { name: 'LINE: X運用の社員' });
  // 別々の部屋に散っている社員が1フロアに集まる（部屋とは別軸・§3.7-1）
  await expect(floor.locator('.of3__worker-name')).toHaveText([
    '小垢ベンチ（x-benchmark）',
    'X投稿（x-post）',
    'X記事（x-article）',
    'X週次PDCA（x-pdca）',
  ]);
  // 部署ルームと同じブロック分け・同じ状態表示を使う
  await expect(floor.locator('.of3__block-label')).toHaveText(['手動起動', '停止中']);
  await expect(floor.locator('.of3__worker--stopped')).toHaveCount(1);
  await expect(floor).toContainText('確認待ち 1');
  // 別ラインは混ざらない
  await expect(page.getByText('情報収集（collect）')).toHaveCount(0);

  await page.screenshot({ path: 'test-results/screens/cerebellum-5k5.4-line-floor.png', fullPage: false });
});

test('ヘッダにラインのラベルと在籍の内訳が出る', async ({ page }) => {
  await mockOffice(page);
  await page.goto('/office?line=x');

  await expect(page.locator('.of3__room-title')).toHaveText('LINE: X運用');
  await expect(page.locator('.of3__room-breakdown')).toHaveText('勤務帯 2名・手動 1名・停止中 1名');
  await expect(page.locator('.of3__room-action-copy')).toContainText('確認が必要な仕事：1件');
});

test('ラインのフロアに矢印や連結線を描かない', async ({ page }) => {
  await mockOffice(page);
  await page.goto('/office?line=x');

  // 流れを図にするのはカード内のミニラインだけ（§3.7-4）
  await expect(page.locator('.of__ml')).toHaveCount(0);
  await expect(page.locator('.of__ml-arrow')).toHaveCount(0);
  await expect(page.locator('.of3__room-floor svg')).toHaveCount(0);
});

test('未知の line 値はラベルに変えず値のまま出す', async ({ page }) => {
  await mockOffice(page);
  await page.goto('/office?line=podcast');

  await expect(page.locator('.of3__room-title')).toHaveText('LINE: podcast');
  await expect(page.getByRole('region', { name: 'LINE: podcastの社員' })).toContainText('新規ライン社員（future）');
});

test('該当社員が居ないラインは空状態にして落とさない', async ({ page }) => {
  await mockOffice(page);
  await page.goto('/office?line=rakuten');

  await expect(page.getByText('このラインの社員は居ません')).toBeVisible();
  await expect(page.locator('.banner')).toHaveCount(0);
  // 全景へ戻れる
  await page.getByRole('link', { name: '‹ OFFICE' }).click();
  await expect(page).toHaveURL(/\/office$/);
  await expect(page.getByRole('region', { name: 'AIオフィス全景' })).toBeVisible();
});

test('room と line が同時に来たら room を優先する', async ({ page }) => {
  await mockOffice(page);
  await page.goto('/office?room=growth-harness&line=x');

  // URL を2軸で解釈しない（§3.7-7）。部屋は `dept` で決まる（27 §3.1-1）
  await expect(page.locator('.of3__room-title')).toHaveText('DEPT: growth-harness');
  await expect(page.getByRole('region', { name: 'DEPT: growth-harnessの社員' })).toContainText('小垢ベンチ（x-benchmark）');
  // `line=x` の仲間（x-post）は出ない＝ line で解釈していない
  await expect(page.locator('.of3__worker-name')).toHaveText(['小垢ベンチ（x-benchmark）']);
});

test('全景にライン導線は増えていない（部屋＋MY DESKのまま）', async ({ page }) => {
  await mockOffice(page);
  await page.goto('/office');

  const overview = page.getByRole('region', { name: 'AIオフィス全景' });
  await expect(overview.locator('a[href*="line="]')).toHaveCount(0);
  // 全景の構図は「部屋＋MY DESK」のまま。部屋は `dept` で切るようになった
  // （docs/specs/27-web-office-departments.md §3.1-1）ので、この名簿では
  // growth-harness と「部署 未記載」の2部屋になる（§3.1-2）——ライン導線は増えていない
  await expect(overview.locator('.of3__room')).toHaveCount(2);
  await expect(overview.locator('a, div.of3__desk')).toHaveCount(3);
  await expect(page.locator('.of3__room-breakdown')).toHaveCount(0);
});

test('ラインの席から名簿を開き、閉じると同じラインへ戻る', async ({ page }) => {
  await mockOffice(page);
  await page.goto('/office?line=x');

  await page.getByRole('link', { name: /X投稿（x-post）の名簿を開く/ }).click();
  await expect(page).toHaveURL(/\/office\?line=x&employee=a-x-post$/);
  const card = page.getByRole('dialog', { name: 'X投稿（x-post）の名簿' });
  await expect(card).toBeVisible();

  // 報告への往復もライン文脈を保つ
  await card.getByRole('link', { name: '報告を見る' }).click();
  await expect(page).toHaveURL(/\/office\?line=x&employee=a-x-post&run=r-x-post$/);
  await page.getByRole('dialog', { name: 'X投稿（x-post）', exact: true }).getByRole('link', { name: '閉じる' }).click();
  await expect(page).toHaveURL(/\/office\?line=x&employee=a-x-post$/);

  await card.getByRole('link', { name: '閉じる' }).click();
  await expect(page).toHaveURL(/\/office\?line=x$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
