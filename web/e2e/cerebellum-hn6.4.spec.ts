import { expect, test, type Locator, type Page } from '@playwright/test';

// cerebellum-hn6.4 [Frontend] ドロワー: 「あなた待ち」に未決バッジ
// 受け入れ基準（docs/specs/25-web-inbox.md §3.5）:
//   バッジの件数 / 0 件で非表示
//
// 「ハーネス」項目の削除はこのタスクでは**やらない**（night-harness の移行完了と同時に
// 別タスクで行う・同 §3.5）。ここでは項目一覧が8つのまま変わっていないことも併せて守る。
//
// 件数の入力は `GET /api/inbox/summary`（docs/specs/24-inbox.md §3.5）だけ。fullyParallel で
// 他テスト（cerebellum-hn6.1）が実 API で項目を投入するため、**固定応答に差し替える**
// ——実 DB を読むと期待値が作れない（hn6.2 / hn6.3 と同じ方針）。
//
// 起動しているのは release バイナリ＋使い捨ての空 DB（playwright.config.ts）。

/** ドロワーの項目（docs/specs/16-web-navigation.md §3.3 の8項目。順序も検証に使う） */
const ALL_NAV_LABELS = [
  '今日',
  '履歴',
  'ルーティン',
  'あなた待ち',
  'ハーネス',
  '開発',
  'オフィス',
  'brain',
];

type SummarySeed = {
  source: string;
  open?: Partial<{ approve: number; choose: number; read: number; alert: number }>;
  failed?: number;
};

/** `GET /api/inbox/summary` の最小形（docs/specs/03-api.md §3 の InboxSourceSummaryDto） */
function summaryJson(sources: SummarySeed[]) {
  return {
    sources: sources.map((source) => ({
      source: source.source,
      latestDate: '2026-09-02',
      latestReceivedAt: '2026-09-02T06:20:00+09:00',
      latestItemCount: 0,
      openCount: { approve: 0, choose: 0, read: 0, alert: 0, ...(source.open ?? {}) },
      failedCount: source.failed ?? 0,
    })),
  };
}

type Options = {
  sources?: SummarySeed[];
  /** `/api/inbox/summary` が落ちる（docs/specs/25-web-inbox.md §6） */
  down?: boolean;
};

/** 受信の集計を固定してから任意の画面を開く（バッジは全画面共通シェルに出る） */
async function open(page: Page, path: string, options: Options = {}) {
  await page.route(
    (url) => url.pathname === '/api/inbox/summary',
    (route) =>
      options.down
        ? route.fulfill({ status: 500, json: { error: { code: 'internal', message: 'DB エラー' } } })
        : route.fulfill({ json: summaryJson(options.sources ?? []) }),
  );
  // 名簿（office.json）の配信元は :48310 の夜勤ビューア（docs/specs/20-web-office.md §2）。
  // E2E は release バイナリ単体で回すので**空を返す**——バッジは名簿に依存しないが、
  // 開発機で常駐していると「今日」画面の未着行が実データで変わる（スクショが安定しない）
  await page.route('**/office.json', (route) =>
    route.fulfill({ json: { generated_at: null, window_days: 14, employees: [], runs: [] } }),
  );
  await page.goto(path);
}

async function openDrawer(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'メニュー', exact: true }).click();
  const drawer = page.getByRole('navigation', { name: 'ナビゲーション' });
  await expect(drawer).toBeVisible();
  return drawer;
}

/** バッジ本体（§3.5）。「あなた待ち」以外には出ないので、画面に1つだけのはず */
const badge = (page: Page) => page.locator('.drawer__badge');

// ---- バッジの件数（§3.5「未決の総件数」） ----

test('「あなた待ち」に未決の総件数がバッジで出る（kind と送信元をまたいで合計する）', async ({
  page,
}) => {
  // 2送信元 × 4 kind にまたがる未決（2+1 と 4+1）。ドロワーは内訳を持たず総件数だけを出す
  await open(page, '/', {
    sources: [
      { source: 'night-harness', open: { approve: 2, choose: 1 } },
      { source: 'routine_watchdog', open: { read: 4, alert: 1 } },
    ],
  });

  const drawer = await openDrawer(page);
  await expect(badge(page)).toHaveCount(1);
  await expect(badge(page)).toHaveText('8');
  // 押す操作を持たない合図なので role=img で出す（ヘッダの赤点と同じ様式・§3.1 の実装）
  await expect(page.getByRole('img', { name: '未決 8 件' })).toBeVisible();

  // バッジが付くのは「あなた待ち」の項目だけ（他の7項目には出ない）
  const rows = drawer.locator('.drawer__row');
  await expect(rows).toHaveCount(1);
  await expect(rows.getByRole('link')).toHaveText(['あなた待ち']);

  // 項目の文言と並びは変わらない（§3.5「他の項目は無変更」。「ハーネス」も残す）
  await expect(drawer.getByRole('link')).toHaveText(ALL_NAV_LABELS);
  await expect(drawer.getByRole('link', { name: 'あなた待ち', exact: true })).toHaveCount(1);
  await expect(drawer.getByRole('link', { name: 'ハーネス', exact: true })).toHaveCount(1);

  // ドロワーは position:fixed なので、fullPage ではなくビューポートで撮る（縦一杯に写る）
  await page.screenshot({ path: 'test-results/screens/cerebellum-hn6.4-drawer.png' });
});

test('バッジは全画面共通のシェルに出る（「今日」以外の画面でも同じ件数）', async ({ page }) => {
  await open(page, '/routines', { sources: [{ source: 'night-harness', open: { alert: 3 } }] });

  await openDrawer(page);
  await expect(badge(page)).toHaveText('3');
});

// ---- 0 件で非表示（§3.5「0 は出さない」） ----

test('未決が0件ならバッジは出ない（項目そのものは残る）', async ({ page }) => {
  // 受信はあるが未決は全 kind 0（片付け済み）。failedCount はバッジの対象ではない
  await open(page, '/', {
    sources: [
      { source: 'night-harness', open: { approve: 0, choose: 0, read: 0, alert: 0 }, failed: 1 },
      { source: 'routine_watchdog' },
    ],
  });

  const drawer = await openDrawer(page);
  await expect(badge(page)).toHaveCount(0);
  // 0 件で消えるのはバッジだけ——項目は常設（docs/specs/16-web-navigation.md §3.3）
  await expect(drawer.getByRole('link', { name: 'あなた待ち', exact: true })).toBeVisible();
  await expect(drawer.getByRole('link')).toHaveText(ALL_NAV_LABELS);
});

test('受信が1件も無いときもバッジは出ない', async ({ page }) => {
  await open(page, '/', { sources: [] });

  await openDrawer(page);
  await expect(badge(page)).toHaveCount(0);
});

test('件数が取れないときはバッジを出さない（0 と嘘の件数のどちらも出さない）', async ({
  page,
}) => {
  await open(page, '/', { down: true });

  const drawer = await openDrawer(page);
  await expect(badge(page)).toHaveCount(0);
  // ナビゲーションは API に依存しない（取得の失敗でドロワーが壊れない）
  await expect(drawer.getByRole('link')).toHaveText(ALL_NAV_LABELS);
});

// ---- バッジが導線を塞がないこと（§4 のタップターゲット 44px） ----

test('バッジが出ていても項目タップで「あなた待ち」へ遷移する', async ({ page }) => {
  await page.route(
    (url) => url.pathname === '/api/inbox/items',
    (route) => route.fulfill({ json: { items: [] } }),
  );
  await open(page, '/', { sources: [{ source: 'night-harness', open: { approve: 5 } }] });

  const drawer = await openDrawer(page);
  const link = drawer.getByRole('link', { name: 'あなた待ち', exact: true });
  await expect(badge(page)).toHaveText('5');

  // **バッジの真上**をタップする（重ねた表示がタップを奪っていないことの確認）
  const box = await link.boundingBox();
  expect(box).not.toBeNull();
  await link.click({ position: { x: (box?.width ?? 0) - 20, y: (box?.height ?? 0) / 2 } });

  await page.waitForURL((url) => url.pathname.replace(/\/+$/, '') === '/waiting');
  await expect(page.getByRole('heading', { name: 'あなた待ち' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'ナビゲーション' })).toBeHidden();
});
