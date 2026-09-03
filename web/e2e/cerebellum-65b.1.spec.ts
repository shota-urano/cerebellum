import { expect, test, type Page } from '@playwright/test';

// cerebellum-65b.1 [Frontend] 社員カードへの所属部署・人間確認の追加と部署ヘッダ内訳
// 受け入れ基準（docs/specs/26-web-office-company.md §3.1・§3.2）:
//   kinds:[approve,read]/cadence:shift → 「人間確認: approve・read（勤務帯どおり毎回）」/
//   kinds:[alert] → 「異常のみ通知」/ cadence:adhoc → 「不定期」/ review:null → 「人間確認: なし」で
//   未記載様式にならない / dept:null → 「部署 未記載」で skill 名から推測した値が出ない /
//   席には両項目が出ない / MY DESK の件数が review の有無で変わらない /
//   部署ヘッダに「人間確認あり n名」と「名簿未記載 m名」が出る
//
// office.json は :48310 の静的サーバが配信する外部データなので page.route で差し替える
// （実サーバの起動状態やその日の automation 実行結果にテストを依存させない。5k5.* と同じ手法）。

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

type Review = { kinds: string[]; cadence: string };

const profile = (over: Record<string, unknown> = {}) => ({
  job: '仕事の説明',
  command: null,
  agent: 'claude-code (opus)',
  checks: [],
  line: 'knowledge',
  upstream: [],
  downstream: [],
  doc: null,
  ...over,
});

/**
 * 全員を LIBRARY に落とす（部屋の分類は skill 名の規則・docs/specs/20-web-office.md §3.1-3）。
 * 内訳（§3.2）を1つのヘッダで数えたいので、部屋をまたがせない。
 */
const EMPLOYEES = [
  {
    // 人間の判断を複数 kind で求める社員。カードの期待値の主役（§3.1-1）
    automation_id: 'a-digest',
    name: '朝ダイジェスト（daily-digest）',
    skill: 'daily-digest',
    enabled: true,
    shift: { hour: 6, minute: 20, days: '毎日', label: '毎日 06:20' },
    next_run_at: atLocal(1, '06:20'),
    last_run_at: atLocal(0, '06:20'),
    last_run_id: 'r-digest',
    trigger: 'scheduled',
    profile: profile({
      job: '前夜の受信を仕分けて朝に出します',
      dept: 'second-brain-harness',
      review: { kinds: ['approve', 'read'], cadence: 'shift' } satisfies Review,
    }),
  },
  {
    // `alert` だけの契約はここだけ言い換える（§3.1-1）
    automation_id: 'a-watchdog',
    name: 'ルーティン監視（routine-watchdog）',
    skill: 'routine-watchdog',
    enabled: true,
    shift: { hour: 7, minute: 0, days: '毎日', label: '毎日 07:00' },
    next_run_at: atLocal(1, '07:00'),
    last_run_at: null,
    last_run_id: null,
    trigger: 'scheduled',
    profile: profile({
      job: '消し込み漏れを見張ります',
      // `dept` キーそのものが無い社員（生成側が §9 に未対応のあいだの実データ）。
      // 明示 null と同じく「部署 未記載」になることを検証する
      review: { kinds: ['alert'], cadence: 'shift' } satisfies Review,
    }),
  },
  {
    // `review` を持たない＝人間確認なし。**欠損ではない**（24 §9・§3.1-1）
    automation_id: 'a-collect',
    name: '情報収集（collect）',
    skill: 'collect',
    enabled: true,
    shift: { hour: 5, minute: 0, days: '毎日', label: '毎日 05:00' },
    next_run_at: atLocal(1, '05:00'),
    last_run_at: atLocal(0, '05:00'),
    last_run_id: 'r-collect',
    trigger: 'scheduled',
    // **明示的な null** で受ける（キー欠落での代替にしない）
    profile: profile({ job: '受信箱を仕分けます', dept: 'engineering', review: null }),
  },
  {
    // `dept` が届いていない社員（§9 の未実装期）。skill 名や line から埋めない（§3.1-3）
    automation_id: 'a-idea-forge',
    name: '着想鍛造（idea-forge）',
    skill: 'idea-forge',
    enabled: true,
    shift: { hour: 9, minute: 0, days: '毎日', label: '毎日 09:00' },
    next_run_at: atLocal(1, '09:00'),
    last_run_at: null,
    last_run_id: null,
    trigger: 'scheduled',
    // **明示的な null** で受ける（キー欠落での代替にしない）
    profile: profile({ job: '思いつきを鍛えます', line: 'incubate', dept: null, review: null }),
  },
  {
    // 名簿そのものが無い社員。「カードが書けない一体」＝内訳の「名簿未記載」（§3.2-2）
    automation_id: 'a-bare',
    name: '旧バックアップ（bare）',
    skill: null,
    enabled: true,
    shift: { hour: 4, minute: 0, days: '毎日', label: '毎日 04:00' },
    next_run_at: atLocal(1, '04:00'),
    last_run_at: null,
    last_run_id: null,
    trigger: 'scheduled',
    profile: null,
  },
  {
    // `profile` はあるが `job` が空の社員。カードでは「名簿 未記載」（21 §3.2-3）だが、
    // frontmatter そのものはある＝「カードが書けない一体」ではないので §3.2-2 の集計に入らない
    automation_id: 'a-blank',
    name: '空欄の社員（stub）',
    skill: 'stub',
    enabled: true,
    shift: { hour: 3, minute: 0, days: '毎日', label: '毎日 03:00' },
    next_run_at: atLocal(1, '03:00'),
    last_run_at: null,
    last_run_id: null,
    trigger: 'scheduled',
    profile: profile({ job: '', dept: null, review: null }),
  },
  {
    // 手動起動 × 不定期の人間確認（§3.1-1 の cadence: adhoc）
    automation_id: 'a-ask',
    name: '相談窓口（ask）',
    skill: 'ask',
    enabled: true,
    shift: null,
    next_run_at: null,
    last_run_at: null,
    last_run_id: null,
    trigger: 'manual',
    profile: profile({
      job: '第二の脳に聞いて答えを返します',
      command: '/ask',
      dept: 'second-brain-harness',
      review: { kinds: ['choose'], cadence: 'adhoc' } satisfies Review,
    }),
  },
  {
    // 停止中でも名簿は読める（21 §3.1-6）。設定漏れは在籍状態と独立に潰す対象なので内訳にも入る
    automation_id: 'a-retired',
    name: '旧まとめ（retired）',
    skill: 'retired',
    enabled: false,
    shift: { hour: 8, minute: 0, days: '毎日', label: '毎日 08:00' },
    next_run_at: null,
    last_run_at: null,
    last_run_id: null,
    trigger: 'scheduled',
    profile: profile({
      job: '週次でまとめていました',
      dept: 'engineering',
      review: { kinds: ['read'], cadence: 'shift' } satisfies Review,
    }),
  },
];

/** MY DESK に立つのは `outcome: produced` かつ `note` が完全一致で「承認待ち」の run だけ（20 §3.3） */
const RUNS = [
  {
    run_id: 'r-digest',
    automation_id: 'a-digest',
    title: '朝ダイジェスト run 12',
    run_number: '12',
    scheduled_for: atLocal(0, '06:20'),
    started_at: atLocal(0, '06:20'),
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
    run_id: 'r-collect',
    automation_id: 'a-collect',
    title: '情報収集 run 30',
    run_number: '30',
    scheduled_for: atLocal(0, '05:00'),
    started_at: atLocal(0, '05:00'),
    status: 'completed',
    trigger: 'scheduled',
    outcome: 'produced',
    items: 1,
    note: '承認待ち',
    headline: '受信箱を1件仕分けました。',
    output: '受信箱を1件仕分けました。',
    truncated: false,
  },
];

/** `profile.review` だけを剥がした同じ名簿（MY DESK の件数が動かないことの対照） */
const EMPLOYEES_WITHOUT_REVIEW = EMPLOYEES.map((employee) => {
  if (!employee.profile) return employee;
  const stripped = { ...(employee.profile as Record<string, unknown>) };
  delete stripped.review;
  return { ...employee, profile: stripped };
});

function office(overrides: Record<string, unknown> = {}) {
  return { generated_at: localIso(new Date()), window_days: 14, employees: EMPLOYEES, runs: RUNS, ...overrides };
}

async function mockOffice(page: Page, body: unknown = office()) {
  await page.route('**/office.json', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) }),
  );
}

/** 社員カードを URL で直接開く（席タップの検証は 5k5.1 が持つ） */
async function openCard(page: Page, automationId: string, label: string) {
  await page.goto(`/office?room=library&employee=${automationId}`);
  const card = page.getByRole('dialog', { name: `${label}の名簿` });
  await expect(card).toBeVisible();
  return card;
}

// ---- 人間確認の文言（§3.1-1） ----

test('複数 kind × cadence:shift の社員に「人間確認: approve・read（勤務帯どおり毎回）」が出る', async ({
  page,
}) => {
  await mockOffice(page);
  const card = await openCard(page, 'a-digest', '朝ダイジェスト（daily-digest）');

  // kinds は翻訳せず「あなた待ち」（25）と同じ語のまま出す（§3.1-2）
  await expect(card.locator('.of__card-review')).toHaveText('人間確認: approve・read（勤務帯どおり毎回）');
  // 所属部署は id のまま。日本語ラベルへ翻訳しない（§3.3-2・§4）
  await expect(card.locator('.of__card-meta-wide dd')).toHaveText('second-brain-harness');

  await page.screenshot({ path: 'test-results/screens/cerebellum-65b.1-office.png', fullPage: false });
});

test('kinds が alert のみなら「異常のみ通知」に言い換える', async ({ page }) => {
  await mockOffice(page);
  const card = await openCard(page, 'a-watchdog', 'ルーティン監視（routine-watchdog）');

  await expect(card.locator('.of__card-review')).toHaveText('人間確認: 異常のみ通知（勤務帯どおり毎回）');
  // 言い換えるのは alert 単独のときだけなので、生の語は出ない
  await expect(card.locator('.of__card-review')).not.toContainText('alert');
});

test('cadence が adhoc なら「不定期」と添える', async ({ page }) => {
  await mockOffice(page);
  const card = await openCard(page, 'a-ask', '相談窓口（ask）');

  await expect(card.locator('.of__card-review')).toHaveText('人間確認: choose（不定期）');
});

test('review が明示的な null なら「人間確認: なし」で、未記載様式にしない', async ({ page }) => {
  await mockOffice(page);
  // a-collect の `profile.review` は **`null` を明示**したフィクスチャ（キー欠落での代替にしない）
  const card = await openCard(page, 'a-collect', '情報収集（collect）');

  const review = card.locator('.of__card-review');
  await expect(review).toHaveText('人間確認: なし');
  // 「なし」は欠損ではなく正常な状態（24 §9）。21 §3.2-3 の「未記載」様式に寄せない（§3.1-1）
  await expect(review).not.toContainText('未記載');
  await expect(review).not.toHaveClass(/missing/);
  // 欠損表示（muted）と同じ色にしない＝カード本文と同じ色で出す
  const [reviewColor, jobColor] = await Promise.all([
    review.evaluate((node) => getComputedStyle(node).color),
    card.locator('.of__card-job').evaluate((node) => getComputedStyle(node).color),
  ]);
  expect(reviewColor).toBe(jobColor);
});

// ---- 所属部署（§3.1-3） ----

test('dept が明示的な null なら「部署 未記載」で、skill 名から推測した値を出さない', async ({
  page,
}) => {
  await mockOffice(page);
  // a-idea-forge の `profile.dept` は **`null` を明示**したフィクスチャ（キー欠落での代替にしない）
  const card = await openCard(page, 'a-idea-forge', '着想鍛造（idea-forge）');

  await expect(card.locator('.of__card-meta-wide dd')).toHaveText('部署 未記載');
  // 他社員の部署 id も、skill 名（idea-forge）・line（incubate）からの推測値も出ない（§3.1-3・§9）
  await expect(card).not.toContainText('second-brain-harness');
  await expect(card).not.toContainText('engineering');
  await expect(card).not.toContainText('harness');
  await expect(card).not.toContainText('incubate');
});

test('dept のキーが無い社員も同じく「部署 未記載」（生成側の未対応を推測で埋めない）', async ({
  page,
}) => {
  await mockOffice(page);
  // a-watchdog の `profile` には `dept` キーそのものが無い（§2「届くまでは全社員 null として扱う」）
  const card = await openCard(page, 'a-watchdog', 'ルーティン監視（routine-watchdog）');

  await expect(card.locator('.of__card-meta-wide dd')).toHaveText('部署 未記載');
  await expect(card).not.toContainText('engineering');
});

// ---- 席には出さない（§3.1-4） ----

test('席には所属部署も人間確認も出ない（正常なものほど静かに）', async ({ page }) => {
  await mockOffice(page);
  await page.goto('/office?room=library');

  const room = page.getByRole('region', { name: 'LIBRARYの社員' });
  await expect(room.locator('.of3__worker')).toHaveCount(8);
  const seats = (await room.locator('.of3__worker').allInnerTexts()).join(' ');
  expect(seats).not.toContain('人間確認');
  expect(seats).not.toContain('second-brain-harness');
  expect(seats).not.toContain('engineering');
  expect(seats).not.toContain('部署');
  // 席が名簿から読むのは起動コマンドだけ（21 §3.3-2）——それは消えていない
  expect(seats).toContain('/ask');
});

// ---- MY DESK は review を混ぜない（§3.1-4） ----

test('MY DESK の件数は review の有無で変わらない', async ({ page }) => {
  const deskTitle = page.locator('#office-desk-title');

  await mockOffice(page);
  await page.goto('/office?desk=1');
  await expect(deskTitle).toHaveText('承認待ち 3件');
  await expect(page.locator('.of3__task')).toHaveCount(2);

  // 名簿から `review` だけを剥がしても、承認待ちの実績（run の note）は同じ
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await mockOffice(page, office({ employees: EMPLOYEES_WITHOUT_REVIEW }));
  await page.goto('/office?desk=1');
  await expect(deskTitle).toHaveText('承認待ち 3件');
  await expect(page.locator('.of3__task')).toHaveCount(2);
});

// ---- 部署ヘッダの内訳（§3.2） ----

test('部署ヘッダに「人間確認あり n名」と「名簿未記載 m名」が出る', async ({ page }) => {
  await mockOffice(page);
  await page.goto('/office?room=library');

  // 勤務帯6・手動1・停止中1／review を持つのは digest・watchdog・ask・retired の4名／
  // **`profile` が無いのは bare の1名だけ**——`job` が空の a-blank は frontmatter があるので
  // 数えない（§3.2-2）。未記載を隠すと設定漏れが永久に見えなくなる
  await expect(page.locator('.of3__room-breakdown')).toHaveText(
    '勤務帯 6名・手動 1名・停止中 1名・人間確認あり 4名・名簿未記載 1名',
  );

  await page.screenshot({
    path: 'test-results/screens/cerebellum-65b.1-office-breakdown.png',
    fullPage: false,
  });
});

test('job が空だけの社員はカードでは「名簿 未記載」でも、ヘッダの名簿未記載には数えない', async ({
  page,
}) => {
  await mockOffice(page);

  // カードの表示は 21 §3.2-3 のまま（`profile` が無い／`job` が空 → 「名簿 未記載」）
  const blank = await openCard(page, 'a-blank', '空欄の社員（stub）');
  await expect(blank.locator('.of__card-job')).toHaveText('名簿 未記載');
  const bare = await openCard(page, 'a-bare', '旧バックアップ（bare）');
  await expect(bare.locator('.of__card-job')).toHaveText('名簿 未記載');

  // ヘッダが数えるのは「カードが書けない一体」＝ `profile` 不在の a-bare だけ（26 §3.2-2）。
  // 2名になっていたら `job` 空の a-blank まで混ざっている
  await page.goto('/office?room=library');
  await expect(page.locator('.of3__room-breakdown')).toContainText('名簿未記載 1名');
});

test('review を持つ社員が居なければ「人間確認あり」の項は出ない（0名を書かない）', async ({ page }) => {
  await mockOffice(page, office({ employees: EMPLOYEES_WITHOUT_REVIEW }));
  await page.goto('/office?room=library');

  const breakdown = page.locator('.of3__room-breakdown');
  await expect(breakdown).toHaveText('勤務帯 6名・手動 1名・停止中 1名・名簿未記載 1名');
  await expect(breakdown).not.toContainText('人間確認あり');
});
