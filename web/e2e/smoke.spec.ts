import { expect, test } from '@playwright/test';

// harness-kit スモーク: 「起動して描画される」「console エラーが無い」の2点だけ見る。
// 機能テストはタスクごとに `e2e/<task-id>.spec.ts` で書く（dev-loop 手順3の規約。
// ファイル名を固定するのは、録画をタスクへ紐づけるキーになるため）。
//
// 起動しているのは release バイナリ＋使い捨ての空 DB なので、ルーティン0件の状態が正。
// 「空でも壊れない」ことの確認を兼ねる。

// 「無い」が正常な答えになる取得（と、E2E では動いていない外部サーバ）は、ブラウザが
// console に `Failed to load resource` を出す。**JS 側からは消せない行**なので、URL で除く。
// スモークが見たいのは「起動して描画される」「JS が壊れていない」の2点で、
// 仕様上の 404 や tailnet 内の別サーバの不在はそれに当たらない。
//
// - `/api/learning/sets/…` … 未取り込み・未記録は 404 が正常な答え（docs/specs/14-learning.md §6）。
//   「今日」画面は第2段（LEARNING）の状態1行でこれを読む（docs/specs/25-web-inbox.md §3.1）
// - `/office.json` … 配信元は :48310 の夜勤ビューア（docs/specs/20-web-office.md §2）。
//   E2E は release バイナリ単体で回すので存在しない。「今日」画面は第3段の未着判定に使う（同 §3.3）
const EXPECTED_MISSES = ['/api/learning/sets/', '/office.json'];

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
      if (m.type() !== 'error') return;
      const url = m.location().url;
      if (EXPECTED_MISSES.some((path) => url.includes(path))) return;
      errors.push(m.text());
    });

    await page.goto(screen.path);
    await expect(page.locator('body')).not.toBeEmpty();

    // 夜勤ビューア用のスクショ。expect より前に撮る——失敗時こそ「どう壊れたか」が要る
    await page.screenshot({ path: `test-results/screens/smoke-${screen.name}.png`, fullPage: true });

    expect(errors).toEqual([]);
  });
}
