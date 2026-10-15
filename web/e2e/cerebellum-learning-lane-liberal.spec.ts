import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';

// 教養レーン（`liberal`）を3行目に足す（docs/specs/31-learning-lanes.md §3.1・§3.4・§3.5。2026-10-15 改訂）
//
// 受け入れ基準:
//   ① LEARNING が `本線` → `英語` → `教養` の順で3行出る（固定順）
//   ② 教養行が `未着` / `未回答` / `済 ○x △y ×z` を本線・英語と独立に出す
//   ③ 教養行のタップが `/learning?lane=liberal` へ遷移し、教養のセットが描かれる
//   ④ 教養の未着（水・日は配られない）が計器盤の赤点に含まれない（25 §3.1）
//   ⑤ 学習セッションビューが `?lane=liberal` を描き、完了時の result が教養レーンに送られる
//
// 「今日」画面の検証（①〜④）は 8p5.6 と同じく入力と「いま」を固定し、学習はレーンで応答を
// 出し分ける。セッションの検証（⑤）は 8p5.5 と同じく実 API に3レーンを投入する。日付は
// 他 spec と重ならない日を専有する（fullyParallel で同じ date を UPSERT し合わないため）。

/** 固定する「いま」。2026-10-14 は水曜（教養が配られない曜日） */
const TODAY = '2026-10-14';
const NOON = new Date(2026, 9, 14, 12, 0, 0);

type Lane = 'main' | 'en' | 'liberal';
type GradeSeed = { no: number; grade: 'o' | 'd' | 'x' };
type LaneSeed = { kind: 'missing' } | { kind: 'unanswered' } | { kind: 'done'; grades: GradeSeed[] };

const MISSING: LaneSeed = { kind: 'missing' };

const THEMES: Record<Lane, string> = {
  main: 'SQLite の WAL とロック',
  en: '英語 Day 1: 技術記事の読解',
  liberal: '教養 W01: 比較優位',
};
const LESSONS: Record<Lane, string> = {
  main: 'WAL はジャーナルを追記していく方式。',
  en: 'Technical articles repeat the same connectives.',
  liberal: '比較優位は絶対的な得意ではなく機会費用で決まる。',
};
const QUESTIONS: Record<Lane, string> = {
  main: 'WAL で checkpoint が走るのはどんなとき？',
  en: 'What does "deprecated" mean here?',
  liberal: '機会費用が小さいのはどちら？',
};

function dayJson(done: boolean) {
  return {
    date: TODAY,
    weekday: '水',
    readonly: false,
    progress: { done: done ? 1 : 0, total: 1 },
    tasks: [
      {
        id: TODAY + '#1',
        time: '07:00',
        effort: '5m',
        tool: '-',
        content: '朝の散歩',
        done,
        checkedAt: done ? TODAY + 'T07:05:00+09:00' : null,
        detailRef: null,
      },
    ],
  };
}

function learningSetJson(lane: Lane, date: string) {
  return {
    date,
    lane,
    receivedAt: date + 'T05:00:00+09:00',
    theme: THEMES[lane],
    source: 'theme',
    lessonMd: LESSONS[lane],
    problems: [
      {
        no: 1,
        kind: 'quiz',
        questionMd: QUESTIONS[lane],
        answerMd: '解答',
        answerType: null,
        expected: null,
        choices: null,
        workdir: null,
      },
    ],
    closingMd: null,
  };
}

const notFound = (message: string) => ({
  status: 404,
  json: { error: { code: 'not_found', message } },
});

function laneOf(url: string): Lane {
  const lane = new URL(url).searchParams.get('lane');
  return lane === 'en' || lane === 'liberal' ? lane : 'main';
}

const learningPanel = (page: Page) => page.locator('.lx__today');
const laneRow = (page: Page, index: number) =>
  learningPanel(page).locator('.lx__todayrow').nth(index);
const headerPanel = (page: Page) => page.locator('.hdr');
const redDot = (page: Page) => page.getByRole('img', { name: '確認待ちに異常があります' });

async function topOf(locator: Locator): Promise<number> {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return box?.y ?? Number.NaN;
}

type Options = {
  done?: boolean;
  lanes?: Partial<Record<Lane, LaneSeed>>;
  alert?: number;
};

/** 入力と「いま」を固定してから「今日」を開く（8p5.6 と同じ方針） */
async function openToday(page: Page, options: Options = {}) {
  await page.clock.setFixedTime(NOON);
  const lanes: Record<Lane, LaneSeed> = {
    main: MISSING,
    en: MISSING,
    liberal: MISSING,
    ...options.lanes,
  };

  await page.route(
    (url) => url.pathname === '/api/days/today',
    (route) => route.fulfill({ json: dayJson(options.done ?? false) }),
  );
  await page.route(
    (url) => url.pathname === '/api/learning/sets/today',
    (route) => {
      const lane = laneOf(route.request().url());
      return lanes[lane].kind === 'missing'
        ? route.fulfill(notFound('学習セットが未取り込みです'))
        : route.fulfill({ json: learningSetJson(lane, TODAY) });
    },
  );
  await page.route(
    (url) => url.pathname === '/api/learning/sets/today/result',
    (route) => {
      const seed = lanes[laneOf(route.request().url())];
      return seed.kind === 'done'
        ? route.fulfill({
            json: {
              date: TODAY,
              grades: seed.grades,
              feeling: '手が動いた',
              completedAt: TODAY + 'T07:30:00+09:00',
            },
          })
        : route.fulfill(notFound('成績が未記録です'));
    },
  );
  await page.route(
    (url) => url.pathname === '/api/inbox/summary',
    (route) =>
      route.fulfill({
        json: {
          sources: [
            {
              source: 'night-harness',
              latestDate: TODAY,
              latestReceivedAt: TODAY + 'T06:20:00+09:00',
              latestItemCount: 0,
              openCount: { approve: 1, choose: 0, read: 0, alert: options.alert ?? 0 },
              failedCount: 0,
            },
          ],
        },
      }),
  );
  await page.route('**/office.json', (route) =>
    route.fulfill({ json: { generated_at: null, window_days: 14, employees: [], runs: [] } }),
  );

  await page.goto('/');
  await expect(headerPanel(page)).toBeVisible();
}

// ---- ① 3行・固定順 ----

test('LEARNING は `本線` → `英語` → `教養` の順で3行出る', async ({ page }) => {
  await openToday(page, {
    lanes: {
      main: { kind: 'unanswered' },
      en: { kind: 'unanswered' },
      liberal: { kind: 'unanswered' },
    },
  });

  await expect(learningPanel(page)).toHaveCount(1);
  await expect(learningPanel(page).locator('.lx__todayrow')).toHaveCount(3);
  await expect(laneRow(page, 0)).toContainText('本線');
  await expect(laneRow(page, 1)).toContainText('英語');
  await expect(laneRow(page, 2)).toContainText('教養');

  // 実際の縦位置でも 本線 → 英語 → 教養
  const main = await topOf(laneRow(page, 0));
  const en = await topOf(laneRow(page, 1));
  const liberal = await topOf(laneRow(page, 2));
  expect(main).toBeLessThan(en);
  expect(en).toBeLessThan(liberal);

  // 見出しは段に1つだけ。LEARNING を名乗る枠も本線の1つだけ（段を割らない）
  await expect(learningPanel(page).locator('.list__head')).toHaveCount(1);
  await expect(page.getByRole('region', { name: 'LEARNING', exact: false })).toHaveCount(1);

  await page.screenshot({
    path: 'test-results/screens/cerebellum-learning-lane-liberal-today.png',
    fullPage: true,
  });
});

// ---- ② 教養行の状態は独立 ----

test('本線・英語が済んで教養が届かない日は、教養の行だけが「未着」になる', async ({ page }) => {
  await openToday(page, {
    lanes: {
      main: { kind: 'done', grades: [{ no: 1, grade: 'o' }] },
      en: { kind: 'done', grades: [{ no: 1, grade: 'x' }] },
      liberal: MISSING,
    },
  });

  await expect(laneRow(page, 0)).toContainText('済 ○1 △0 ×0');
  await expect(laneRow(page, 1)).toContainText('済 ○0 △0 ×1');
  await expect(laneRow(page, 2)).toContainText('未着');
  await expect(laneRow(page, 0)).not.toHaveClass(/lx__todayrow--bad/);
  await expect(laneRow(page, 1)).not.toHaveClass(/lx__todayrow--bad/);
  await expect(laneRow(page, 2)).toHaveClass(/lx__todayrow--bad/);
});

test('教養だけ届いた日は、教養が「未回答」・本線と英語が「未着」になる', async ({ page }) => {
  await openToday(page, { lanes: { liberal: { kind: 'unanswered' } } });

  await expect(laneRow(page, 0)).toContainText('未着');
  await expect(laneRow(page, 1)).toContainText('未着');
  await expect(laneRow(page, 2)).toContainText('未回答');
  await expect(laneRow(page, 2)).not.toHaveClass(/lx__todayrow--bad/);
});

test('教養が記録済みの日は、教養の行が自分の ○△× の内訳を出す', async ({ page }) => {
  await openToday(page, {
    lanes: {
      main: { kind: 'unanswered' },
      en: { kind: 'done', grades: [{ no: 1, grade: 'o' }] },
      liberal: {
        kind: 'done',
        grades: [
          { no: 1, grade: 'o' },
          { no: 2, grade: 'd' },
          { no: 3, grade: 'd' },
          { no: 4, grade: 'x' },
        ],
      },
    },
  });

  await expect(laneRow(page, 0)).toContainText('未回答');
  await expect(laneRow(page, 1)).toContainText('済 ○1 △0 ×0');
  await expect(laneRow(page, 2)).toContainText('済 ○1 △2 ×1');
});

// ---- ③ タップ先 ----

test('教養の行のタップ先は `/learning?lane=liberal`', async ({ page }) => {
  await openToday(page, {
    lanes: {
      main: { kind: 'unanswered' },
      en: { kind: 'unanswered' },
      liberal: { kind: 'unanswered' },
    },
  });

  await expect(laneRow(page, 0)).toHaveAttribute('href', '/learning');
  await expect(laneRow(page, 1)).toHaveAttribute('href', '/learning?lane=en');
  await expect(laneRow(page, 2)).toHaveAttribute('href', '/learning?lane=liberal');

  await laneRow(page, 2).click();
  await page.waitForURL((url) => url.pathname.replace(/\/+$/, '') === '/learning');
  expect(new URL(page.url()).searchParams.get('lane')).toBe('liberal');
  // 遷移先は教養のセット（本線・英語を出さない）
  await expect(
    page.getByRole('heading', { name: '今日の学習 — ' + THEMES.liberal }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: '今日の学習 — ' + THEMES.main })).toHaveCount(0);
});

// ---- ④ 教養の未着は赤点に含めない ----

test('教養が配られない日（水曜）でも計器盤に赤点は出ず、ALL CLEAR も変わらない', async ({
  page,
}) => {
  await openToday(page, {
    done: true,
    lanes: {
      main: { kind: 'done', grades: [{ no: 1, grade: 'o' }] },
      en: { kind: 'done', grades: [{ no: 1, grade: 'o' }] },
      liberal: MISSING,
    },
  });

  // 教養の行は未着の異常様式で出る（合図は出す）
  await expect(laneRow(page, 2)).toHaveClass(/lx__todayrow--bad/);
  // それでも赤点は点かない。日課の進捗・ALL CLEAR も学習に影響されない
  await expect(redDot(page)).toHaveCount(0);
  await expect(page.locator('.hdr .hdr__alert')).toHaveCount(0);
  await expect(page.locator('.hdr__count')).toHaveText('1 / 1');
  await expect(page.locator('.allclear')).toBeVisible();

  // 逆向き: 確認待ちに異常があれば赤点は出る（赤点の計算そのものは無変更）
  await openToday(page, {
    done: true,
    alert: 1,
    lanes: { main: { kind: 'done', grades: [{ no: 1, grade: 'o' }] }, liberal: MISSING },
  });
  await expect(redDot(page)).toBeVisible();
});

// ---- ⑤ 学習セッションビュー（実 API） ----

async function seedSet(request: APIRequestContext, date: string, lane: Lane) {
  const body = learningSetJson(lane, date);
  const res = await request.post('/api/learning/sets', {
    data: {
      date: body.date,
      lane: body.lane,
      theme: body.theme,
      source: body.source,
      lessonMd: body.lessonMd,
      problems: [
        { no: 1, kind: 'quiz', questionMd: QUESTIONS[lane], answerMd: '解答', workdir: null },
      ],
      closingMd: null,
    },
  });
  expect(res.status(), await res.text()).toBe(200);
}

async function seedAllLanes(request: APIRequestContext, date: string) {
  for (const lane of ['main', 'en', 'liberal'] as const) {
    await seedSet(request, date, lane);
  }
}

async function stubDay(page: Page, date: string) {
  await page.route('**/api/days/' + date, (route) =>
    route.fulfill({
      json: { date, weekday: '月', readonly: false, progress: { done: 0, total: 0 }, tasks: [] },
    }),
  );
}

test('`/learning?lane=liberal` は教養のセットを描く（同じ日の本線・英語を出さない）', async ({
  page,
  request,
}) => {
  const date = '2026-11-02';
  await seedAllLanes(request, date);
  await stubDay(page, date);

  await page.goto('/learning?date=' + date + '&lane=liberal');

  await expect(
    page.getByRole('heading', { name: '今日の学習 — ' + THEMES.liberal }),
  ).toBeVisible();
  await expect(page.getByText(LESSONS.liberal)).toBeVisible();
  await expect(page.getByText(LESSONS.main)).toHaveCount(0);
  await expect(page.getByText(LESSONS.en)).toHaveCount(0);

  await page.getByRole('button', { name: '問題へ' }).click();
  await expect(page.getByText(QUESTIONS.liberal)).toBeVisible();
});

test('教養の完了時の result は教養レーンに送られ、本線・英語は未記録のまま', async ({
  page,
  request,
}) => {
  const date = '2026-11-03';
  await seedAllLanes(request, date);
  await stubDay(page, date);

  await page.goto('/learning?date=' + date + '&lane=liberal');
  await expect(
    page.getByRole('heading', { name: '今日の学習 — ' + THEMES.liberal }),
  ).toBeVisible();
  await page.getByRole('button', { name: '問題へ' }).click();
  await page.getByRole('button', { name: '採点へ' }).click();
  await page.getByRole('button', { name: '問題1 の自己採点 △（曖昧）' }).click();
  await page.getByRole('button', { name: '感想へ' }).click();
  await page.getByPlaceholder('どこで詰まった？何が腑に落ちた？（1〜2行）').fill('機会費用で迷った');

  const posted = page.waitForRequest(
    (req) => req.method() === 'POST' && req.url().includes('/result'),
  );
  await page.getByRole('button', { name: '完了' }).click();
  expect(new URL((await posted).url()).searchParams.get('lane')).toBe('liberal');
  await expect(page.getByText('記録しました。明日のセットに反映されます')).toBeVisible();

  const liberal = await request.get('/api/learning/sets/' + date + '/result?lane=liberal');
  expect(liberal.status()).toBe(200);
  expect(await liberal.json()).toMatchObject({
    date,
    grades: [{ no: 1, grade: 'd' }],
    feeling: '機会費用で迷った',
  });
  for (const uri of ['/result', '/result?lane=en']) {
    const res = await request.get('/api/learning/sets/' + date + uri);
    expect(res.status()).toBe(404);
  }
});
