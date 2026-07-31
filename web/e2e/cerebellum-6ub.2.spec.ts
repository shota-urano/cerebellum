import { expect, test, type Page } from '@playwright/test';

// cerebellum-6ub.2 [Frontend] ドロワーに「ハーネス」項目を追加
// 受け入れ基準（docs/specs/18-web-harness.md §2・docs/specs/16-web-navigation.md §3）:
//   ドロワーの「ハーネス」タップ → `/harness` 遷移 / `/harness` にいるときアクティブ表示
//
// ハーネスは「読む系の詳細ビューはドロワーに入れない」（docs/specs/16 §3.6）の**例外**として
// 常設される項目。毎朝の承認操作なので、タスク行の detailRef 導線と並んで常設ナビからも入れる。
//
// 起動しているのは release バイナリ＋使い捨ての空 DB（playwright.config.ts）。ナビゲーションは
// API に依存しないので、提案データ0件（未着の赤帯が出る状態）のままで検証できる。

/** 静的 export の遷移先は末尾スラッシュが付き得るので、比較前に落とす */
const pathnameOf = (url: string) => new URL(url).pathname.replace(/\/+$/, '') || '/';

const openDrawer = async (page: Page) => {
  await page.getByRole('button', { name: 'メニュー', exact: true }).click();
  const drawer = page.getByRole('navigation', { name: 'ナビゲーション' });
  await expect(drawer).toBeVisible();
  return drawer;
};

test('ドロワーの「ハーネス」から /harness へ遷移する', async ({ page }) => {
  // 開始地点は遷移先と別の画面にする（同じ画面から始めると、リンクが死んでいても
  // 「遷移先にいる」が成立してしまい、遷移を検証したことにならない）
  await page.goto('/');
  expect(pathnameOf(page.url())).toBe('/');

  const drawer = await openDrawer(page);
  await drawer.getByRole('link', { name: 'ハーネス', exact: true }).click();

  // 遷移してドロワーが閉じる（docs/specs/16 §3.4）
  await page.waitForURL((url) => pathnameOf(url.toString()) === '/harness');
  await expect(page.getByRole('navigation', { name: 'ナビゲーション' })).toBeHidden();

  // 遷移先がハーネス承認ビューであること（docs/specs/18 §3 の見出し）
  await expect(page.getByRole('heading', { name: /^ハーネス取り込み — / })).toBeVisible();
});

test('/harness にいるとき、ドロワーの「ハーネス」がアクティブ表示になる', async ({ page }) => {
  await page.goto('/harness');

  const drawer = await openDrawer(page);
  const harness = drawer.getByRole('link', { name: 'ハーネス', exact: true });
  await expect(harness).toHaveAttribute('aria-current', 'page');
  await expect(harness).toHaveClass(/drawer__item--active/);

  // 他項目はアクティブにならない（判定はパス前方一致・`/` のみ完全一致。docs/specs/16 §3.5）
  for (const label of ['今日', '履歴', 'ルーティン', '開発']) {
    const other = drawer.getByRole('link', { name: label, exact: true });
    await expect(other).not.toHaveAttribute('aria-current', 'page');
    await expect(other).not.toHaveClass(/drawer__item--active/);
  }
});

test('クエリパラメータ付き（/harness?date=...）でもアクティブ判定は効く', async ({ page }) => {
  // detailRef 導線は `/harness?date=YYYY-MM-DD&taskId=...` で来る（docs/specs/18 §2）。
  // 前方一致判定なので、その経路で開いてもドロワーの現在地表示は正しくなる
  await page.goto('/harness?date=2026-07-30&taskId=999');

  const drawer = await openDrawer(page);
  await expect(drawer.getByRole('link', { name: 'ハーネス', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
});
