import { expect, test, type Page } from '@playwright/test';

// cerebellum-5k5.1 [Frontend] 社員カードシート（/office?employee=）と名簿項目の描画
// 受け入れ基準（docs/specs/21-web-office-roster.md §3.1・§3.2・§6）:
//   席タップで URL 付きの社員カードが開く / カードに job・勤務帯/手動・command・checks 全件・skill が
//   §3.1-2 の順で出る / profile が無い社員で「名簿 未記載」と doc の在処が出る /
//   checks が空で「確認事項の記載なし」/ 「報告を見る」→報告シート→閉じると社員カードへ戻る /
//   `?run=` 単独の deep link の戻り先は従来どおり部署 / 未知の employee で NOT FOUND /
//   停止中社員の席からも名簿が開ける
//
// office.json は :48310 の静的サーバが配信する外部データなので page.route で差し替える
// （実サーバの起動状態やその日の automation 実行結果にテストを依存させない。004.1 と同じ手法）。

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

/** 全員 LIBRARY（skill 名の分類規則・20 §3.1-3）に落ちるようにして1部署で検証する */
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
    profile: {
      job: '朝までに未処理の受信箱を仕分けます',
      command: '/gather',
      checks: ['仕分け先が意図どおりか', '重複した候補が無いか', '取りこぼした受信箱が無いか'],
      doc: '.claude/skills/collect/SKILL.md',
    },
  },
  {
    // 名簿が未整備の社員。job が空でも doc があれば「どこを直せばいいか」は出す（§3.2-3）
    automation_id: 'a-bare',
    name: '旧バックアップ（bare）',
    skill: null,
    enabled: true,
    shift: { hour: 4, minute: 0, days: '毎日', label: '毎日 04:00' },
    next_run_at: atLocal(1, '04:00'),
    last_run_at: null,
    last_run_id: null,
    trigger: 'scheduled',
    profile: { job: '', command: null, checks: [], doc: '.claude/scripts/backup.sh' },
  },
  {
    // 停止中でも名簿は読める（§3.1-6）。ただし停止前の headline は出さない（20 §3.1-4）
    automation_id: 'a-retired',
    name: '旧ダッシュボード生成（retired）',
    skill: null,
    enabled: false,
    shift: { hour: 7, minute: 0, days: '毎日', label: '毎日 07:00' },
    next_run_at: null,
    last_run_at: atLocal(-30, '07:00'),
    last_run_id: 'r-retired',
    trigger: 'scheduled',
    profile: {
      job: '運用ダッシュボードのHTMLを吐いていました',
      command: null,
      checks: ['もう使っていないこと'],
      doc: null,
    },
  },
];

const RUNS = [
  {
    run_id: 'r-collect-today',
    automation_id: 'a-collect',
    title: '情報収集（collect） run 40',
    run_number: '40',
    scheduled_for: atLocal(0, '05:00'),
    started_at: atLocal(0, '05:00'),
    status: 'completed',
    trigger: 'scheduled',
    outcome: 'produced',
    items: 3,
    note: null,
    headline: '受信箱を3件仕分けました。',
    output: '受信箱を3件仕分けました。\n\n- 候補A\n- 候補B\n- 候補C',
    truncated: false,
  },
  {
    run_id: 'r-retired',
    automation_id: 'a-retired',
    title: '旧ダッシュボード生成（retired） run 3',
    run_number: '3',
    scheduled_for: atLocal(-30, '07:00'),
    started_at: atLocal(-30, '07:00'),
    status: 'completed',
    trigger: 'scheduled',
    outcome: 'produced',
    items: 1,
    note: null,
    headline: '停止前の最後の報告です。',
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
    ...overrides,
  };
}

async function mockOffice(page: Page, body: unknown = office()) {
  await page.route('**/office.json', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) }),
  );
}

test('席タップで社員カードが開き、名簿が読み順どおりに出る', async ({ page }) => {
  await mockOffice(page);
  await page.goto('/office?room=library');

  await page.getByRole('link', { name: /情報収集（collect）の名簿を開く/ }).click();
  await expect(page).toHaveURL(/\/office\?room=library&employee=a-collect$/);

  const card = page.getByRole('dialog', { name: '情報収集（collect）の名簿' });
  await expect(card).toBeVisible();
  await expect(card).toContainText('社員名簿');
  await expect(card).toContainText('朝までに未処理の受信箱を仕分けます');
  await expect(card).toContainText('毎日 05:00');
  await expect(card).toContainText('/gather');
  await expect(card).toContainText('collect');
  // checks は件数上限で切らず全件出す（§3.2-2）
  await expect(card).toContainText('仕分け先が意図どおりか');
  await expect(card).toContainText('重複した候補が無いか');
  await expect(card).toContainText('取りこぼした受信箱が無いか');
  await expect(card.locator('.of__card-checks li')).toHaveCount(3);
  // 直近状態と headline はカード上で読める（全文だけが報告シート）
  await expect(card).toContainText('成果あり 3件');
  await expect(card).toContainText('受信箱を3件仕分けました。');

  // 何をする人か → いつ動くか → どう呼ぶか → 出たら何を見るか → 出典 の順（§3.1-2）
  const body = (await card.innerText()).replace(/\s+/g, ' ');
  const at = (needle: string) => {
    const index = body.indexOf(needle);
    expect(index, needle + ' がカードに無い').toBeGreaterThan(-1);
    return index;
  };
  expect(at('朝までに未処理の受信箱を仕分けます')).toBeGreaterThan(at('情報収集（collect）'));
  expect(at('勤務')).toBeGreaterThan(at('朝までに未処理の受信箱を仕分けます'));
  expect(at('起動')).toBeGreaterThan(at('勤務'));
  expect(at('SKILL')).toBeGreaterThan(at('起動'));
  expect(at('実行後に確認すべきこと')).toBeGreaterThan(at('SKILL'));
  expect(at('直近の状態')).toBeGreaterThan(at('実行後に確認すべきこと'));

  await page.screenshot({ path: 'test-results/screens/cerebellum-5k5.1-employee-card.png', fullPage: false });
});

test('名簿が無い社員は「名簿 未記載」と直す場所を出し、値を捏造しない', async ({ page }) => {
  await mockOffice(page);
  await page.goto('/office?room=library&employee=a-bare');

  const card = page.getByRole('dialog', { name: '旧バックアップ（bare）の名簿' });
  await expect(card).toContainText('名簿 未記載');
  // 直す場所（正本は SKILL.md 側）を等幅で添える。リンクにはしない（§3.2-4）
  await expect(card).toContainText('.claude/scripts/backup.sh');
  await expect(card.getByRole('link', { name: '.claude/scripts/backup.sh' })).toHaveCount(0);
  await expect(card).toContainText('起動コマンドなし');
  await expect(card).toContainText('確認事項の記載なし');
  await expect(card).toContainText('skill なし（素の実行）');
  await expect(card).toContainText('まだ実行なし');
  // 直近 run が無い社員に報告への導線を作らない（§3.1-3）
  await expect(card.getByRole('link', { name: '報告を見る' })).toHaveCount(0);
  // 起動コマンドはコピーボタンを持たない（tailnet の http では clipboard が使えない・§3.2-5）
  await expect(card.getByRole('button')).toHaveCount(0);
});

test('社員カードから報告シートへ移り、閉じるとカードへ戻る', async ({ page }) => {
  await mockOffice(page);
  await page.goto('/office?room=library&employee=a-collect');

  const card = page.getByRole('dialog', { name: '情報収集（collect）の名簿' });
  await card.getByRole('link', { name: '報告を見る' }).click();
  await expect(page).toHaveURL(/\/office\?room=library&employee=a-collect&run=r-collect-today$/);

  // シートは常に1枚（§3.1-4）
  await expect(page.getByRole('dialog')).toHaveCount(1);
  const sheet = page.getByRole('dialog', { name: '情報収集（collect）', exact: true });
  await expect(sheet).toContainText('受信箱を3件仕分けました。');
  await sheet.getByRole('button', { name: '報告を見る' }).click();
  await expect(sheet).toContainText('候補B');

  await sheet.getByRole('link', { name: '閉じる' }).click();
  await expect(page).toHaveURL(/\/office\?room=library&employee=a-collect$/);
  await expect(card).toBeVisible();
});

test('`?run=` 単独の deep link は従来どおり部署へ戻る', async ({ page }) => {
  await mockOffice(page);
  await page.goto('/office?room=library&run=r-collect-today');

  const sheet = page.getByRole('dialog', { name: '情報収集（collect）', exact: true });
  await expect(sheet).toBeVisible();
  await sheet.getByRole('link', { name: '閉じる' }).click();
  // 名簿を経由していない deep link の戻り先は 20 §3.5-4 のまま（§3.1-4）
  await expect(page).toHaveURL(/\/office\?room=library$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('未知の employee は見つからないことを出す（落とさない）', async ({ page }) => {
  await mockOffice(page);
  await page.goto('/office?room=library&employee=a-missing');

  const card = page.getByRole('dialog', { name: 'その社員は見つかりません' });
  await expect(card).toContainText('a-missing');
  await card.getByRole('link', { name: '閉じる' }).click();
  await expect(page).toHaveURL(/\/office\?room=library$/);
  // 部署そのものは通常どおり出る
  await expect(page.getByRole('region', { name: 'LIBRARYの社員' })).toBeVisible();
});

test('停止中社員の席からも名簿が開ける（状態は停止中・停止前の報告は出さない）', async ({ page }) => {
  await mockOffice(page);
  await page.goto('/office?room=library');

  await page.locator('.of3__worker--stopped').click();
  await expect(page).toHaveURL(/\/office\?room=library&employee=a-retired$/);

  const card = page.getByRole('dialog', { name: '旧ダッシュボード生成（retired）の名簿' });
  await expect(card).toContainText('運用ダッシュボードのHTMLを吐いていました');
  await expect(card).toContainText('停止中');
  await expect(card).toContainText('もう使っていないこと');
  // 停止中は停止前の headline も報告導線も出さない（20 §3.1-4）
  await expect(card).not.toContainText('停止前の最後の報告です。');
  await expect(card.getByRole('link', { name: '報告を見る' })).toHaveCount(0);
});
