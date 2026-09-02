import { expect, test, type Page } from '@playwright/test';

// cerebellum-5k5.3 [Frontend] 担当エージェントとミニライン（社員カード内の 1-hop パイプライン）
// 受け入れ基準（docs/specs/21-web-office-roster.md §3.2・§3.6・§6）:
//   カードに agent が出る / null で「エージェント 未記載」（起動コマンドから推測しない）/
//   ミニラインが upstream → 本人 → downstream の3段で 2-hop 先を出さない /
//   human: が「あなた：〜」で強く出る / place: に「見る場所」が付きリンクを持たない /
//   社員ノードのタップで相手のカードへ移り 1-hop ずつ辿れる /
//   employees に無い automation_id は id のまま・タップ不可 / 未知の接頭辞は文字列のまま /
//   upstream が空なら上流ブロックを出さない / line:"none" は「独立（ラインなし）」/
//   profile 無しはミニラインを出さず「名簿 未記載」/ 停止中でライン途中の社員も消えない
//
// フィクスチャは docs/specs/21 §11 の配属表（knowledge・x・learning・none）から作る。

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

const shift = (hour: number, label: string) => ({ hour, minute: 0, days: '毎日', label });

const EMPLOYEES = [
  {
    // knowledge ライン。上流に人間、下流に社員（§11）
    automation_id: 'a-connection-process',
    name: 'つながり処理（connection-process）',
    skill: 'connection-process',
    enabled: true,
    shift: shift(23, '毎日 23:00'),
    next_run_at: atLocal(1, '23:00'),
    last_run_at: atLocal(0, '23:00'),
    last_run_id: 'r-connection',
    trigger: 'scheduled',
    profile: {
      job: 'Inbox のノートを既存知見へつなぎます',
      command: null,
      agent: 'claude-code (opus)',
      checks: ['つなぎ先が的外れでないか'],
      line: 'knowledge',
      upstream: ['a-collect', 'human:Inbox選別'],
      // 2-hop 先（consolidate の下流の daily-digest）は入れない＝画面にも出てはいけない
      downstream: ['a-consolidate'],
      doc: '.claude/skills/connection-process/SKILL.md',
    },
  },
  {
    automation_id: 'a-collect',
    name: '情報収集（collect）',
    skill: 'collect',
    enabled: true,
    shift: shift(5, '毎日 05:00'),
    next_run_at: atLocal(1, '05:00'),
    last_run_at: atLocal(0, '05:00'),
    last_run_id: 'r-collect',
    trigger: 'scheduled',
    profile: {
      job: '受信箱を仕分けます',
      command: null,
      agent: 'codex',
      checks: [],
      line: 'knowledge',
      upstream: [],
      downstream: ['human:Inbox選別'],
      doc: null,
    },
  },
  {
    automation_id: 'a-consolidate',
    name: '統合（consolidate）',
    skill: 'consolidate',
    enabled: true,
    shift: shift(1, '毎日 01:30'),
    next_run_at: atLocal(1, '01:30'),
    last_run_at: null,
    last_run_id: null,
    trigger: 'scheduled',
    profile: {
      job: 'ハブノートへ束ねます',
      command: null,
      agent: null,
      checks: ['ハブの見出しが崩れていないか'],
      line: 'knowledge',
      upstream: ['a-connection-process'],
      downstream: ['a-daily-digest'],
      doc: null,
    },
  },
  {
    // ライン途中の停止中社員。停止していても表示から消さない（§11 の含意）
    automation_id: 'a-daily-digest',
    name: 'つながり発見：daily-digest',
    skill: 'daily-digest',
    enabled: false,
    shift: shift(6, '毎日 06:00'),
    next_run_at: null,
    last_run_at: null,
    last_run_id: null,
    trigger: 'scheduled',
    profile: {
      job: '朝のダイジェストを出します',
      command: null,
      agent: 'claude-code (opus)',
      checks: ['未読が溜まっていないか'],
      line: 'knowledge',
      upstream: ['a-consolidate'],
      downstream: ['human:朝のcerebellum確認'],
      doc: null,
    },
  },
  {
    // x ライン。place: ノード（確認する場所）と human: を両方持つ
    automation_id: 'a-reply-assist',
    name: 'リプ支援（reply-assist）',
    skill: 'reply-assist',
    enabled: true,
    shift: shift(12, '毎日 12:10・19:40'),
    next_run_at: atLocal(0, '19:40'),
    last_run_at: atLocal(0, '12:10'),
    last_run_id: 'r-reply',
    trigger: 'scheduled',
    profile: {
      job: 'リプ候補の下書きを作ります',
      command: null,
      agent: 'claude-code (sonnet)',
      checks: ['相手の文脈を取り違えていないか'],
      line: 'x',
      upstream: [],
      downstream: ['place:Typefully draft', 'human:送信判断'],
      doc: null,
    },
  },
  {
    // 解決できない値の2種: employees に無い automation_id ／ 未知の接頭辞
    automation_id: 'a-night-study',
    name: '夜学（night-study）',
    skill: 'night-study',
    enabled: true,
    shift: shift(5, '毎日 05:30'),
    next_run_at: atLocal(1, '05:30'),
    last_run_at: null,
    last_run_id: null,
    trigger: 'scheduled',
    profile: {
      job: '学習セットを作ります',
      command: null,
      agent: 'codex',
      checks: ['難度が偏っていないか'],
      line: 'learning',
      upstream: ['a-deleted-employee'],
      downstream: ['human:解いて自己採点', 'slack:#study'],
      doc: null,
    },
  },
  {
    // 手動社員。manual: ノードの解決先になる（command 一致）
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
      job: '第二の脳に聞いて答えます',
      command: '/ask',
      agent: 'claude-code (opus)',
      checks: ['引用元が実在するか'],
      line: 'knowledge',
      upstream: ['a-consolidate'],
      downstream: [],
      doc: null,
    },
  },
  {
    // 独立（ラインなし）。矢印もブロックも出ない
    automation_id: 'a-thinking-gym',
    name: '思考体操（thinking-gym）',
    skill: 'thinking-gym',
    enabled: true,
    shift: null,
    next_run_at: null,
    last_run_at: null,
    last_run_id: null,
    trigger: 'manual',
    profile: {
      job: '思考のクセを崩します',
      command: '/thinking-gym',
      agent: 'claude-code (opus)',
      checks: [],
      line: 'none',
      upstream: [],
      downstream: [],
      doc: null,
    },
  },
  {
    // 名簿が丸ごと無い社員。ミニラインを出さない（§3.6-8）
    automation_id: 'a-bare',
    name: '旧バックアップ（bare）',
    skill: null,
    enabled: true,
    shift: shift(4, '毎日 04:00'),
    next_run_at: atLocal(1, '04:00'),
    last_run_at: null,
    last_run_id: null,
    trigger: 'scheduled',
    profile: null,
  },
];

const RUNS = [
  {
    run_id: 'r-connection',
    automation_id: 'a-connection-process',
    title: 'つながり処理 run 12',
    run_number: '12',
    scheduled_for: atLocal(0, '23:00'),
    started_at: atLocal(0, '23:00'),
    status: 'completed',
    trigger: 'scheduled',
    outcome: 'produced',
    items: 2,
    note: null,
    headline: 'つながりを2件作りました。',
    output: 'つながりを2件作りました。',
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

const card = (page: Page, name: string) => page.getByRole('dialog', { name: `${name}の名簿` });

test('カードに担当エージェントが出て、未記載は推測で埋めない', async ({ page }) => {
  await mockOffice(page);
  await page.goto('/office?room=library&employee=a-connection-process');
  const sheet = card(page, 'つながり処理（connection-process）');
  await expect(sheet).toContainText('AGENT');
  await expect(sheet).toContainText('claude-code (opus)');
  // skill（何の手順で動くか）と agent（誰が動かすか）は別物
  await expect(sheet).toContainText('connection-process');

  await page.goto('/office?room=library&employee=a-consolidate');
  const missing = card(page, '統合（consolidate）');
  await expect(missing).toContainText('エージェント 未記載');
  await expect(missing).not.toContainText('claude');
  await expect(missing).not.toContainText('codex');
});

test('ミニラインが upstream → 本人 → downstream の1-hopで出て、2-hop先を出さない', async ({ page }) => {
  await mockOffice(page);
  await page.goto('/office?room=library&employee=a-connection-process');
  const sheet = card(page, 'つながり処理（connection-process）');

  await expect(sheet).toContainText('LINE: 知識');
  const upstream = sheet.getByLabel('上流');
  const downstream = sheet.getByLabel('下流');
  await expect(upstream.locator('.of__ml-node')).toHaveText(['情報収集（collect）', 'あなた：Inbox選別']);
  await expect(sheet.locator('.of__ml-self')).toHaveText('つながり処理（connection-process）');
  await expect(downstream.locator('.of__ml-node')).toHaveText(['統合（consolidate）']);
  // 2-hop 先（consolidate の下流）は出ない
  await expect(sheet).not.toContainText('つながり発見：daily-digest');

  // 人間の仕事は他より強く出す（§3.6-6）
  await expect(upstream.locator('.of__ml-node--human')).toHaveText('あなた：Inbox選別');
  await expect(upstream.getByRole('link', { name: 'あなた：Inbox選別' })).toHaveCount(0);

  await page.screenshot({ path: 'test-results/screens/cerebellum-5k5.3-mini-line.png', fullPage: false });
});

test('place: ノードに「見る場所」が付き、リンクを持たない', async ({ page }) => {
  await mockOffice(page);
  await page.goto('/office?room=studio&employee=a-reply-assist');
  const sheet = card(page, 'リプ支援（reply-assist）');

  const place = sheet.locator('.of__ml-node--place');
  await expect(place).toContainText('Typefully draft');
  await expect(place).toContainText('見る場所');
  await expect(sheet.getByRole('link', { name: /Typefully draft/ })).toHaveCount(0);
  // 上流が空なら上流ブロックを出さない（§3.6-8）
  await expect(sheet.getByLabel('上流')).toHaveCount(0);
  await expect(sheet.getByLabel('下流')).toBeVisible();
});

test('社員ノードのタップで相手のカードへ移り、1-hopずつ辿れる', async ({ page }) => {
  await mockOffice(page);
  await page.goto('/office?room=library&employee=a-connection-process');

  await card(page, 'つながり処理（connection-process）')
    .getByRole('link', { name: '統合（consolidate）' })
    .click();
  await expect(page).toHaveURL(/\/office\?room=library&employee=a-consolidate$/);
  const next = card(page, '統合（consolidate）');
  await expect(next.locator('.of__ml-self')).toHaveText('統合（consolidate）');

  // さらに1-hop 先（停止中でもライン上に残る）
  await next.getByRole('link', { name: 'つながり発見：daily-digest' }).click();
  await expect(page).toHaveURL(/employee=a-daily-digest$/);
  const stoppedCard = card(page, 'つながり発見：daily-digest');
  await expect(stoppedCard).toContainText('停止中');
  await expect(stoppedCard).toContainText('あなた：朝のcerebellum確認');
});

test('解決できないノードは値のまま出し、タップさせない', async ({ page }) => {
  await mockOffice(page);
  await page.goto('/office?room=lab&employee=a-night-study');
  const sheet = card(page, '夜学（night-study）');

  // employees に無い automation_id は id のまま（名前を捏造しない・§3.6-4）
  await expect(sheet.getByLabel('上流')).toContainText('a-deleted-employee');
  await expect(sheet.getByRole('link', { name: 'a-deleted-employee' })).toHaveCount(0);
  // 未知の接頭辞も落とさない（§6）
  await expect(sheet.getByLabel('下流')).toContainText('slack:#study');
  await expect(sheet.getByRole('link', { name: 'slack:#study' })).toHaveCount(0);
});

test('manual: ノードは在籍する手動社員のカードへ繋がる', async ({ page }) => {
  await mockOffice(
    page,
    office({
      employees: EMPLOYEES.map((employee) =>
        employee.automation_id === 'a-consolidate' && employee.profile
          ? { ...employee, profile: { ...employee.profile, downstream: ['manual:/ask', 'manual:/unknown-cmd'] } }
          : employee,
      ),
    }),
  );
  await page.goto('/office?room=library&employee=a-consolidate');
  const sheet = card(page, '統合（consolidate）');

  await expect(sheet.getByLabel('下流')).toContainText('/unknown-cmd');
  await expect(sheet.getByRole('link', { name: '/unknown-cmd' })).toHaveCount(0);
  await sheet.getByRole('link', { name: '/ask' }).click();
  await expect(page).toHaveURL(/employee=a-ask$/);
  await expect(card(page, '相談窓口（ask）')).toContainText('手動起動');
});

test('独立と名簿未記載は、それぞれの言い方で出す', async ({ page }) => {
  await mockOffice(page);
  await page.goto('/office?room=lab&employee=a-thinking-gym');
  const independent = card(page, '思考体操（thinking-gym）');
  await expect(independent).toContainText('独立（ラインなし）');
  await expect(independent.getByLabel('上流')).toHaveCount(0);
  await expect(independent.getByLabel('下流')).toHaveCount(0);
  await expect(independent.locator('.of__ml-self')).toHaveText('思考体操（thinking-gym）');

  // profile が無い社員はミニラインを出さない（§3.6-8）
  await page.goto('/office?room=library&employee=a-bare');
  const bare = card(page, '旧バックアップ（bare）');
  await expect(bare).toContainText('名簿 未記載');
  await expect(bare.locator('.of__ml')).toHaveCount(0);
});
