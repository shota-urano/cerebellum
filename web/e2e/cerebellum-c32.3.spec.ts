import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

// cerebellum-c32.3 [Frontend] 回答フォームと自動採点（docs/specs/15-web-learning.md §3.2・§3.3・§3.4）
//
// 受け入れ基準:
//   - `answerType` 付きセットは問題段でフォームに入力し、採点段で自動○×が出る（§3.2・§3.3）
//   - 自動採点の結果はタップで △ へ上書きできる（§3.3。「解けたが怪しかった」用途）
//   - 完了で grades（上書き後の grade）＋ answer が送られる（§3.4）
//   - 未回答のまま採点段へ進めて、未回答は「×（未回答）」になる（§3.2・§3.3）
//   - `answerType` の無いセットは従来動作（フォームなし・全問手動タップまで「感想へ」無効）
//
// データ投入は実 API（`POST /api/learning/sets`）。**日付はテストごとに専有**する
// （fullyParallel なので同じ date を複数テストが UPSERT すると期待値が壊れる。c32.2 と同じ流儀）。
// 日次 API だけスタブする理由も c32.2 と同じ（今日のスナップショットは不変なので、
// 消し込み対象のタスクを実データで用意すると実行順に依存して flaky になる）。

/** task_id は sha1 先頭12桁（docs/specs/02-data-model.md §3） */
const TASK_ID = '3f9a1c7b2e04';
const TASK_CONTENT = '40_Projectsにて新たな学習';

const THEME = 'SQLite の WAL とロック';
const LESSON_MD = 'WAL はジャーナルを追記していく方式。';

// choice（§3.3: 選択値と expected の完全一致）
const Q1_TEXT = 'WAL の書き込みはどこへ行く？';
const A1_TEXT = 'WAL ファイルに追記され、後で checkpoint で本体へ移る。';
const Q1_CHOICES = ['元のDBに直接書く', 'WAL ファイルに追記される', 'メモリに保持される'];
const Q1_EXPECTED = 'WAL ファイルに追記される';

// number（§3.3: 双方を数値として解釈。全角入力も共通の NFKC 正規化で通る）
const Q2_TEXT = 'checkpoint の既定閾値は何 MB 相当？（小数で）';
const A2_TEXT = '1000 ページ ≒ 12.5 MB 相当。';
const Q2_EXPECTED = '12.5';
const Q2_INPUT = '１２．５０'; // 全角＋末尾ゼロ。NFKC ＋数値比較で 12.5 と一致する

// text（§3.3: 共通の正規化のうえで一致）
const Q3_TEXT = 'WAL を有効化する PRAGMA の名前は？';
const A3_TEXT = 'journal_mode を WAL にする。';
const Q3_EXPECTED = 'journal_mode';
const Q3_WRONG = 'synchronous';

/** 静的 export の遷移先は末尾スラッシュが付き得るので、比較前に落とす */
const pathnameOf = (url: string) => new URL(url).pathname.replace(/\/+$/, '') || '/';

/** `POST /api/learning/sets` の body（docs/specs/03-api.md §3。自動採点フィールド付き） */
function autoSetBody(date: string) {
  return {
    date,
    theme: THEME,
    source: 'theme',
    lessonMd: LESSON_MD,
    problems: [
      {
        no: 1,
        kind: 'quiz',
        questionMd: Q1_TEXT,
        answerMd: A1_TEXT,
        answerType: 'choice',
        expected: Q1_EXPECTED,
        choices: Q1_CHOICES,
        workdir: null,
      },
      {
        no: 2,
        kind: 'quiz',
        questionMd: Q2_TEXT,
        answerMd: A2_TEXT,
        answerType: 'number',
        expected: Q2_EXPECTED,
        choices: null,
        workdir: null,
      },
      {
        no: 3,
        kind: 'quiz',
        questionMd: Q3_TEXT,
        answerMd: A3_TEXT,
        answerType: 'text',
        expected: Q3_EXPECTED,
        choices: null,
        workdir: null,
      },
    ],
    closingMd: null,
  };
}

/** `answerType` の無い旧形式セット（後方互換＝自己採点フォールバック。14-learning.md §3.1） */
function legacySetBody(date: string) {
  return {
    date,
    theme: THEME,
    source: 'theme',
    lessonMd: LESSON_MD,
    problems: [
      { no: 1, kind: 'quiz', questionMd: Q1_TEXT, answerMd: A1_TEXT, workdir: null },
      { no: 2, kind: 'quiz', questionMd: Q2_TEXT, answerMd: A2_TEXT, workdir: null },
    ],
    closingMd: null,
  };
}

async function seedSet(request: APIRequestContext, body: object) {
  const res = await request.post('/api/learning/sets', { data: body });
  expect(res.status(), await res.text()).toBe(200);
}

/** `GET /api/days/{date}` の応答（docs/specs/03-api.md §3） */
function dayBody(date: string, done: boolean) {
  return {
    date,
    weekday: '水',
    readonly: false, // 学習セッションの消し込み経路を通すため未確定日として返す
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

/** 消し込み対象のタスクを固定し、`POST .../checks/{taskId}` の呼び出しを記録する */
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

/** 問題カードは並び順で掴む（1件のカード内に自動採点・あなたの回答・採点ボタンが入る） */
const card = (page: Page, index: number) => page.locator('.lx__card').nth(index);

test('入力 → 採点段で自動○× → △へ上書き → 完了で grades と answer が送られる', async ({
  page,
  request,
}) => {
  const date = '2026-03-15';
  await seedSet(request, autoSetBody(date));
  const checkedIds = await stubDay(page, date);

  await page.goto(learningUrl(date));

  // --- レッスン（§3.1）
  await expect(page.getByRole('heading', { name: '今日の学習 — ' + THEME })).toBeVisible();
  await page.getByRole('button', { name: '問題へ' }).click();

  // --- 問題（§3.2）。answerType ごとのフォームが出て、解答はまだ出さない
  await expect(page.getByRole('heading', { name: '問題1' })).toBeVisible();
  await expect(page.getByText(A1_TEXT)).toHaveCount(0);

  // choice はラジオ、number・text は1行テキスト入力
  const choiceGroup = page.getByRole('radiogroup', { name: '問題1 の回答' });
  await expect(choiceGroup).toBeVisible();
  for (const choice of Q1_CHOICES) {
    await expect(choiceGroup.getByRole('radio', { name: choice })).toBeVisible();
  }
  await choiceGroup.getByRole('radio', { name: Q1_EXPECTED }).check();

  await page.getByLabel('問題2 の回答').fill(Q2_INPUT);
  await page.getByLabel('問題3 の回答').fill(Q3_WRONG);

  await page.getByRole('button', { name: '採点へ' }).click();

  // --- 採点（§3.3）。解答が開き、自動採点の ○ / × が出る
  await expect(page.getByText(A1_TEXT)).toBeVisible();
  await expect(card(page, 0)).toContainText('自動採点 ○'); // choice が完全一致
  await expect(card(page, 1)).toContainText('自動採点 ○'); // 全角「１２．５０」＝ 12.5
  await expect(card(page, 2)).toContainText('自動採点 ×'); // text が不一致
  await expect(card(page, 2)).not.toContainText('未回答'); // 入力はあるので「未回答」は付かない

  // 入力した回答が採点段でも見える（night-study へ送る素材そのもの）
  await expect(card(page, 1)).toContainText(Q2_INPUT);

  // 自動採点分は最初から揃っている＝「感想へ」は無効にならない（§3.3）
  const toFeeling = page.getByRole('button', { name: '感想へ' });
  await expect(toFeeling).toBeEnabled();

  // 自動の ○ をタップで △ へ落とす（「解けたが怪しかった」）
  await page.getByRole('button', { name: '問題1 の自己採点 △（曖昧）' }).click();
  await expect(page.getByRole('button', { name: '問題1 の自己採点 △（曖昧）' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(toFeeling).toBeEnabled();

  // ここまで一切送信していない（採点はローカル state・§3.3）
  expect(checkedIds).toEqual([]);

  await toFeeling.click();

  // --- 感想 → 完了（§3.4）
  await page
    .getByPlaceholder('どこで詰まった？何が腑に落ちた？（1〜2行）')
    .fill('journal_mode を取り違えた');
  await page.getByRole('button', { name: '完了' }).click();

  await expect(page.getByText('記録しました。明日のセットに反映されます')).toBeVisible();
  expect(checkedIds).toEqual([TASK_ID]);

  // grades は上書き後の値・answer は入力のまま（§3.3・§3.4）
  const saved = await request.get('/api/learning/sets/' + date + '/result');
  expect(saved.status()).toBe(200);
  expect(await saved.json()).toMatchObject({
    date,
    grades: [
      { no: 1, grade: 'd', answer: Q1_EXPECTED },
      { no: 2, grade: 'o', answer: Q2_INPUT },
      { no: 3, grade: 'x', answer: Q3_WRONG },
    ],
    feeling: 'journal_mode を取り違えた',
  });

  await page.getByRole('link', { name: '今日へ戻る' }).click();
  await page.waitForURL((url) => pathnameOf(url.toString()) === '/');
});

test('未回答のまま採点段へ進めて、未回答は ×（未回答）として記録される', async ({ page, request }) => {
  const date = '2026-03-16';
  await seedSet(request, autoSetBody(date));
  await stubDay(page, date);

  await page.goto(learningUrl(date));

  await page.getByRole('button', { name: '問題へ' }).click();
  // 何も入力せずに進める（§3.2。分からない問題を飛ばせる）
  await page.getByRole('button', { name: '採点へ' }).click();

  for (const index of [0, 1, 2]) {
    await expect(card(page, index)).toContainText('自動採点 ×');
    await expect(card(page, index)).toContainText('未回答');
  }

  await page.getByRole('button', { name: '感想へ' }).click();
  await page.getByRole('button', { name: '完了' }).click();
  await expect(page.getByText('記録しました。明日のセットに反映されます')).toBeVisible();

  // 未回答は grade だけ（answer は「フォーム入力があった問題のみ」・§3.4）
  const saved = await request.get('/api/learning/sets/' + date + '/result');
  expect(saved.status()).toBe(200);
  expect((await saved.json()).grades).toEqual([
    { no: 1, grade: 'x' },
    { no: 2, grade: 'x' },
    { no: 3, grade: 'x' },
  ]);
});

test('answerType の無いセットは従来どおり、全問タップするまで「感想へ」が無効', async ({
  page,
  request,
}) => {
  const date = '2026-03-17';
  await seedSet(request, legacySetBody(date));
  await stubDay(page, date);

  await page.goto(learningUrl(date));

  await page.getByRole('button', { name: '問題へ' }).click();

  // フォームは出ない（§3.2。頭の中で答えてから進む）
  await expect(page.getByRole('radio')).toHaveCount(0);
  await expect(page.getByRole('textbox')).toHaveCount(0);

  await page.getByRole('button', { name: '採点へ' }).click();

  // 自動採点は無く、全問タップが要る（§3.3 のフォールバック）
  await expect(page.getByText('自動採点')).toHaveCount(0);
  const toFeeling = page.getByRole('button', { name: '感想へ' });
  await expect(toFeeling).toBeDisabled();

  await page.getByRole('button', { name: '問題1 の自己採点 ○（できた）' }).click();
  await expect(toFeeling).toBeDisabled();

  await page.getByRole('button', { name: '問題2 の自己採点 △（曖昧）' }).click();
  await expect(toFeeling).toBeEnabled();
});
