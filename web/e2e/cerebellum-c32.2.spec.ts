import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

// cerebellum-c32.2 [Frontend] 学習セッションビュー本体（docs/specs/15-web-learning.md）
//
// 受け入れ基準:
//   - 一本道の完走: レッスン → 問題 → 回答 → 感想。採点が全問揃うまで「感想へ」は無効。
//     完了で ①result 記録 → ②消し込み → ③完了画面 →「今日へ戻る」（§3.4）
//   - result POST 失敗時はタスクが消し込まれない（§4。記録なしに消し込まれるのが最悪ケース）
//   - セット未取り込みの日は「今日の学習セットはありません…」だけを出す（§4）
//   - 記録済みの日に再訪すると記録内容＋「やり直す」（§4）
//
// データ投入は実 API（`POST /api/learning/sets`）。**日付はテストごとに専有**する
// ——playwright.config.ts が fullyParallel なので、同じ date を複数テストが UPSERT すると
// 期待値が互いに壊れる。
//
// 日次 API（`GET /api/days/{date}`）だけはスタブする。理由は c32.1 の spec と同じで、
// 「今日」のスナップショットは最初の GET で確定し以後不変（docs/specs/02-data-model.md §4・
// AGENTS.md ルール3）＝ 全 spec で共有される使い捨て DB では、消し込み対象のタスクを
// 実データで用意すると実行順に依存して flaky になる。ここで確かめたいのは
// 「記録が成功したときだけ checks を呼ぶか」なので、消し込み対象のタスクだけを固定する。

/** task_id は sha1 先頭12桁（docs/specs/02-data-model.md §3） */
const TASK_ID = '3f9a1c7b2e04';
const TASK_CONTENT = '40_Projectsにて新たな学習';

const THEME = 'SQLite の WAL とロック';

const LESSON_MD = [
  '## WAL とは',
  '',
  'WAL はジャーナルを追記していく方式。',
  '',
  '- 読み取りは書き込みを**ブロックしない**',
  '- 有効化は `PRAGMA journal_mode=WAL`',
  '',
  '```sh',
  "sqlite3 cerebellum.db 'PRAGMA journal_mode=WAL;'",
  '```',
].join('\n');

const Q1_TEXT = 'WAL で checkpoint が走るのはどんなとき？';
const A1_TEXT = 'WAL ファイルが閾値を超えたとき。';
const Q2_TEXT = 'journal_mode を切り替えるスクリプトを書け。';
const A2_TEXT = 'PRAGMA を実行して戻り値を確認する。';
const WORKDIR = '/Users/orion/workspace/learning/wal/p2';

/** 静的 export の遷移先は末尾スラッシュが付き得るので、比較前に落とす */
const pathnameOf = (url: string) => new URL(url).pathname.replace(/\/+$/, '') || '/';

/** `POST /api/learning/sets` の body（docs/specs/03-api.md §3） */
function setBody(date: string) {
  return {
    date,
    theme: THEME,
    source: 'theme',
    lessonMd: LESSON_MD,
    problems: [
      { no: 1, kind: 'quiz', questionMd: Q1_TEXT, answerMd: A1_TEXT, workdir: null },
      { no: 2, kind: 'code', questionMd: Q2_TEXT, answerMd: A2_TEXT, workdir: WORKDIR },
    ],
    closingMd: null,
  };
}

/** 学習セットを実 API で投入する（night-study が送るのと同じ経路） */
async function seedSet(request: APIRequestContext, date: string) {
  const res = await request.post('/api/learning/sets', { data: setBody(date) });
  expect(res.status(), await res.text()).toBe(200);
}

/** `GET /api/days/{date}` の応答（docs/specs/03-api.md §3） */
function dayBody(date: string, done: boolean) {
  return {
    date,
    weekday: '水',
    // 学習セッションの消し込み経路を通すため未確定日として返す（過去日は readonly）
    readonly: false,
    progress: { done: done ? 1 : 0, total: 1 },
    tasks: [
      {
        id: TASK_ID,
        time: '9:00',
        effort: '30分',
        tool: 'cerebellum',
        content: TASK_CONTENT,
        done,
        checkedAt: done ? new Date().toISOString() : null,
        detailRef: 'learning.session',
      },
    ],
  };
}

/**
 * 消し込み対象のタスクを固定し、`POST .../checks/{taskId}` の呼び出しを記録する。
 * 返す配列が空のままなら「消し込まれていない」。
 */
async function stubDay(page: Page, date: string) {
  const checkedIds: string[] = [];

  await page.route('**/api/days/' + date, async (route) => {
    await route.fulfill({ json: dayBody(date, false) });
  });

  await page.route('**/api/days/today/checks/*', async (route) => {
    const taskId = decodeURIComponent(new URL(route.request().url()).pathname.split('/').pop() ?? '');
    checkedIds.push(taskId);
    await route.fulfill({ json: dayBody(date, true) });
  });

  return checkedIds;
}

const learningUrl = (date: string) => '/learning?date=' + date + '&taskId=' + TASK_ID;

test('一本道を完走すると、記録 → 消し込み → 完了画面 →「今日へ戻る」まで通る', async ({ page, request }) => {
  const date = '2026-03-11';
  await seedSet(request, date);
  const checkedIds = await stubDay(page, date);

  await page.goto(learningUrl(date));

  // --- レッスン（§3.1）
  await expect(page.getByRole('heading', { name: '今日の学習 — ' + THEME })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'WAL とは' })).toBeVisible();
  await expect(page.getByText('WAL はジャーナルを追記していく方式。')).toBeVisible();
  await expect(page.getByText("sqlite3 cerebellum.db 'PRAGMA journal_mode=WAL;'")).toBeVisible();

  await page.getByRole('button', { name: '問題へ' }).click();

  // --- 問題（§3.2）。解答はまだ出さない・入力も求めない
  await expect(page.getByRole('heading', { name: '問題1' })).toBeVisible();
  await expect(page.getByText(Q1_TEXT)).toBeVisible();
  await expect(page.getByText(A1_TEXT)).toHaveCount(0);
  await expect(page.getByRole('textbox')).toHaveCount(0);

  // code 問題は workdir をコピーボタン付きで（解くのはターミナルの領分）
  await expect(page.getByText(WORKDIR)).toBeVisible();
  await expect(page.getByRole('button', { name: '作業ディレクトリのパスをコピー' })).toBeVisible();
  await expect(page.getByText('ターミナルで解いてから戻ってきてください')).toBeVisible();

  await page.getByRole('button', { name: '答え合わせへ' }).click();

  // --- 回答（§3.3）。全問タップするまで「感想へ」は無効
  await expect(page.getByText(A1_TEXT)).toBeVisible();
  await expect(page.getByText(A2_TEXT)).toBeVisible();

  const toFeeling = page.getByRole('button', { name: '感想へ' });
  await expect(toFeeling).toBeDisabled();

  await page.getByRole('button', { name: '問題1 の自己採点 ○（できた）' }).click();
  await expect(toFeeling).toBeDisabled(); // 1問だけではまだ進めない

  await page.getByRole('button', { name: '問題2 の自己採点 ×（できず）' }).click();
  await expect(toFeeling).toBeEnabled();

  // ここまで一切送信していない（採点はローカル state・§3.3）
  expect(checkedIds).toEqual([]);

  await toFeeling.click();

  // --- 感想（§3.4）
  await page
    .getByPlaceholder('どこで詰まった？何が腑に落ちた？（1〜2行）')
    .fill('checkpoint の条件が曖昧だった');
  await page.getByRole('button', { name: '完了' }).click();

  // ①result → ②消し込み → ③完了画面
  await expect(page.getByText('記録しました。明日のセットに反映されます')).toBeVisible();
  expect(checkedIds).toEqual([TASK_ID]);

  // 記録はサーバーに残っている（画面の見た目だけでなく実データを確かめる）
  const saved = await request.get('/api/learning/sets/' + date + '/result');
  expect(saved.status()).toBe(200);
  expect(await saved.json()).toMatchObject({
    date,
    grades: [
      { no: 1, grade: 'o' },
      { no: 2, grade: 'x' },
    ],
    feeling: 'checkpoint の条件が曖昧だった',
  });

  await page.getByRole('link', { name: '今日へ戻る' }).click();
  await page.waitForURL((url) => pathnameOf(url.toString()) === '/');
});

test('result の記録に失敗したらタスクは消し込まれない（トーストで再試行）', async ({ page, request }) => {
  const date = '2026-03-12';
  await seedSet(request, date);
  const checkedIds = await stubDay(page, date);

  // POST だけ 500 にする（記録済み判定の GET は本物のまま通す）
  await page.route('**/api/learning/sets/*/result', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await route.fulfill({
      status: 500,
      json: { error: { code: 'internal', message: '記録できませんでした' } },
    });
  });

  await page.goto(learningUrl(date));

  await page.getByRole('button', { name: '問題へ' }).click();
  await page.getByRole('button', { name: '答え合わせへ' }).click();
  await page.getByRole('button', { name: '問題1 の自己採点 ○（できた）' }).click();
  await page.getByRole('button', { name: '問題2 の自己採点 △（曖昧）' }).click();
  await page.getByRole('button', { name: '感想へ' }).click();
  await page.getByRole('button', { name: '完了' }).click();

  // 再試行できる形で失敗が見えている
  const toast = page.getByRole('alert', { name: '通知' });
  await expect(toast).toContainText('記録に失敗しました');
  await expect(toast.getByRole('button', { name: '再試行' })).toBeVisible();

  // 記録できていないので消し込まない・完了画面にも進まない（§4）
  expect(checkedIds).toEqual([]);
  await expect(page.getByText('記録しました。明日のセットに反映されます')).toHaveCount(0);

  // サーバー側にも成績は残っていない
  const saved = await request.get('/api/learning/sets/' + date + '/result');
  expect(saved.status()).toBe(404);
});

test('学習セットが無い日は、その旨だけを出す', async ({ page }) => {
  const date = '2026-03-13'; // 投入しない

  await page.goto(learningUrl(date));

  await expect(
    page.getByText('今日の学習セットはありません（生成失敗か休み。ログ: night-study）'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: '問題へ' })).toHaveCount(0);
});

test('記録済みの日に再訪すると記録内容が出て、「やり直す」で一本道へ戻る', async ({ page, request }) => {
  const date = '2026-03-14';
  await seedSet(request, date);
  const recorded = await request.post('/api/learning/sets/' + date + '/result', {
    data: {
      grades: [
        { no: 1, grade: 'd' },
        { no: 2, grade: 'x' },
      ],
      feeling: 'ロックの粒度が読めなかった',
    },
  });
  expect(recorded.status()).toBe(200);

  await stubDay(page, date);
  await page.goto(learningUrl(date));

  await expect(page.getByRole('heading', { name: '記録済み — ' + THEME })).toBeVisible();
  await expect(page.getByText('ロックの粒度が読めなかった')).toBeVisible();
  // 一本道は出ていない（記録済みの表示が先）
  await expect(page.getByRole('button', { name: '問題へ' })).toHaveCount(0);

  await page.getByRole('button', { name: 'やり直す' }).click();

  await expect(page.getByRole('heading', { name: '今日の学習 — ' + THEME })).toBeVisible();
  await expect(page.getByRole('button', { name: '問題へ' })).toBeVisible();
});
