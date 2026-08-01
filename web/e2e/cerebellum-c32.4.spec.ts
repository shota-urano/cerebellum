import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

// cerebellum-c32.4 [Frontend] ステッパーの戻り導線（docs/specs/15-web-learning.md §3）
//
// 受け入れ基準:
//   - 採点段から「レッスン」をタップして戻れる（§3「通過済みの段はタップで戻れる」）
//   - 戻ってから「問題」まで進み直すと、c32.3 の回答入力が保持されている（§3.2 のローカル state）
//   - 「採点」まで進み直すと、自動採点とタップ上書きが保持されている（§3.3）
//   - 未通過の先の段はタップで飛び越せない（§3「先の段への飛び越しは不可」）
//   - 完了画面からは戻さない（§3.4。歩き終えた後の画面なので段は押せない）
//
// データ投入・スタブの流儀は c32.3 と同じ（実 API へセットを投入し、日次だけスタブ。
// 日付はテストごとに専有する＝ fullyParallel で同じ date を UPSERT すると期待値が壊れる）。

/** task_id は sha1 先頭12桁（docs/specs/02-data-model.md §3） */
const TASK_ID = '3f9a1c7b2e04';
const TASK_CONTENT = '40_Projectsにて新たな学習';

const THEME = 'SQLite の WAL とロック';
const LESSON_MD = 'WAL はジャーナルを追記していく方式。';

const Q1_TEXT = 'WAL の書き込みはどこへ行く？';
const A1_TEXT = 'WAL ファイルに追記され、後で checkpoint で本体へ移る。';
const Q1_CHOICES = ['元のDBに直接書く', 'WAL ファイルに追記される', 'メモリに保持される'];
const Q1_EXPECTED = 'WAL ファイルに追記される';

const Q2_TEXT = 'checkpoint の既定閾値は何 MB 相当？（小数で）';
const A2_TEXT = '1000 ページ ≒ 12.5 MB 相当。';
const Q2_EXPECTED = '12.5';
const Q2_INPUT = '12.50';

const Q3_TEXT = 'WAL を有効化する PRAGMA の名前は？';
const A3_TEXT = 'journal_mode を WAL にする。';
const Q3_EXPECTED = 'journal_mode';
const Q3_WRONG = 'synchronous';

/** `POST /api/learning/sets` の body（docs/specs/03-api.md §3） */
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

async function seedSet(request: APIRequestContext, body: object) {
  const res = await request.post('/api/learning/sets', { data: body });
  expect(res.status(), await res.text()).toBe(200);
}

/** `GET /api/days/{date}` の応答（docs/specs/03-api.md §3） */
function dayBody(date: string, done: boolean) {
  return {
    date,
    weekday: '水',
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

/** 問題カードは並び順で掴む（c32.3 と同じ） */
const card = (page: Page, index: number) => page.locator('.lx__card').nth(index);

/** ステッパーの段（`レッスン ─ 問題 ─ 採点 ─ 感想` の並び順・§3） */
const stepBox = (page: Page, index: number) => page.locator('.lx__steps .lx__step').nth(index);

/** 通過済みの段の戻りボタン（aria-label は「{段}に戻る」） */
const back = (page: Page, label: string) => page.getByRole('button', { name: label + 'に戻る' });

test('採点段 →「レッスン」で戻り →「採点」まで進み直しても回答入力と採点が保持される', async ({
  page,
  request,
}) => {
  const date = '2026-03-21';
  await seedSet(request, autoSetBody(date));
  const checkedIds = await stubDay(page, date);

  await page.goto(learningUrl(date));

  // --- レッスン → 問題（入力）→ 採点（自動○×＋△へ上書き）。ここまでは c32.3 の一本道
  await page.getByRole('button', { name: '問題へ' }).click();

  const choiceGroup = page.getByRole('radiogroup', { name: '問題1 の回答' });
  await choiceGroup.getByRole('radio', { name: Q1_EXPECTED }).check();
  await page.getByLabel('問題2 の回答').fill(Q2_INPUT);
  await page.getByLabel('問題3 の回答').fill(Q3_WRONG);

  await page.getByRole('button', { name: '採点へ' }).click();
  await expect(card(page, 0)).toContainText('自動採点 ○');
  await page.getByRole('button', { name: '問題1 の自己採点 △（曖昧）' }).click();

  // --- 通過済みの段をタップして戻る（§3）。採点段からは レッスン・問題 が押せる
  await expect(back(page, 'レッスン')).toBeVisible();
  await expect(back(page, '問題')).toBeVisible();
  await back(page, 'レッスン').click();

  // レッスン段に戻っている（採点段の要素は消えている）
  await expect(page.getByRole('heading', { name: '今日の学習 — ' + THEME })).toBeVisible();
  await expect(page.getByText(A1_TEXT)).toHaveCount(0);
  await expect(stepBox(page, 0)).toHaveAttribute('aria-current', 'step');
  // 戻った先では手前の段が無い＝押せる段もゼロ（§3。先へは飛び越せない）
  await expect(page.locator('.lx__steps button')).toHaveCount(0);

  // --- 問題まで進み直す: 回答入力が保持されている（§3.2 のローカル state）
  await page.getByRole('button', { name: '問題へ' }).click();
  await expect(choiceGroup.getByRole('radio', { name: Q1_EXPECTED })).toBeChecked();
  await expect(page.getByLabel('問題2 の回答')).toHaveValue(Q2_INPUT);
  await expect(page.getByLabel('問題3 の回答')).toHaveValue(Q3_WRONG);

  // --- 採点まで進み直す: 自動採点とタップ上書きが保持されている（§3.3）
  await page.getByRole('button', { name: '採点へ' }).click();
  await expect(card(page, 0)).toContainText('自動採点 ○');
  await expect(card(page, 1)).toContainText('自動採点 ○');
  await expect(card(page, 2)).toContainText('自動採点 ×');
  await expect(page.getByRole('button', { name: '問題1 の自己採点 △（曖昧）' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('button', { name: '感想へ' })).toBeEnabled();

  // 採点段 →「問題」へ戻っても同じく保持される（1段だけ戻る経路）
  await back(page, '問題').click();
  await expect(page.getByLabel('問題2 の回答')).toHaveValue(Q2_INPUT);
  await page.getByRole('button', { name: '採点へ' }).click();
  await expect(page.getByRole('button', { name: '問題1 の自己採点 △（曖昧）' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  // 戻り歩きの間は一切送信していない（採点はローカル state・§3.3）
  expect(checkedIds).toEqual([]);

  // --- 感想 → 完了。保持されていた値がそのまま記録される（§3.4）
  await page.getByRole('button', { name: '感想へ' }).click();
  await page
    .getByPlaceholder('どこで詰まった？何が腑に落ちた？（1〜2行）')
    .fill('戻ってやり直しても消えなかった');
  await page.getByRole('button', { name: '完了' }).click();

  await expect(page.getByText('記録しました。明日のセットに反映されます')).toBeVisible();
  expect(checkedIds).toEqual([TASK_ID]);

  const saved = await request.get('/api/learning/sets/' + date + '/result');
  expect(saved.status()).toBe(200);
  expect((await saved.json()).grades).toEqual([
    { no: 1, grade: 'd', answer: Q1_EXPECTED },
    { no: 2, grade: 'o', answer: Q2_INPUT },
    { no: 3, grade: 'x', answer: Q3_WRONG },
  ]);

  // 完了画面の段は押せない（§3.4。歩き終えた後の画面から戻す仕様は無い）
  await expect(page.locator('.lx__steps button')).toHaveCount(0);
});

test('未通過の先の段はタップで飛び越せない', async ({ page, request }) => {
  const date = '2026-03-22';
  await seedSet(request, autoSetBody(date));
  await stubDay(page, date);

  await page.goto(learningUrl(date));

  // --- レッスン段: 問題・採点・感想はどれも押せる要素になっていない（§3）
  for (const index of [1, 2, 3]) {
    await expect(stepBox(page, index).getByRole('button')).toHaveCount(0);
  }
  // 「感想」をタップしても遷移しない（レッスンのまま）
  await stepBox(page, 3).click();
  await expect(page.getByRole('heading', { name: '今日の学習 — ' + THEME })).toBeVisible();
  await expect(page.getByPlaceholder('どこで詰まった？何が腑に落ちた？（1〜2行）')).toHaveCount(0);
  await expect(stepBox(page, 0)).toHaveAttribute('aria-current', 'step');

  // --- 問題段: 手前の「レッスン」だけが押せる。「採点」「感想」は押せない
  await page.getByRole('button', { name: '問題へ' }).click();
  await expect(back(page, 'レッスン')).toBeVisible();
  for (const index of [2, 3]) {
    await expect(stepBox(page, index).getByRole('button')).toHaveCount(0);
  }
  await stepBox(page, 2).click();
  // 採点段へは行っていない（解答が開いていない）
  await expect(page.getByText(A1_TEXT)).toHaveCount(0);
  await expect(page.getByRole('button', { name: '採点へ' })).toBeVisible();
  await expect(stepBox(page, 1)).toHaveAttribute('aria-current', 'step');
});
