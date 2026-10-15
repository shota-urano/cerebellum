import { expect, test, type Page } from '@playwright/test';

// 今日画面 → sharpen の単語帳への導線（detailRef = vocab.app）
//
// 受け入れ基準（docs/specs/02-data-model.md §6 ／ docs/specs/12-web-digest.md §3.1）:
//   - 面（内容・メタ・シェブロン）は http://{表示中のホスト名}:48330/ を同じタブで開く
//   - チェックリングはトグルだけで、遷移しない
//
// 日次 API の応答だけを固定する理由は cerebellum-c32.1.spec.ts と同じ（今日のスナップショットは
// 全 spec で共有され、ルーティン追加が入るかが実行順に依存する）。
// 単語帳（:48330）は外部アプリなので、E2E では実物に届かせず route で受けて遷移だけを確かめる。

const VOCAB_TASK_ID = '5e2c8a1f9b30';
const VOCAB_CONTENT = '英単語';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

function dayBody(doneTaskId: string | null) {
  const now = new Date();
  return {
    date: now.toLocaleDateString('sv-SE'),
    weekday: WEEKDAYS[now.getDay()],
    readonly: false,
    progress: { done: doneTaskId ? 1 : 0, total: 1 },
    tasks: [
      {
        id: VOCAB_TASK_ID,
        time: '7:00',
        effort: '10分',
        tool: 'sharpen',
        content: VOCAB_CONTENT,
        done: VOCAB_TASK_ID === doneTaskId,
        checkedAt: VOCAB_TASK_ID === doneTaskId ? now.toISOString() : null,
        detailRef: 'vocab.app',
      },
    ],
  };
}

async function stubToday(page: Page) {
  const checkedIds: string[] = [];
  await page.route('**/api/days/today', (route) => route.fulfill({ json: dayBody(null) }));
  await page.route('**/api/days/today/checks/*', async (route) => {
    const taskId = decodeURIComponent(new URL(route.request().url()).pathname.split('/').pop() ?? '');
    checkedIds.push(taskId);
    await route.fulfill({ json: dayBody(taskId) });
  });
  return checkedIds;
}

test('vocab.app の行は面をタップすると同じホストの :48330 を同じタブで開く', async ({ page }) => {
  const checkedIds = await stubToday(page);
  await page.goto('/');
  const host = new URL(page.url()).hostname;
  const expected = `http://${host}:48330/`;

  // 単語帳の実物には届かせない
  await page.route(`http://${host}:48330/**`, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<title>vocab stub</title>' }),
  );

  const link = page.getByRole('link', { name: VOCAB_CONTENT + ' の詳細を開く' });
  await expect(link).toHaveAttribute('href', expected);
  await expect(link).not.toHaveAttribute('target', /.+/);

  await link.click();
  await page.waitForURL(expected);
  await expect(page).toHaveTitle('vocab stub');

  // 遷移はトグルを兼ねない
  expect(checkedIds).toEqual([]);
});

test('vocab.app の行のリングはトグルだけで、遷移しない', async ({ page }) => {
  const checkedIds = await stubToday(page);
  await page.goto('/');

  const ring = page.getByRole('button', { name: VOCAB_CONTENT + ' のチェックを切り替える' });
  await expect(ring).toHaveAttribute('aria-pressed', 'false');

  const checked = page.waitForResponse((res) => res.url().includes('/api/days/today/checks/'));
  await ring.click();
  await checked;

  await expect(ring).toHaveAttribute('aria-pressed', 'true');
  expect(new URL(page.url()).port).not.toBe('48330');
  expect(checkedIds).toEqual([VOCAB_TASK_ID]);
});
