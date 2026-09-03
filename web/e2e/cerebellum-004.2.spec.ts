import { expect, test, type Locator, type Page } from '@playwright/test';

// cerebellum-004.2 [Frontend] 報告シート（/office?run=）とドロワー項目の追加
// 受け入れ基準（docs/specs/20-web-office.md §3.5・§6・docs/specs/16-web-navigation.md §3.5）:
//   部署内の席またはMY DESKからURL付きシートに headline とメタが出る /
//   「報告を見る」で全文が展開される / 閉じると直前の部署・MY DESKへ戻る /
//   output: null の run で保持期間外メッセージが出る / ブラウザバックで全景へ戻れる /
//   ドロワーに「オフィス」があり遷移してアクティブ表示になる
//
// office.json は :48310 の静的サーバが配信する外部データなので、**page.route で
// フィクスチャに差し替えて**検証する（実行日や automation の実行結果にテストを
// 依存させない＝ false-gate を作らない）。手法は e2e/cerebellum-004.1.spec.ts と同じ。
//
// 004.1 が全景・部署内の**配置**を守る一方、こちらは報告シートの**中身と出入り**を守る。
// 起動しているのは release バイナリ＋使い捨ての空 DB（playwright.config.ts）。

/** ローカル ISO（`+09:00` 付き）。office.json の時刻は生成側で解決済みの形（§2） */
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

/** 「n 日ずらしたローカル日付の HH:MM」。画面の当日判定（端末ローカル日付）と同じ基準 */
function atLocal(dayOffset: number, hhmm: string): string {
  const at = new Date();
  at.setDate(at.getDate() + dayOffset);
  const [hour, minute] = hhmm.split(':').map(Number);
  at.setHours(hour, minute, 0, 0);
  return localIso(at);
}

/** 部屋は skill 名から決まる（lib/office.ts §3.1）。lab / market / library に1名ずつ置く */
const EMPLOYEES = [
  {
    automation_id: 'a-night-harness',
    name: 'ハーネス取り込み判定（night-harness）',
    skill: 'night-harness',
    enabled: true,
    shift: { hour: 2, minute: 0, days: '毎日', label: '毎日 02:00' },
    next_run_at: atLocal(1, '02:00'),
    last_run_at: atLocal(0, '02:00'),
    last_run_id: 'r-harness-today',
  },
  {
    automation_id: 'a-market-intake',
    name: '候補仕入れ（market-intake）',
    skill: 'market-intake',
    enabled: true,
    shift: { hour: 2, minute: 40, days: '平日', label: '平日 02:40' },
    next_run_at: atLocal(1, '02:40'),
    last_run_at: atLocal(-5, '02:40'),
    last_run_id: 'r-intake-old',
  },
  {
    automation_id: 'a-collect',
    name: '情報収集（collect）',
    skill: 'collect',
    enabled: true,
    shift: { hour: 5, minute: 0, days: '毎日', label: '毎日 05:00' },
    next_run_at: atLocal(1, '05:00'),
    last_run_at: atLocal(0, '05:00'),
    last_run_id: 'r-collect-today',
  },
];

const HARNESS_OUTPUT = '## 取り込み候補\n\n- 提案1: verify の並列化\n- 提案2: hooks の整理\n';

const RUNS = [
  {
    // 機械可読な承認待ち（produced ＋ note 完全一致）だけが MY DESK に載る（§3.3-1）
    run_id: 'r-harness-today',
    automation_id: 'a-night-harness',
    title: 'ハーネス取り込み判定（night-harness） run 25',
    run_number: '25',
    scheduled_for: atLocal(0, '02:00'),
    started_at: atLocal(0, '02:03'),
    status: 'completed',
    trigger: 'scheduled',
    outcome: 'produced',
    items: 2,
    note: '承認待ち',
    headline: '取り込み候補を2件出しました。',
    output: HARNESS_OUTPUT,
    // 途中で切れた報告は注記を添える（§3.5-3）
    truncated: true,
  },
  {
    // 3日より古い run は output が落ちている（§2）。欠落を無言にしない（§3.5-2）
    run_id: 'r-intake-old',
    automation_id: 'a-market-intake',
    title: '候補仕入れ（market-intake） run 11',
    run_number: '11',
    scheduled_for: atLocal(-5, '02:40'),
    started_at: atLocal(-5, '02:40'),
    status: 'completed',
    trigger: 'scheduled',
    outcome: 'unknown',
    items: null,
    note: null,
    headline: '候補を5件仕入れました。',
    output: null,
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
    outcome: 'none',
    items: null,
    note: null,
    headline: '新しい記事はありませんでした。',
    output: '新しい記事はありませんでした。',
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

/** http（:48310 直）でも https（`/loop-reports` の path マウント）でも同じ1本で捕まえる */
async function mockOffice(page: Page, body: unknown = office()) {
  await page.route('**/office.json', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) }),
  );
}

async function openDrawer(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'メニュー', exact: true }).click();
  const drawer = page.getByRole('navigation', { name: 'ナビゲーション' });
  await expect(drawer).toBeVisible();
  return drawer;
}

// ---- 報告シートの中身（§3.5-1・§3.5-3） ----

test('席から開いた報告シートは headline とメタを先に出し、「報告を見る」で全文を開く', async ({
  page,
}) => {
  await mockOffice(page);
  await page.goto('/office?room=unassigned');

  await page.getByRole('link', { name: /ハーネス取り込み判定.*名簿を開く/ }).click();
  await page
    .getByRole('dialog', { name: 'ハーネス取り込み判定（night-harness）の名簿' })
    .getByRole('link', { name: '報告を見る' })
    .click();

  // シートは URL を持つ（§3.5-1。ブラウザバックで閉じられる前提）
  await expect(page).toHaveURL(
    /\/office\?room=unassigned&employee=a-night-harness&run=r-harness-today$/,
  );
  // `exact` を付ける。既定の部分一致では名簿カード（「…の名簿」）にも当たる
  const sheet = page.getByRole('dialog', { name: 'ハーネス取り込み判定（night-harness）', exact: true });
  await expect(sheet).toBeVisible();

  // 最初に出るのは headline と主要メタだけ（全文はまだ出さない）
  await expect(sheet.locator('.of2__headline')).toHaveText('取り込み候補を2件出しました。');
  await expect(sheet).toContainText('毎日 02:00');
  for (const meta of ['RUN', '予定', '開始', '状態', '起動']) {
    await expect(sheet).toContainText(meta);
  }
  await expect(sheet).toContainText('25');
  await expect(sheet).toContainText('completed');
  await expect(sheet).toContainText('scheduled');
  await expect(sheet.getByRole('button', { name: '報告を見る' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await expect(sheet).not.toContainText('提案1: verify の並列化');

  await sheet.getByRole('button', { name: '報告を見る' }).click();
  const body = sheet.locator('.of2__report-body');
  await expect(body).toContainText('提案1: verify の並列化');
  await expect(body).toContainText('提案2: hooks の整理');
  // md として描く（見出しが素のテキストで出ない）
  await expect(body.getByRole('heading', { name: '取り込み候補' })).toBeVisible();
  // 切れている報告は注記を添える（§3.5-3）
  await expect(sheet).toContainText('報告は途中で切れています');

  await sheet.getByRole('button', { name: '報告を閉じる' }).click();
  await expect(sheet.locator('.of2__report-body')).toHaveCount(0);
  await expect(sheet.getByRole('button', { name: '報告を見る' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );

  await page.screenshot({ path: 'test-results/screens/cerebellum-004.2-report.png' });
});

test('output が null の run は「保持期間外」と出す（欠落を無言にしない）', async ({ page }) => {
  await mockOffice(page);
  await page.goto('/office?room=unassigned&employee=a-market-intake&run=r-intake-old');

  const sheet = page.getByRole('dialog', { name: '候補仕入れ（market-intake）', exact: true });
  await expect(sheet.locator('.of2__headline')).toHaveText('候補を5件仕入れました。');
  await sheet.getByRole('button', { name: '報告を見る' }).click();
  await expect(sheet).toContainText('報告全文は保持期間外です');
  // 保持期間外は truncated ではない（両方出したら区別が付かない）
  await expect(sheet).not.toContainText('報告は途中で切れています');
});

// ---- 出入り（§3.5-4・§6） ----

test('MY DESK から開いた報告は、閉じても MY DESK に戻る', async ({ page }) => {
  await mockOffice(page);
  await page.goto('/office');

  await page.getByRole('link', { name: /MY DESK、承認待ち2件/ }).click();
  const desk = page.getByRole('dialog', { name: '承認待ち 2件' });
  await expect(desk).toBeVisible();

  await desk.getByRole('link', { name: /ハーネス取り込み判定/ }).click();
  await expect(page).toHaveURL(/\/office\?desk=1&run=r-harness-today$/);
  const sheet = page.getByRole('dialog', { name: 'ハーネス取り込み判定（night-harness）', exact: true });
  await expect(sheet).toBeVisible();
  // シートは常に1枚（報告が出ている間 MY DESK は下に隠れる）
  await expect(sheet.locator('.of2__headline')).toHaveText('取り込み候補を2件出しました。');

  await sheet.getByRole('link', { name: '閉じる' }).click();
  await expect(page).toHaveURL(/\/office\?desk=1$/);
  await expect(page.getByRole('dialog', { name: '承認待ち 2件' })).toBeVisible();
});

test('ブラウザバックで報告 → MY DESK → 全景と1枚ずつ戻れる', async ({ page }) => {
  await mockOffice(page);
  await page.goto('/office');

  await page.getByRole('link', { name: /MY DESK、承認待ち2件/ }).click();
  await page.getByRole('link', { name: /ハーネス取り込み判定/ }).click();
  await expect(
    page.getByRole('dialog', { name: 'ハーネス取り込み判定（night-harness）', exact: true }),
  ).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/office\?desk=1$/);
  await expect(page.getByRole('dialog', { name: '承認待ち 2件' })).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/office$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'AIオフィス全景' })).toBeVisible();
});

test('`?run=` 単独の deep link は全景へ返す（未知の run はシート内で明示する）', async ({
  page,
}) => {
  await mockOffice(page);
  await page.goto('/office?run=r-collect-today');

  const sheet = page.getByRole('dialog', { name: '情報収集（collect）', exact: true });
  await expect(sheet.locator('.of2__headline')).toHaveText('新しい記事はありませんでした。');
  await sheet.getByRole('link', { name: '閉じる' }).click();
  await expect(page).toHaveURL(/\/office$/);
  await expect(page.getByRole('region', { name: 'AIオフィス全景' })).toBeVisible();

  // 未知の run は落とさず、フロアへ戻る導線を出す（§6）
  await page.goto('/office?run=no-such-run');
  const missing = page.getByRole('dialog', { name: 'その run は見つかりません' });
  await expect(missing).toContainText('no-such-run');
  await missing.getByRole('link', { name: '閉じる' }).click();
  await expect(page).toHaveURL(/\/office$/);
  await expect(page.getByRole('region', { name: 'AIオフィス全景' })).toBeVisible();
});

// ---- ドロワー項目（docs/specs/16-web-navigation.md §3.3・§3.5） ----

test('ドロワーの「オフィス」から遷移でき、オフィス配下ではアクティブ表示になる', async ({
  page,
}) => {
  await mockOffice(page);
  await page.goto('/');

  const drawer = await openDrawer(page);
  const item = drawer.getByRole('link', { name: 'オフィス', exact: true });
  await expect(item).toBeVisible();
  // 「今日」に居るのでまだアクティブではない
  await expect(item).not.toHaveAttribute('aria-current', 'page');
  await item.click();

  await expect(page).toHaveURL(/\/office$/);
  await expect(page.getByText('ROUTINE / OFFICE')).toBeVisible();
  // 遷移で閉じる（項目タップごとに閉じる・16 §3.4）
  await expect(page.getByRole('navigation', { name: 'ナビゲーション' })).toHaveCount(0);

  await openDrawer(page);
  await expect(page.getByRole('link', { name: 'オフィス', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );

  // 判定は前方一致（16 §3.5）。クエリ付きの部署内でもアクティブのまま
  // （報告シートを開いている間はヘッダごとバックドロップが覆う＝modal なので、
  //  ドロワーを開けるのはシートが閉じている状態だけ。ここは部署内で見る）
  await page.goto('/office?room=unassigned');
  await openDrawer(page);
  await expect(page.getByRole('link', { name: 'オフィス', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
});
