import { expect, test, type Page } from '@playwright/test';

// cerebellum-5cl.2 [Frontend] 「開発」画面（/dev 一覧＋ ?run= 詳細）とドロワー項目変更
// 受け入れ基準（docs/specs/19-web-dev-history.md §3・docs/specs/16-web-navigation.md §3）:
//   ドロワーに「開発」があり ダイジェスト・夜勤・学習が無い / 一覧が新しい順（返却順）に出る
//   （夜勤🌙・手動🔧 バッジ含む）/ 行タップで詳細（PR ボタン・動画枠）/ ブラウザバックで一覧へ
//
// runs.json は夜勤ビューア（:48310）が配信する外部データなので、**page.route でフィクスチャに
// 差し替えて**検証する。実サーバの起動状態やその日の run 内容にテストを依存させない
// （依存させると、夜勤を回していない日は必ず落ちる＝ false-gate になる）。

/** 夜勤ビューアの runs.json（新しい順。並びはサーバー返却順のまま使われるのが仕様・§3.1） */
const RUNS = {
  runs: [
    {
      pj: 'cerebellum',
      run_id: '2026-07-29-2',
      source: 'manual', // 人間が日中に手で回した分
      passed: 3,
      failed: 1,
      blocked: 0,
      human: 0,
      pr_url: 'https://example.invalid/pr/2',
      videos: ['cerebellum-5cl.2-dev-開発画面の一覧と詳細.mp4'],
      artifact_missing: 0,
      href: 'cerebellum/2026-07-29-2/',
    },
    {
      pj: 'cerebellum',
      run_id: '2026-07-29-1',
      source: 'night-shift',
      passed: 2,
      failed: 0,
      blocked: 0,
      human: 0,
      pr_url: 'https://example.invalid/pr/1',
      videos: ['cerebellum-5cl.1-ns-夜勤ビューの表示.mp4'],
      artifact_missing: 0,
      href: 'cerebellum/2026-07-29-1/',
    },
    {
      // source 無記載の旧データ＝夜勤扱い（docs/specs/19 §2）
      pj: 'second-brain',
      run_id: '2026-07-28-1',
      passed: 0,
      failed: 0,
      blocked: 2,
      human: 0,
      pr_url: null,
      videos: [],
      href: 'second-brain/2026-07-28-1/',
    },
  ],
};

/**
 * runs.json をフィクスチャに差し替える。http（:48310 直）でも https（`/loop-reports` の
 * path マウント）でも同じ1本で捕まえる（接続規則は docs/specs/13 §4）。
 */
async function mockRuns(page: Page, body: unknown = RUNS) {
  await page.route('**/runs.json', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) }),
  );
}

/** 静的 export の遷移先は末尾スラッシュが付き得るので、比較前に落とす */
const pathnameOf = (url: string) => new URL(url).pathname.replace(/\/+$/, '') || '/';

const openDrawer = async (page: Page) => {
  await page.getByRole('button', { name: 'メニュー', exact: true }).click();
  const drawer = page.getByRole('navigation', { name: 'ナビゲーション' });
  await expect(drawer).toBeVisible();
  return drawer;
};

test('ドロワーは 今日・履歴・ルーティン・ハーネス・開発 の5項目で、ダイジェスト・夜勤・学習は無い', async ({
  page,
}) => {
  await mockRuns(page);
  await page.goto('/');

  const drawer = await openDrawer(page);
  // 完全一致で並びごと固定する（余計な項目が増えたらここで落ちる）
  // 「ハーネス」は docs/specs/18-web-harness.md の実装で追加（docs/specs/16 §3.3）
  await expect(drawer.getByRole('link')).toHaveText([
    '今日',
    '履歴',
    'ルーティン',
    'ハーネス',
    '開発',
  ]);
  // 読む系のタスク起点詳細ビューは常設ナビに置かない（docs/specs/16 §3.6）。
  // ハーネスだけが例外として常設される——という仕様の主張をここで守る
  await expect(drawer.getByRole('link', { name: 'ダイジェスト', exact: true })).toHaveCount(0);
  await expect(drawer.getByRole('link', { name: '夜勤', exact: true })).toHaveCount(0);
  await expect(drawer.getByRole('link', { name: '学習', exact: true })).toHaveCount(0);
});

test('ドロワーの「開発」から /dev へ遷移し、run 一覧が返却順（新しい順）でバッジ付きで出る', async ({ page }) => {
  await mockRuns(page);
  // 開始地点は遷移先と別の画面にする（同じ画面から始めるとリンクが死んでいても成立してしまう）
  await page.goto('/history');
  expect(pathnameOf(page.url())).toBe('/history');

  const drawer = await openDrawer(page);
  await drawer.getByRole('link', { name: '開発', exact: true }).click();
  await page.waitForURL((url) => pathnameOf(url.toString()) === '/dev');

  const rows = page.locator('.row');
  await expect(rows).toHaveCount(3);

  // 並びは runs.json の返却順のまま（クライアントで再ソートしない・§3.1-1）
  await expect(rows.nth(0)).toContainText('2026-07-29-2');
  await expect(rows.nth(1)).toContainText('2026-07-29-1');
  await expect(rows.nth(2)).toContainText('2026-07-28-1');

  // 1行の中身: PJ 名・夜勤/手動バッジ・完了/失敗/blocked 数（§3.1-2）
  await expect(rows.nth(0)).toContainText('cerebellum');
  await expect(rows.nth(0)).toContainText('🔧 手動');
  await expect(rows.nth(0)).toContainText('完了 3');
  await expect(rows.nth(1)).toContainText('🌙 夜勤');
  // source 無記載の旧データも夜勤扱い（§2）
  await expect(rows.nth(2)).toContainText('second-brain');
  await expect(rows.nth(2)).toContainText('🌙 夜勤');

  // 失敗・blocked が 0 でない行は目立たせる（0 の行は通常表示のまま）
  await expect(rows.nth(0).locator('.dev__bad')).toHaveText(['失敗 1']);
  await expect(rows.nth(1).locator('.dev__bad')).toHaveCount(0);
  await expect(rows.nth(2).locator('.dev__bad')).toHaveText(['blocked 2']);
});

test('行タップで run 詳細（PR ボタン・動画枠）が出て、ブラウザバックで一覧へ戻る', async ({ page }) => {
  await mockRuns(page);
  // 開始地点は /dev ではなく別画面にする（一覧→詳細→戻る の往復を通しで見る）
  await page.goto('/history');
  const drawer = await openDrawer(page);
  await drawer.getByRole('link', { name: '開発', exact: true }).click();
  await page.waitForURL((url) => pathnameOf(url.toString()) === '/dev');

  await page.locator('.row').nth(1).click();

  // ?run={pj}/{run_id} 付きの URL へ遷移している（§3.1-3）
  await page.waitForURL((url) => url.searchParams.get('run') === 'cerebellum/2026-07-29-1');

  // 夜勤ビューと同じカード: 見出し・メタ行・PR ボタン・検証動画（§3.2）
  await expect(page.getByRole('heading', { name: '🌙 夜勤 — cerebellum' })).toBeVisible();
  await expect(page.getByText('完了 2 · 失敗 0 · blocked 0')).toBeVisible();
  const pr = page.getByRole('link', { name: 'PR を開く（マージはここから）' });
  await expect(pr).toBeVisible();
  await expect(pr).toHaveAttribute('href', 'https://example.invalid/pr/1');
  await expect(page.locator('.ns__video video')).toHaveCount(1);
  // 動画の表示名は先頭の ASCII トークンを落として検証内容だけ（docs/specs/13 §3.3）
  await expect(page.locator('.ns__video figcaption')).toHaveText(['夜勤ビューの表示']);

  // 夜勤ビューとの差分: 「確認した」チェックは無い（タスクではない・§3.2）
  await expect(page.getByRole('button', { name: /確認した/ })).toHaveCount(0);

  // ブラウザバックで一覧へ戻る
  await page.goBack();
  await page.waitForURL((url) => url.searchParams.get('run') === null);
  expect(pathnameOf(page.url())).toBe('/dev');
  await expect(page.locator('.row')).toHaveCount(3);
});

test('見つからない ?run= は「この run は見つかりません」＋一覧へ戻る導線', async ({ page }) => {
  await mockRuns(page);
  await page.goto('/dev?run=' + encodeURIComponent('nope/2000-01-01-1'));

  await expect(page.getByText('この run は見つかりません')).toBeVisible();

  await page.getByRole('link', { name: '◀ 一覧へ' }).click();
  await page.waitForURL((url) => url.searchParams.get('run') === null);
  await expect(page.locator('.row')).toHaveCount(3);
});

test('run が0件なら空状態（エラーにしない）', async ({ page }) => {
  await mockRuns(page, { runs: [] });
  await page.goto('/dev');

  await expect(page.getByText('実行履歴はありません')).toBeVisible();
  // 0件はエラーにしない（§6）。ErrorBanner（`.banner`）で判定する——`role="alert"` は
  // Next.js の route announcer（シェル外の隠し要素）も名乗るので当てにできない
  await expect(page.locator('.banner')).toHaveCount(0);
});
