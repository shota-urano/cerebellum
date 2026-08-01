import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';

// cerebellum-3f2.1 [Frontend] ルーティン一覧行と編集フォームヘッダへの `#{id}` 表示
//
// 受け入れ基準（docs/specs/10-web-routines.md §3.1-3・§3.2-2・§4）:
//   - 一覧の各行に `#{id}` が控えめに表示される（実際の `routines.id` と一致すること）
//   - 行タップで開く編集フォームのヘッダに、その行と同じ `#{id}` が出る
//   - 新規追加フォームには `#{id}` が出ない
//   - `#{id}` は表示専用（ソート・検索・リンク等を持たない → §4）
//
// データは実 API（`POST /api/routines`・docs/specs/03-api.md §3）で投入する。起動しているのは
// release バイナリ＋使い捨ての空 DB（playwright.config.ts）なので本番 DB には触らない。
// 投入するのはこの spec だけ（他 spec は routines を書き換えない）。行を作るテストを1本に
// まとめ、もう1本は行に依存しない検証だけにして、fullyParallel でも期待値がぶれないようにする。

/** `POST /api/routines` の body（docs/specs/03-api.md §3）。`interval`+`time`+`content` は有効行内で一意 */
const SEEDS = [
  { interval: '毎日', time: '7:30', effort: '10分', tool: 'slack', content: '3f2.1 つながり発見' },
  { interval: '平日', time: '9:00', effort: '', tool: '-', content: '3f2.1 朝の棚卸し' },
  { interval: '週末', time: '', effort: '1時間', tool: 'obsidian', content: '3f2.1 週次レビュー' },
];

type Seeded = { id: number; content: string };

async function seedRoutines(request: APIRequestContext): Promise<Seeded[]> {
  const created: Seeded[] = [];
  for (const seed of SEEDS) {
    const res = await request.post('/api/routines', { data: seed });
    expect(res.status(), await res.text()).toBe(200);
    const { routine } = await res.json();
    created.push({ id: routine.id, content: routine.content });
  }
  return created;
}

/** 一覧行（`.row--tap`）を内容で掴む */
const rowOf = (page: Page, content: string): Locator =>
  page.locator('.row--tap').filter({ hasText: content });

/** フォーム本体（`.panel.form`）。ヘッダの `#{id}` はこの中を見る */
const form = (page: Page): Locator => page.locator('.form');

test('一覧の各行に実際の #{id} が出て、行タップで開く編集フォームのヘッダに同じ #{id} が出る', async ({
  page,
  request,
}) => {
  const seeded = await seedRoutines(request);

  await page.goto('/routines');

  // --- 一覧: 各行の `#{id}` が API の返した id と一致する（§3.1-3）
  for (const routine of seeded) {
    const row = rowOf(page, routine.content);
    await expect(row).toBeVisible();
    await expect(row.locator('.rt__id')).toHaveText('#' + routine.id);
  }

  // 「#」があるだけで済ませない: 一覧に出ている行はすべて `#<数値>` を1つ持つ（＝行に漏れがない）
  const rows = await page.locator('.row--tap').all();
  expect(rows.length).toBeGreaterThanOrEqual(seeded.length);
  for (const row of rows) {
    const ids = row.locator('.rt__id');
    await expect(ids).toHaveCount(1);
    await expect(ids).toHaveText(/^#\d+$/);
  }

  // 表示専用（§4）: 参照番号自体はリンクでもボタンでもない
  await expect(page.locator('.rt__id a, .rt__id button, a.rt__id, button.rt__id')).toHaveCount(0);

  await page.screenshot({ path: 'test-results/screens/3f2.1-list.png', fullPage: true });

  // --- 行タップ → 編集フォームのヘッダに同じ `#{id}`（§3.2-2）
  for (const routine of seeded) {
    await rowOf(page, routine.content).click();

    await expect(form(page)).toBeVisible();
    await expect(form(page).locator('.label').first()).toContainText('EDIT ROUTINE');
    await expect(form(page).locator('.rt__id')).toHaveText('#' + routine.id);
    // 開いているのは確かにその行（現在値が入っている・§3.2-2）
    await expect(page.getByLabel('内容')).toHaveValue(routine.content);

    if (routine === seeded[0]) {
      await page.screenshot({ path: 'test-results/screens/3f2.1-form.png', fullPage: true });
    }

    await page.getByRole('button', { name: 'キャンセル' }).click();
    await expect(form(page)).toHaveCount(0);
  }
});

test('新規追加フォームのヘッダには #{id} が出ない', async ({ page }) => {
  await page.goto('/routines');

  await page.getByRole('button', { name: '＋ 追加' }).click();

  await expect(form(page)).toBeVisible();
  await expect(form(page).locator('.label').first()).toHaveText('NEW ROUTINE');
  // 新規追加には参照番号そのものが存在しない（§3.2-2）
  await expect(form(page).locator('.rt__id')).toHaveCount(0);
  await expect(form(page)).not.toContainText('#');
});
