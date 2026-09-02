import { expect, test, type Page } from '@playwright/test';

// cerebellum-5k5.2 [Frontend] 手動起動社員の扱い（席ラベル・部署内ブロック・内訳）
// 受け入れ基準（docs/specs/21-web-office-roster.md §3.3・§3.4・§3.5）:
//   trigger:"manual"・shift:null の席に「手動起動」と command が出る（勤務時間未設定にならない）/
//   trigger 欠落かつ shift:null は「勤務時間未設定」のまま / 手動社員に次回予定を出さない /
//   部署内が 勤務帯→手動起動→停止中 の順で小見出し付きに並ぶ / 部署ヘッダに内訳 /
//   手動込みで3行以上の部署でも最終行が下壁より内側 / 手動社員も分類規則どおりの部屋に出る /
//   全景の部屋カウントは在籍数（手動込み）で信号の優先順は変わらない
//
// office.json は page.route で差し替える（004.1・5k5.1 と同じ手法）。

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

function atLocal(dayOffset: number, hhmm: string): string {
  const at = new Date();
  at.setDate(at.getDate() + dayOffset);
  const [hour, minute] = hhmm.split(':').map(Number);
  at.setHours(hour, minute, 0, 0);
  return localIso(at);
}

/** 手動社員の直近実行日（当日ではないので補助表示が出る・§3.3-5） */
const LAST_CALL = atLocal(-3, '14:00');
const LAST_CALL_DATE = LAST_CALL.slice(0, 10);

const EMPLOYEES = [
  {
    automation_id: 'a-collect',
    name: '情報収集（collect）',
    skill: 'collect',
    enabled: true,
    shift: { hour: 5, minute: 0, days: '毎日', label: '毎日 05:00' },
    next_run_at: atLocal(1, '05:00'),
    last_run_at: atLocal(0, '05:00'),
    last_run_id: 'r-collect-today',
    trigger: 'scheduled',
    profile: { job: '受信箱を仕分けます', command: null, checks: [], doc: null },
  },
  {
    // 起動方式が未記載の社員。**手動と断定しない**（設定漏れと手動起動は別物・§3.3-1）
    automation_id: 'a-legacy',
    name: '旧ジョブ（legacy）',
    skill: null,
    enabled: true,
    shift: null,
    next_run_at: null,
    last_run_at: null,
    last_run_id: null,
    profile: null,
  },
  {
    // 人間が打って動く社員。勤務帯を持たない（§3.3）
    automation_id: 'a-ask',
    name: '相談窓口（ask）',
    skill: 'ask',
    enabled: true,
    shift: null,
    next_run_at: null,
    last_run_at: null,
    last_run_id: null,
    trigger: 'manual',
    profile: {
      job: '第二の脳に聞いて答えを返します',
      command: '/ask',
      checks: ['引用元の Vault ノートが実在するか'],
      doc: '.claude/skills/ask/SKILL.md',
    },
  },
  {
    automation_id: 'a-idea-forge',
    name: '着想鍛造（idea-forge）',
    skill: 'idea-forge',
    enabled: true,
    shift: null,
    next_run_at: null,
    last_run_at: LAST_CALL,
    last_run_id: 'r-idea-forge-last',
    trigger: 'manual',
    profile: {
      job: '思いつきを検証可能な形に鍛えます',
      command: '/idea-forge',
      checks: ['前提が飛んでいないか'],
      doc: '.claude/skills/idea-forge/SKILL.md',
    },
  },
  {
    automation_id: 'a-retired',
    name: '旧ダッシュボード生成（retired）',
    skill: null,
    enabled: false,
    shift: { hour: 7, minute: 0, days: '毎日', label: '毎日 07:00' },
    next_run_at: null,
    last_run_at: null,
    last_run_id: null,
    trigger: 'scheduled',
    profile: null,
  },
  {
    // 手動でも分類規則は同じ（skill 名 x-post → STUDIO）。「手動部屋」は作らない（§3.3-3）
    automation_id: 'a-x-post',
    name: 'X投稿（x-post）',
    skill: 'x-post',
    enabled: true,
    shift: null,
    next_run_at: null,
    last_run_at: atLocal(0, '12:00'),
    last_run_id: 'r-x-post-today',
    trigger: 'manual',
    profile: {
      job: '下書きから投稿案を作ります',
      command: '/x-post',
      checks: ['固有名詞の誤りが無いか'],
      doc: '.claude/skills/x-post/SKILL.md',
    },
  },
];

const RUNS = [
  {
    run_id: 'r-x-post-today',
    automation_id: 'a-x-post',
    title: 'X投稿（x-post） run 4',
    run_number: '4',
    scheduled_for: atLocal(0, '12:00'),
    started_at: atLocal(0, '12:00'),
    status: 'completed',
    // 手動 run も承認待ちの判定は同じ（起動方式は無関係・§3.5-3）
    trigger: 'manual',
    outcome: 'produced',
    items: 1,
    note: '承認待ち',
    headline: '投稿案を1件作りました。',
    output: '投稿案を1件作りました。',
    truncated: false,
  },
  {
    run_id: 'r-collect-today',
    automation_id: 'a-collect',
    title: '情報収集（collect） run 40',
    run_number: '40',
    scheduled_for: atLocal(0, '05:00'),
    started_at: atLocal(0, '05:00'),
    status: 'completed',
    trigger: 'scheduled',
    outcome: 'failed',
    items: null,
    note: null,
    headline: '収集に失敗しました。',
    output: '収集に失敗しました。',
    truncated: false,
  },
  {
    run_id: 'r-idea-forge-last',
    automation_id: 'a-idea-forge',
    title: '着想鍛造（idea-forge） run 2',
    run_number: '2',
    scheduled_for: LAST_CALL,
    started_at: LAST_CALL,
    status: 'completed',
    trigger: 'manual',
    outcome: 'produced',
    items: 2,
    note: null,
    headline: '着想を2件鍛えました。',
    output: '着想を2件鍛えました。',
    truncated: false,
  },
];

function office(overrides: Record<string, unknown> = {}) {
  return {
    generated_at: localIso(new Date()),
    window_days: 14,
    employees: EMPLOYEES,
    runs: RUNS,
    ...overrides,
  };
}

async function mockOffice(page: Page, body: unknown = office()) {
  await page.route('**/office.json', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) }),
  );
}

const seat = (page: Page, name: string) => page.locator('.of3__worker', { hasText: name });

test('手動起動の席は「手動起動」と起動コマンドを出し、架空の次回予定を出さない', async ({ page }) => {
  await mockOffice(page);
  await page.goto('/office?room=library');

  const ask = seat(page, '相談窓口（ask）');
  await expect(ask).toContainText('手動起動');
  // 席で読める唯一の名簿項目＝どう呼ぶか（§3.3-2）
  await expect(ask).toContainText('/ask');
  await expect(ask).not.toContainText('勤務時間未設定');
  await expect(ask).toContainText('まだ実行なし');
  // next_run_at は null。ここに予定を補わない（§3.3-4）
  await expect(ask).not.toContainText('次回');

  await page.screenshot({ path: 'test-results/screens/cerebellum-5k5.2-manual-room.png', fullPage: false });
});

test('起動方式が未記載の社員は「勤務時間未設定」のまま（手動と断定しない）', async ({ page }) => {
  await mockOffice(page);
  await page.goto('/office?room=library');

  const legacy = seat(page, '旧ジョブ（legacy）');
  await expect(legacy).toContainText('勤務時間未設定');
  await expect(legacy).not.toContainText('手動起動');
});

test('当日 run が無い手動社員には直近実行日が出る', async ({ page }) => {
  await mockOffice(page);
  await page.goto('/office?room=library');

  // 「いつ最後に呼ばれたか」で読ませる（§3.3-5）
  await expect(seat(page, '着想鍛造（idea-forge）')).toContainText('直近 ' + LAST_CALL_DATE);
  expect(LAST_CALL_DATE).not.toBe(atLocal(0, '00:00').slice(0, 10));
});

test('部署内は 勤務帯 → 手動起動 → 停止中 の順に小見出し付きで並ぶ', async ({ page }) => {
  await mockOffice(page);
  await page.goto('/office?room=library');

  const room = page.getByRole('region', { name: 'LIBRARYの社員' });
  await expect(room.locator('.of3__block-label')).toHaveText(['手動起動', '停止中']);
  // ブロック内は返却順のまま（勤務開始時刻の昇順。クライアントで再ソートしない・§3.4-1）
  await expect(room.locator('.of3__worker-name')).toHaveText([
    '情報収集（collect）',
    '旧ジョブ（legacy）',
    '相談窓口（ask）',
    '着想鍛造（idea-forge）',
    '旧ダッシュボード生成（retired）',
  ]);
  await expect(room.locator('.of3__worker--stopped')).toHaveCount(1);
});

test('部署ヘッダに在籍の内訳が出る', async ({ page }) => {
  await mockOffice(page);
  await page.goto('/office?room=library');

  // 勤務形態の内訳は全景に出さず部署内で読む（§3.4-3・§3.5-1）
  await expect(page.locator('.of3__room-breakdown')).toHaveText('勤務帯 2名・手動 2名・停止中 1名');

  await page.goto('/office?room=market');
  // 0名のブロックは書かない
  await expect(page.locator('.of3__room-breakdown')).toHaveText('勤務帯 0名');
});

test('手動込みで3行以上になる部署でも最終行が部屋の下壁より内側に収まる', async ({ page }) => {
  await mockOffice(page);
  await page.goto('/office?room=library');

  const room = page.getByRole('region', { name: 'LIBRARYの社員' });
  await expect(room.locator('.of3__worker')).toHaveCount(5);
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
  // ブロックごとに行が切り替わるので、行数は総人数から割らずブロック単位で数える（§3.4-4）
  expect(geometry.backgroundSize).toBe('100% 128%');
  expect(geometry.workerBottomFromFloorTop).toBeLessThanOrEqual(geometry.floorHeight);
});

test('手動社員も分類規則どおりの部屋に出る（手動部屋を作らない）', async ({ page }) => {
  await mockOffice(page);
  await page.goto('/office?room=studio');

  const studio = page.getByRole('region', { name: 'STUDIOの社員' });
  await expect(studio.locator('.of3__worker-name')).toHaveText(['X投稿（x-post）']);
  await expect(studio.locator('.of3__block-label')).toHaveText(['手動起動']);
  // LIBRARY へ寄せ集めない
  await expect(page.locator('.of3__room-breakdown')).toHaveText('勤務帯 0名・手動 1名');
});

test('全景の部屋カウントは在籍数（手動込み）で、信号の優先順と昨夜の集計は変わらない', async ({ page }) => {
  await mockOffice(page);
  await page.goto('/office');

  const overview = page.getByRole('region', { name: 'AIオフィス全景' });
  // 勤務帯・手動を区別しない在籍数（§3.5-1）。停止中は含めない
  await expect(overview.getByRole('link', { name: 'LIBRARYに入る、社員4名' })).toBeVisible();
  await expect(overview.getByRole('link', { name: 'STUDIOに入る、社員1名' })).toBeVisible();
  // 手動 run も直近 run として同じ規則で数える（§3.5-2・§3.5-3）
  await expect(overview.getByRole('link', { name: /STUDIOに入る/ })).toContainText('確認 1');
  await expect(overview.getByRole('link', { name: /LIBRARYに入る/ })).toContainText('失敗 1');
  const headline = page.getByLabel('昨夜のオフィス概要');
  await expect(headline).toContainText('昨夜：失敗 1');
  await expect(headline).toContainText('あなたの仕事：1件');
  // 全景に勤務形態の内訳・社員名は出さない
  await expect(page.locator('.of3__room-breakdown')).toHaveCount(0);
  await expect(page.getByText('相談窓口（ask）')).toHaveCount(0);
  await expect(page.getByText('手動起動')).toHaveCount(0);
});
