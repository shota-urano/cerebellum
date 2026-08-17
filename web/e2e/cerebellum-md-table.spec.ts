import { expect, test, type APIRequestContext } from '@playwright/test';

// cerebellum-md-table [Frontend] md のパイプテーブル描画（docs/specs/07-web-foundation.md §4）
//
// 受け入れ基準:
//   - `| A | B |` が段落テキストのままではなく表として描画される（罫線行も本文に出ない）
//   - 区切り行の `:` による整列指定は読み飛ばし、セル数が食い違う行も列がずれない
//   - 3列以上の表はスマホ幅で横スクロールできる（本文レイアウトを広げない）
//   - 2列の表はスマホ幅で「ラベル 値」の縦積みになり、表としての構造は保たれる

const TASK_ID = '7c1d4e9a5b83';
const THEME = '数字を表で読む';

const LESSON_MD = [
  '先月と今月を並べて読む。',
  '',
  '| 獲得チャネル | 先月の実績（2026-07） | 今月の実績（2026-08） |',
  '|---|---:|---|',
  '| 検索広告 | 128人 | 154人 |',
  '| 紹介 | 41人 | 62人 |',
  '| 直接流入 |',
  '',
  '差分の大きい行から見る。',
].join('\n');

const QUESTION_MD = [
  '次の表から粗利額を求める。',
  '',
  '| 項目 | 値 |',
  '|---|---|',
  '| 月次売上 | 1,240,000円 |',
  '| 粗利率 | 42% |',
  '| 表記 | 売上\\|粗利 |',
].join('\n');

function learningSet(date: string) {
  return {
    date,
    theme: THEME,
    source: 'theme',
    lessonMd: LESSON_MD,
    problems: [
      {
        no: 1,
        kind: 'quiz',
        questionMd: QUESTION_MD,
        answerMd: '520,800円。',
        answerType: null,
        expected: null,
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

test('md のテーブルが表として描画され、3列は横スクロール・2列はスマホ幅で縦積みになる', async ({
  page,
  request,
}) => {
  const date = '2026-04-14';
  await seedSet(request, learningSet(date));
  await page.goto('/learning?date=' + date + '&taskId=' + TASK_ID);

  // レッスンの3列表。罫線行や生のパイプが本文へ漏れない
  const lesson = page.locator('.md').first();
  await expect(lesson).not.toContainText('|---|');
  // 段落として残るのは表の前後の地の文だけ（表の行が段落へ落ちていない）
  await expect(lesson.locator('.md__p')).toHaveText([
    '先月と今月を並べて読む。',
    '差分の大きい行から見る。',
  ]);

  const wide = lesson.getByRole('table');
  await expect(wide.getByRole('columnheader')).toHaveText([
    '獲得チャネル',
    '先月の実績（2026-07）',
    '今月の実績（2026-08）',
  ]);
  await expect(wide.getByRole('row')).toHaveCount(4); // ヘッダ＋データ3行
  await expect(wide.getByRole('cell', { name: '154人', exact: true })).toBeVisible();

  // セルが1つしかない行も3列に揃う（不足は空セル）。列がずれない
  const short = wide.getByRole('row').nth(3);
  await expect(short.getByRole('cell')).toHaveCount(3);
  await expect(short.getByRole('cell').nth(0)).toHaveText('直接流入');
  await expect(short.getByRole('cell').nth(2)).toHaveText('');

  // 3列表はスマホ幅（390px）で横スクロール。本文カラム自体は広がらない
  const overflow = await wide.evaluate((table) => {
    const wrap = table.parentElement as HTMLElement;
    return { scroll: wrap.scrollWidth, client: wrap.clientWidth, body: document.body.scrollWidth };
  });
  expect(overflow.scroll).toBeGreaterThan(overflow.client);
  expect(overflow.body).toBeLessThanOrEqual(390);

  // 問題段の2列表は縦積み。ヘッダ行は畳まれ、各セルの前に列名が出る
  await page.getByRole('button', { name: '問題へ' }).click();
  const narrow = page.locator('.md__table--stack');
  // 縦積みでは列名（::before）もセルの読み上げに乗る＝「値 1,240,000円」
  await expect(narrow.getByRole('cell', { name: '値 1,240,000円', exact: true })).toBeVisible();

  const stacked = await narrow.evaluate((table) => {
    const cell = table.querySelector('tbody .md__td') as HTMLElement;
    return {
      head: getComputedStyle(table.querySelector('thead') as HTMLElement).position,
      display: getComputedStyle(cell).display,
      label: getComputedStyle(cell, '::before').content,
    };
  });
  expect(stacked.display).toBe('block');
  expect(stacked.head).toBe('absolute'); // 視覚的には畳むが DOM からは消さない
  expect(stacked.label).toContain('項目');

  // エスケープしたパイプはセル内の文字として残る（列が増えない）
  await expect(narrow.getByRole('cell', { name: '値 売上|粗利', exact: true })).toBeVisible();
  await expect(narrow.getByRole('row')).toHaveCount(4);
});
