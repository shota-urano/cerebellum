import { expect, test } from '@playwright/test';

// harness-kit スモーク: 「起動して描画される」「console エラーが無い」の2点だけ見る。
// 機能テストはタスクごとに `e2e/<task-id>.spec.ts` で書く（dev-loop 手順3の規約。
// ファイル名を固定するのは、録画をタスクへ紐づけるキーになるため）。
//
// 起動しているのは release バイナリ＋使い捨ての空 DB なので、ルーティン0件の状態が正。
// 「空でも壊れない」ことの確認を兼ねる。

const SCREENS = [
  { path: '/', name: 'today', label: '今日' },
  { path: '/history', name: 'history', label: '履歴' },
  { path: '/routines', name: 'routines', label: 'ルーティン' },
];

for (const screen of SCREENS) {
  test(`smoke: ${screen.label}画面が描画されコンソールエラーが無い`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });

    await page.goto(screen.path);
    await expect(page.locator('body')).not.toBeEmpty();

    // 夜勤ビューア用のスクショ。expect より前に撮る——失敗時こそ「どう壊れたか」が要る
    await page.screenshot({ path: `test-results/screens/smoke-${screen.name}.png`, fullPage: true });

    expect(errors).toEqual([]);
  });
}
