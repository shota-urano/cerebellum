import { expect, test, type Page } from '@playwright/test';

// cerebellum-am7 [Frontend] ドロワーに「あなた待ち」項目を追加
// 受け入れ基準（docs/specs/23-web-waiting.md §2・docs/specs/16-web-navigation.md §3）:
//   ドロワーの「あなた待ち」タップ → `/waiting` 遷移 / `/waiting` にいるときアクティブ表示
//
// 「あなた待ち」はハーネスと同じく「読む系の詳細ビューはドロワーに入れない」
// （docs/specs/16 §3.6）の**例外**。毎朝の承認操作なので常設ナビから入れる。承認2画面は隣に並べる。
//
// 起動しているのは release バイナリ＋使い捨ての空 DB（playwright.config.ts）。ナビゲーションは
// API に依存しないので、候補データ0件（未着の赤帯が出る状態）のままで検証できる。

/** 静的 export の遷移先は末尾スラッシュが付き得るので、比較前に落とす */
const pathnameOf = (url: string) => new URL(url).pathname.replace(/\/+$/, '') || '/';

const openDrawer = async (page: Page) => {
  await page.getByRole('button', { name: 'メニュー', exact: true }).click();
  const drawer = page.getByRole('navigation', { name: 'ナビゲーション' });
  await expect(drawer).toBeVisible();
  return drawer;
};

test('ドロワーの「あなた待ち」から /waiting へ遷移する', async ({ page }) => {
  // 開始地点は遷移先と別の画面にする（同じ画面から始めると、リンクが死んでいても
  // 「遷移先にいる」が成立してしまい、遷移を検証したことにならない）
  await page.goto('/');
  expect(pathnameOf(page.url())).toBe('/');

  const drawer = await openDrawer(page);
  await drawer.getByRole('link', { name: 'あなた待ち', exact: true }).click();

  // 遷移してドロワーが閉じる（docs/specs/16 §3.4）
  await page.waitForURL((url) => pathnameOf(url.toString()) === '/waiting');
  await expect(page.getByRole('navigation', { name: 'ナビゲーション' })).toBeHidden();

  // 遷移先が「あなた待ち」画面であること（docs/specs/23 §3 の見出し）
  await expect(page.getByRole('heading', { name: 'あなた待ち' })).toBeVisible();
});

test('/waiting にいるとき、ドロワーの「あなた待ち」がアクティブ表示になる', async ({ page }) => {
  await page.goto('/waiting');

  const drawer = await openDrawer(page);
  const waiting = drawer.getByRole('link', { name: 'あなた待ち', exact: true });
  await expect(waiting).toHaveAttribute('aria-current', 'page');
  await expect(waiting).toHaveClass(/drawer__item--active/);

  // 他項目はアクティブにならない（判定はパス前方一致・`/` のみ完全一致。docs/specs/16 §3.5）。
  // 隣に並ぶ「ハーネス」を必ず含める——承認2画面が同時に光ると現在地の意味が消える
  for (const label of ['今日', '履歴', 'ルーティン', 'ハーネス', '開発', 'オフィス']) {
    const other = drawer.getByRole('link', { name: label, exact: true });
    await expect(other).not.toHaveAttribute('aria-current', 'page');
    await expect(other).not.toHaveClass(/drawer__item--active/);
  }
});
