import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

// cerebellum-8p5.5 [Frontend] 学習セッションビューのレーン対応
//
// 受け入れ基準（docs/specs/31-learning-lanes.md §3.4 ／ docs/specs/15-web-learning.md §2）:
//   ① `/learning?lane=en` が英語レーンのセットを描く
//   ② `lane` 省略で本線が描かれる（既存 E2E は無改修のまま）
//   ③ 完了時の `POST .../result` が**開いているレーン**に送られる
//   ④ レーン切り替えタブ・レーン一覧が画面内に無い（在庫を見せない原則。移動は「今日」画面経由）
//
// データ投入は実 API（`POST /api/learning/sets` に `lane` を添えて2本送る）。同じ日に
// 本線と英語を入れて**互いに上書きしないこと**まで画面から確かめる。日付はテストごとに
// 専有する——playwright.config.ts が fullyParallel なので、同じ date を複数テストが
// UPSERT すると期待値が互いに壊れる（c32.2 の spec と同じ理由）。
//
// 日次 API（`GET /api/days/{date}`）だけはスタブする。理由も c32.2 と同じで、
// 「今日」のスナップショットは最初の GET で確定し以後不変（docs/specs/02-data-model.md §4・
// AGENTS.md ルール3）＝ 全 spec で共有される使い捨て DB では実行順に依存して flaky になる。

const MAIN_THEME = 'SQLite の WAL とロック';
const EN_THEME = '英語 Day 1: 技術記事の読解';

const MAIN_LESSON = 'WAL はジャーナルを追記していく方式。';
const EN_LESSON = 'Technical articles repeat the same connectives.';

const MAIN_Q = 'WAL で checkpoint が走るのはどんなとき？';
const MAIN_A = 'WAL ファイルが閾値を超えたとき。';
const EN_Q = 'What does "deprecated" mean here?';
const EN_A = '「非推奨」。まだ動くが将来消える。';

/** 静的 export の遷移先は末尾スラッシュが付き得るので、比較前に落とす */
const pathnameOf = (url: string) => new URL(url).pathname.replace(/\/+$/, '') || '/';

/** `POST /api/learning/sets` の body（docs/specs/03-api.md §3。lane 省略時は main） */
function setBody(date: string, lane: 'main' | 'en') {
  const en = lane === 'en';
  return {
    date,
    lane,
    theme: en ? EN_THEME : MAIN_THEME,
    source: 'theme',
    lessonMd: en ? EN_LESSON : MAIN_LESSON,
    problems: [
      {
        no: 1,
        kind: 'quiz',
        questionMd: en ? EN_Q : MAIN_Q,
        answerMd: en ? EN_A : MAIN_A,
        workdir: null,
      },
    ],
    closingMd: null,
  };
}

/** 学習セットを実 API で投入する（night-study が送るのと同じ経路） */
async function seedSet(request: APIRequestContext, date: string, lane: 'main' | 'en') {
  const res = await request.post('/api/learning/sets', { data: setBody(date, lane) });
  expect(res.status(), await res.text()).toBe(200);
}

/** 同じ日に両レーンを入れる（互いに上書きしないことが前提・docs/specs/31 §3.2） */
async function seedBothLanes(request: APIRequestContext, date: string) {
  await seedSet(request, date, 'main');
  await seedSet(request, date, 'en');
}

/** `GET /api/days/{date}` の応答（docs/specs/03-api.md §3）。消し込み対象は持たせない */
function dayBody(date: string) {
  return {
    date,
    weekday: '月',
    readonly: false,
    progress: { done: 0, total: 0 },
    tasks: [],
  };
}

async function stubDay(page: Page, date: string) {
  await page.route('**/api/days/' + date, async (route) => {
    await route.fulfill({ json: dayBody(date) });
  });
}

const learningUrl = (date: string, lane?: 'main' | 'en') =>
  '/learning?date=' + date + (lane ? '&lane=' + lane : '');

test('① ?lane=en は英語レーンのセットを描く（同じ日の本線を出さない）', async ({
  page,
  request,
}) => {
  const date = '2026-10-05';
  await seedBothLanes(request, date);
  await stubDay(page, date);

  await page.goto(learningUrl(date, 'en'));

  // 見出しはレーン名を足さず `今日の学習 — {theme}` のまま（docs/specs/31 §3.4）
  await expect(page.getByRole('heading', { name: '今日の学習 — ' + EN_THEME })).toBeVisible();
  await expect(page.getByText(EN_LESSON)).toBeVisible();

  // 同じ日の本線は混ざらない（レーンは独立・docs/specs/31 §3.2）
  await expect(page.getByRole('heading', { name: '今日の学習 — ' + MAIN_THEME })).toHaveCount(0);
  await expect(page.getByText(MAIN_LESSON)).toHaveCount(0);

  // 画面の姿を1枚残す（docs/design/screenshots/ へ回収する素材）
  await page.screenshot({ path: 'test-results/screens/cerebellum-8p5.5-learning.png', fullPage: true });

  // 一本道は本線と同一（レーンごとに別の体験を作らない・同 §3.4）
  await page.getByRole('button', { name: '問題へ' }).click();
  await expect(page.getByRole('heading', { name: '問題1' })).toBeVisible();
  await expect(page.getByText(EN_Q)).toBeVisible();
});

test('② lane 省略は本線を描く（同じ日の英語を出さない）', async ({ page, request }) => {
  const date = '2026-10-06';
  await seedBothLanes(request, date);
  await stubDay(page, date);

  await page.goto(learningUrl(date));

  await expect(page.getByRole('heading', { name: '今日の学習 — ' + MAIN_THEME })).toBeVisible();
  await expect(page.getByText(MAIN_LESSON)).toBeVisible();
  await expect(page.getByRole('heading', { name: '今日の学習 — ' + EN_THEME })).toHaveCount(0);
});

test('② 語彙外の lane は本線に倒す（画面から選び直させない）', async ({ page, request }) => {
  const date = '2026-10-07';
  await seedBothLanes(request, date);
  await stubDay(page, date);

  await page.goto(learningUrl(date) + '&lane=zz');

  await expect(page.getByRole('heading', { name: '今日の学習 — ' + MAIN_THEME })).toBeVisible();
  await expect(page.getByRole('heading', { name: '今日の学習 — ' + EN_THEME })).toHaveCount(0);
});

test('③ 完了時の result は開いているレーンに送られる', async ({ page, request }) => {
  const date = '2026-10-08';
  await seedBothLanes(request, date);
  await stubDay(page, date);

  await page.goto(learningUrl(date, 'en'));

  await expect(page.getByRole('heading', { name: '今日の学習 — ' + EN_THEME })).toBeVisible();
  await page.getByRole('button', { name: '問題へ' }).click();
  await page.getByRole('button', { name: '採点へ' }).click();
  await page.getByRole('button', { name: '問題1 の自己採点 ○（できた）' }).click();
  await page.getByRole('button', { name: '感想へ' }).click();
  await page.getByPlaceholder('どこで詰まった？何が腑に落ちた？（1〜2行）').fill('綴りで迷った');

  const posted = page.waitForRequest(
    (req) => req.method() === 'POST' && req.url().includes('/result'),
  );
  await page.getByRole('button', { name: '完了' }).click();

  // 送信先の URL に lane が乗っている（docs/specs/31 §3.3）
  expect(new URL((await posted).url()).searchParams.get('lane')).toBe('en');
  await expect(page.getByText('記録しました。明日のセットに反映されます')).toBeVisible();

  // 英語にだけ記録が残り、本線は未記録のまま（404 はレーンごとに独立・同 §3.3）
  const en = await request.get('/api/learning/sets/' + date + '/result?lane=en');
  expect(en.status()).toBe(200);
  expect(await en.json()).toMatchObject({
    date,
    grades: [{ no: 1, grade: 'o' }],
    feeling: '綴りで迷った',
  });

  const main = await request.get('/api/learning/sets/' + date + '/result');
  expect(main.status()).toBe(404);

  // 再訪しても記録済み表示は英語レーンのもの
  await page.goto(learningUrl(date, 'en'));
  await expect(page.getByRole('heading', { name: '記録済み — ' + EN_THEME })).toBeVisible();
  await expect(page.getByText('綴りで迷った')).toBeVisible();
});

test('④ レーン切り替えタブ・レーン一覧を画面内に置かない', async ({ page, request }) => {
  const date = '2026-10-09';
  await seedBothLanes(request, date);
  await stubDay(page, date);

  await page.goto(learningUrl(date, 'en'));
  await expect(page.getByRole('heading', { name: '今日の学習 — ' + EN_THEME })).toBeVisible();

  // レーン名を名乗る操作子が無い（在庫を見せない原則・docs/specs/31 §3.4）
  for (const name of ['本線', '英語', 'レーン', 'main', 'en']) {
    await expect(page.getByRole('tab', { name })).toHaveCount(0);
    await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
  }
  await expect(page.getByRole('tablist')).toHaveCount(0);

  // /learning への内部リンクも無い（レーン間の移動は「今日」画面を経由する）
  const hrefs = await page.getByRole('link').evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('href') ?? ''),
  );
  expect(hrefs.filter((href) => href.includes('/learning'))).toEqual([]);
  expect(hrefs.filter((href) => href.includes('lane='))).toEqual([]);

  // 画面から出られる先は「今日へ」だけ（一本道は変えない）
  const today = page.getByRole('link', { name: '◀ 今日へ' });
  await expect(today).toBeVisible();
  await today.click();
  await page.waitForURL((url) => pathnameOf(url.toString()) === '/');
});
