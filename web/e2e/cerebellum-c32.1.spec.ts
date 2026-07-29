import { expect, test, type Page } from '@playwright/test';

// cerebellum-c32.1 [Frontend] 今日画面 → 学習セッションへの導線（detailRef = learning.session）
//
// 受け入れ基準（docs/specs/15-web-learning.md §2 ／ docs/specs/12-web-digest.md §3.1）:
//   detailRef を持つ行はタップ領域が2つに割れる。
//   - チェックリング                      → チェックのトグル（遷移しない）
//   - それ以外の面（内容・メタ・シェブロン） → /learning?date=&taskId= へ遷移
//
// なぜ日次 API の応答だけ固定するか（サーバは本物の release バイナリのまま）:
//   「今日」のスナップショットは最初の GET /api/days/today で確定し、以後は不変
//   （docs/specs/02-data-model.md §4・AGENTS.md ルール3）。E2E は release バイナリ＋
//   使い捨て DB を**全 spec で共有**し、他の spec も `/` を開く（＝空のスナップショットを
//   確定させる）ため、ルーティン API に detail_ref 付きの行を足しても、今日の確定済み
//   スナップショットには入らない——入るかどうかが spec の実行順に依存する（flaky）。
//   ここで検証したいのは TaskRow の分岐そのものなので、日次 API の応答だけを固定し、
//   描画・タップ分割・遷移は実物のページで確かめる。

/** task_id は sha1 先頭12桁（docs/specs/02-data-model.md §3） */
const LEARNING_TASK_ID = '3f9a1c7b2e04';
const PLAIN_TASK_ID = 'b71d0a4c6e28';

const LEARNING_CONTENT = '40_Projectsにて新たな学習';
const PLAIN_CONTENT = '筋トレ';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

/** 静的 export の遷移先は末尾スラッシュが付き得るので、比較前に落とす */
const pathnameOf = (url: string) => new URL(url).pathname.replace(/\/+$/, '') || '/';

/** `GET /api/days/today` / `POST .../checks/{taskId}` の応答（docs/specs/03-api.md §3） */
function dayBody(doneTaskId: string | null) {
  const now = new Date();
  const iso = now.toLocaleDateString('sv-SE'); // ローカルタイムの YYYY-MM-DD
  const task = (id: string, time: string, effort: string, tool: string, content: string, detailRef: string | null) => ({
    id,
    time,
    effort,
    tool,
    content,
    done: id === doneTaskId,
    checkedAt: id === doneTaskId ? now.toISOString() : null,
    detailRef,
  });

  return {
    date: iso,
    weekday: WEEKDAYS[now.getDay()],
    readonly: false,
    progress: { done: doneTaskId ? 1 : 0, total: 2 },
    tasks: [
      task(LEARNING_TASK_ID, '9:00', '30分', 'cerebellum', LEARNING_CONTENT, 'learning.session'),
      task(PLAIN_TASK_ID, '19:00', '20分', '-', PLAIN_CONTENT, null),
    ],
  };
}

/**
 * 今日の日次 API を固定応答にする。チェックの POST は呼ばれた taskId を記録したうえで、
 * 本物と同じく「トグル後のその日」を返す。
 */
async function stubToday(page: Page) {
  const checkedIds: string[] = [];

  await page.route('**/api/days/today', async (route) => {
    await route.fulfill({ json: dayBody(null) });
  });

  await page.route('**/api/days/today/checks/*', async (route) => {
    const taskId = decodeURIComponent(new URL(route.request().url()).pathname.split('/').pop() ?? '');
    checkedIds.push(taskId);
    await route.fulfill({ json: dayBody(taskId) });
  });

  return checkedIds;
}

test('learning.session の行は面をタップすると /learning へ遷移する', async ({ page }) => {
  const checkedIds = await stubToday(page);

  // 開始地点は「今日」画面（遷移先の /learning とは別の画面）
  await page.goto('/');
  expect(pathnameOf(page.url())).toBe('/');

  const link = page.getByRole('link', { name: LEARNING_CONTENT + ' の詳細を開く' });
  await expect(link).toBeVisible();
  await link.click();

  await page.waitForURL((url) => pathnameOf(url.toString()) === '/learning');

  // docs/specs/15-web-learning.md §2: /learning?date=&taskId=
  const params = new URL(page.url()).searchParams;
  expect(params.get('date')).toBe('today');
  expect(params.get('taskId')).toBe(LEARNING_TASK_ID);

  // 遷移はトグルを兼ねない（面タップで消し込まれると、読む前に記録が確定してしまう）
  expect(checkedIds).toEqual([]);
});

test('learning.session の行のリングはトグルだけで、遷移しない', async ({ page }) => {
  const checkedIds = await stubToday(page);

  await page.goto('/');

  const ring = page.getByRole('button', { name: LEARNING_CONTENT + ' のチェックを切り替える' });
  await expect(ring).toHaveAttribute('aria-pressed', 'false');

  const checked = page.waitForResponse((res) => res.url().includes('/api/days/today/checks/'));
  await ring.click();
  await checked;

  // トグルされ（optimistic → POST 応答）、「今日」画面に留まる
  await expect(ring).toHaveAttribute('aria-pressed', 'true');
  expect(pathnameOf(page.url())).toBe('/');
  expect(checkedIds).toEqual([LEARNING_TASK_ID]);
});

test('detailRef を持たない行は従来どおり行全体がトグル（遷移面を持たない）', async ({ page }) => {
  const checkedIds = await stubToday(page);

  await page.goto('/');

  // 詳細リンクが無い行にはリンクが無い（docs/specs/12-web-digest.md §3.1-4）
  await expect(page.getByRole('link', { name: PLAIN_CONTENT + ' の詳細を開く' })).toHaveCount(0);

  const row = page.getByRole('button', { name: PLAIN_CONTENT });
  await expect(row).toHaveAttribute('aria-pressed', 'false');

  const checked = page.waitForResponse((res) => res.url().includes('/api/days/today/checks/'));
  await row.click();
  await checked;

  await expect(row).toHaveAttribute('aria-pressed', 'true');
  expect(pathnameOf(page.url())).toBe('/');
  expect(checkedIds).toEqual([PLAIN_TASK_ID]);
});
