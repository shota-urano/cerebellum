import { expect, test } from '@playwright/test';

// cerebellum-6b0.1 [Frontend] TabBar 廃止・ヘッダーのハンバーガー＋ドロワー
// 受け入れ基準（docs/specs/16-web-navigation.md §3）:
//   開閉 / 各項目への遷移 / 現在画面のアクティブ表示 / バックドロップで閉じる /
//   下部タブバーが存在しないこと
//
// 項目リストは 2026-07-29 夕方改訂で 5項目 → 4項目（ダイジェスト・夜勤を撤去し「開発」を追加）、
// その後 docs/specs/18-web-harness.md の実装で「ハーネス」が加わり5項目、
// 外部の脳ビュー「brain」と常設の「オフィス」が加わり7項目（docs/specs/16 §3.3）。
// 項目そのものの検証（ハーネスがあること・ダイジェスト/夜勤/学習が無いこと）は
// cerebellum-5cl.2.spec.ts が持つ。
//
// 起動しているのは release バイナリ＋使い捨ての空 DB（playwright.config.ts）。
// ナビゲーションは API に依存しないので、データ0件のままで検証できる。

const NAV_ITEMS = [
  { href: '/', label: '今日' },
  { href: '/history', label: '履歴' },
  { href: '/routines', label: 'ルーティン' },
  { href: '/harness', label: 'ハーネス' },
  { href: '/dev', label: '開発' },
  { href: '/office', label: 'オフィス' },
];

const ALL_NAV_LABELS = [...NAV_ITEMS.map((item) => item.label), 'brain'];

/** 静的 export の遷移先は末尾スラッシュが付き得るので、比較前に落とす */
const pathnameOf = (url: string) => new URL(url).pathname.replace(/\/+$/, '') || '/';

test('ハンバーガーでドロワーが開き、バックドロップタップで閉じる', async ({ page }) => {
  await page.goto('/');

  const drawer = page.getByRole('navigation', { name: 'ナビゲーション' });
  await expect(drawer).toBeHidden();

  await page.getByRole('button', { name: 'メニュー', exact: true }).click();
  await expect(drawer).toBeVisible();

  // 7項目が頻度順に並んでいる（docs/specs/16 §3.3）
  await expect(drawer.getByRole('link')).toHaveText(ALL_NAV_LABELS);

  // バックドロップの中心はドロワーパネル（右から min(280px,82vw)）に覆われるため、
  // モバイル幅ではパネル外の左端を明示的にタップする（人間の「外側タップ」と同じ位置）
  await page
    .getByRole('button', { name: 'メニューを閉じる' })
    .click({ position: { x: 20, y: 400 } });
  await expect(drawer).toBeHidden();
  // 閉じただけで遷移していない
  expect(pathnameOf(page.url())).toBe('/');
});

test('ドロワーの6項目それぞれへ遷移し、遷移先でアクティブ表示になる', async ({ page }) => {
  const openDrawer = async () => {
    await page.getByRole('button', { name: 'メニュー', exact: true }).click();
    const drawer = page.getByRole('navigation', { name: 'ナビゲーション' });
    await expect(drawer).toBeVisible();
    return drawer;
  };

  for (const item of NAV_ITEMS) {
    // 開始地点は必ず遷移先と別の画面にする（同じ画面から始めると、リンクが遷移しなくても
    // 「遷移先にいる」が成立してしまい、遷移を検証したことにならない）
    const from = item.href === '/' ? '/history' : '/';
    await page.goto(from);
    expect(pathnameOf(page.url())).toBe(from);
    const drawer = await openDrawer();
    await drawer.getByRole('link', { name: item.label, exact: true }).click();

    // 遷移してドロワーが閉じる（docs/specs/16 §3.4）
    await page.waitForURL((url) => pathnameOf(url.toString()) === item.href);
    await expect(page.getByRole('navigation', { name: 'ナビゲーション' })).toBeHidden();

    // 現在画面の項目だけがアクティブ（判定はパス前方一致・`/` のみ完全一致。§3.5）
    const reopened = await openDrawer();
    for (const other of NAV_ITEMS) {
      const link = reopened.getByRole('link', { name: other.label, exact: true });
      if (other.href === item.href) {
        await expect(link).toHaveAttribute('aria-current', 'page');
        await expect(link).toHaveClass(/drawer__item--active/);
      } else {
        await expect(link).not.toHaveAttribute('aria-current', 'page');
        await expect(link).not.toHaveClass(/drawer__item--active/);
      }
    }
  }
});

test('brain は同一ホストの外部ポート48320を指し、アクティブ表示を持たない', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'メニュー', exact: true }).click();
  const brain = page.getByRole('navigation', { name: 'ナビゲーション' }).getByRole('link', {
    name: 'brain',
    exact: true,
  });
  await expect(brain).toHaveAttribute('href', 'http://localhost:48320');
  await expect(brain).not.toHaveAttribute('aria-current', 'page');
  await expect(brain).not.toHaveClass(/drawer__item--active/);
});

test('下部タブバーが存在しない', async ({ page }) => {
  for (const item of NAV_ITEMS) {
    await page.goto(item.href);
    await expect(page.locator('.tabs')).toHaveCount(0);
    await expect(page.locator('.tab')).toHaveCount(0);
  }
});
