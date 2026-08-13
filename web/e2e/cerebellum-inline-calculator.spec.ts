import { expect, test, type APIRequestContext } from '@playwright/test';

// cerebellum-inline-calculator [Frontend] 数値問題の計算メモ（docs/specs/15-web-learning.md §3.2）
//
// 受け入れ基準:
//   - 画面内キーとキーボードのどちらでも複数の式を計算し、問題ごとの履歴へ残せる
//   - 過去の任意の結果を次の式へ挿入できる
//   - 最新結果を切り上げて回答欄へ反映でき、その値で自動採点される
//   - レッスンへ戻って進み直しても、計算履歴と回答がローカル state に保持される
//   - 計算式や履歴を API へ追加送信しない（既存の回答値だけが採点対象）

const TASK_ID = '3f9a1c7b2e04';
const THEME = '目標回収期間からの逆算';
const QUESTION = '費用合計を上限CACで割り、最低獲得人数を求める。';

function learningSet(date: string) {
  return {
    date,
    theme: THEME,
    source: 'theme',
    lessonMd: '複数の途中計算を順番に行う。',
    problems: [
      {
        no: 1,
        kind: 'quiz',
        questionMd: QUESTION,
        answerMd: '正解は12人。',
        answerType: 'number',
        expected: '12',
        choices: null,
        workdir: null,
      },
    ],
    closingMd: null,
  };
}

async function seedSet(request: APIRequestContext, body: object) {
  const response = await request.post('/api/learning/sets', { data: body });
  expect(response.status(), await response.text()).toBe(200);
}

test('複数の途中計算を履歴へ残し、過去結果を再利用して切り上げた回答が保持・自動採点される', async ({
  page,
  request,
}) => {
  const date = '2026-03-23';
  await seedSet(request, learningSet(date));
  await page.goto('/learning?date=' + date + '&taskId=' + TASK_ID);
  await page.getByRole('button', { name: '問題へ' }).click();

  const answer = page.getByLabel('問題1 の回答');
  const calculator = page.locator('.lx__calc');
  const expression = page.getByLabel('問題1 の計算式');

  await expect(answer).toHaveValue('');
  await page.getByRole('button', { name: '計算メモを開く' }).click();

  // 1人あたり月の粗利。スマホ向けの画面内キーだけで入力する
  for (const key of ['3', '4', '8', '0', '−', '7', '0', '5']) {
    await calculator.getByRole('button', { name: key, exact: true }).click();
  }
  await calculator.getByRole('button', { name: '=', exact: true }).click();
  await expect(calculator.getByRole('listitem')).toHaveCount(1);
  await expect(calculator.getByRole('listitem').nth(0)).toContainText('= 2,775');

  // チャネル負担費用の合計。キーボード入力＋Enterでも計算できる
  await expression.fill('118000 + 35000 + 9000 / 3');
  await expression.press('Enter');
  await expect(calculator.getByRole('listitem')).toHaveCount(2);
  await expect(calculator.getByRole('listitem').nth(1)).toContainText('= 156,000');

  // 1件目の結果をタップで再利用して上限CACを計算
  await calculator.getByRole('button', { name: '計算1の結果 2775 を式に挿入' }).click();
  // 挿入後は入力欄の末尾へフォーカスし、物理キーボードへ切り替えても続けられる
  await expect(expression).toBeFocused();
  await expression.type('×5');
  await expression.press('Enter');
  await expect(calculator.getByRole('listitem').nth(2)).toContainText('= 13,875');

  // 費用合計と上限CACの両方を履歴から再利用して、必要人数を出す
  await calculator.getByRole('button', { name: '計算2の結果 156000 を式に挿入' }).click();
  await calculator.getByRole('button', { name: '÷', exact: true }).click();
  await calculator.getByRole('button', { name: '計算3の結果 13875 を式に挿入' }).click();
  await calculator.getByRole('button', { name: '=', exact: true }).click();
  await expect(calculator.getByRole('listitem')).toHaveCount(4);
  await expect(calculator.getByRole('listitem').nth(3)).toContainText('= 11.2432432432');

  await calculator.getByRole('button', { name: '切り上げ', exact: true }).click();
  await expect(answer).toHaveValue('12');
  await expect(calculator.getByText('回答に 12 を入力しました')).toBeVisible();

  // ステッパーでレッスンまで戻っても、親のローカル state に履歴と回答が残る
  await page.getByRole('button', { name: 'レッスンに戻る' }).click();
  await page.getByRole('button', { name: '問題へ' }).click();
  await expect(answer).toHaveValue('12');
  await expect(page.getByRole('button', { name: '計算メモを開く' })).toContainText('4件');
  await page.getByRole('button', { name: '計算メモを開く' }).click();
  await expect(calculator.getByRole('listitem')).toHaveCount(4);

  await page.getByRole('button', { name: '採点へ' }).click();
  await expect(page.locator('.lx__card')).toContainText('あなたの回答12');
  await expect(page.locator('.lx__card')).toContainText('自動採点 ○');
});
