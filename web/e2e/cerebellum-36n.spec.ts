import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

// cerebellum-36n [Frontend] `/waiting`「あなた待ち」画面（レーン別・✅/❌・未着表示・失敗枠）
// 受け入れ基準（docs/specs/23-web-waiting.md §3・§4）:
//   ✅のトグル（proposed ⇄ approved）/ ❌（rejected）/ 決着カードが淡色で残ること /
//   レーン順（ToDo→考え→口調）と未決0レーンの省略 / 未着の赤帯 / 0件受信が正常表示 /
//   failed の先頭固定と赤帯
//
// 起動しているのは release バイナリ＋使い捨ての空 DB（playwright.config.ts）なので、
// 候補データは**実 API（POST /api/intake/candidates）で投入**する（docs/specs/03-api.md §3）。
//
// 並列実行の前提（fullyParallel）と、この画面固有の事情:
//   - 一覧は日付ではなく状態（`?status=proposed`）で引く（docs/specs/22-daily-intake.md §3.5）。
//     つまり**他テストが投入した未決も同じ画面に並ぶ**。よって
//     (a) 原文はテストごとに一意にする（region 名の重複で strict mode に触れない）
//     (b) 件数の検証はしない。存在・順序は自分が投入した行の相対関係で見る
//   - `latestReceivedAt` / `latestItemCount` は **DB 全体で最後の受信**（日付ごとではない）。
//     どれか1テストが POST した時点で「今日の受信あり」になるため、未着・0件の描き分けは
//     実 API では作れない。**この2つと、レーン構成の検証は GET を固定応答にして行う**
//     （検証対象は画面の描き分けそのものであり、サーバーの挙動は 22 側のテストが持つ）

/** 静的 export の遷移先は末尾スラッシュが付き得るので、比較前に落とす */
const pathnameOf = (url: string) => new URL(url).pathname.replace(/\/+$/, '') || '/';

type Lane = 'todo' | 'thought' | 'tone';

type SeedItem = { lane: Lane; text: string; note?: string | null; lineNo?: number | null };

type StoredItem = {
  id: number;
  date: string;
  slug: string;
  lane: Lane;
  text: string;
  note: string | null;
  lineNo: number | null;
  sourcePath: string;
  sourceNote: string | null;
  status: string;
  decidedAt: string | null;
  applyState: string;
  appliedAt: string | null;
  error: string | null;
  resultPath: string | null;
  resultUrl: string | null;
  receivedAt: string;
};

const sourcePathOf = (date: string) => '90_Meta/daily_intake/' + date + '.md';
const sourceNoteOf = (date: string) => '01_Daily/' + date + '.md';

/** その日の候補を投入し、保存後の行（id 付き）を返す。 */
async function seed(
  request: APIRequestContext,
  date: string,
  items: SeedItem[],
): Promise<StoredItem[]> {
  const res = await request.post('/api/intake/candidates', {
    data: { date, sourcePath: sourcePathOf(date), sourceNote: sourceNoteOf(date), items },
  });
  expect(res.status(), await res.text()).toBe(200);
  const body = (await res.json()) as { items: StoredItem[] };
  return body.items;
}

/** 画面を経由せず「承認済み・適用待ち」をサーバーから読む（＝今晩の適用が拾う集合）。 */
async function approvedTexts(request: APIRequestContext) {
  const res = await request.get('/api/intake/candidates?status=approved&applyState=pending');
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { items: StoredItem[] };
  return body.items.map((item) => item.text);
}

/** 未決一覧に残っている原文（リロード後に何が出るかの実状態）。 */
async function proposedTexts(request: APIRequestContext) {
  const res = await request.get('/api/intake/candidates?status=proposed');
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { items: StoredItem[] };
  return body.items.map((item) => item.text);
}

/** カードは `<section aria-label={text}>`＝role=region で引く。 */
const cardOf = (page: Page, text: string) => page.getByRole('region', { name: text });

/** 「未処理の失敗」枠（§3.4）。日付をまたいだ失敗がここに出る。 */
const failureFrame = (page: Page) => page.getByRole('region', { name: '未処理の失敗' });

/** 投入した行を原文で引く（見つからなければテストを落とす）。 */
function pick(items: StoredItem[], text: string): StoredItem {
  const found = items.find((item) => item.text === text);
  if (!found) throw new Error('投入した候補が見つからない: ' + text);
  return found;
}

/**
 * 未着の確定文言（docs/specs/23-web-waiting.md §4 の原文をそのまま写す）。
 * 仕様と1文字単位で揃えるのが主眼——文言は「何が起きているか」を人間に伝える唯一の手段で、
 * ここが緩むと「0件（正常）」と「届いていない（異常）」の区別が画面から消える。
 */
const NOT_RECEIVED_MESSAGE =
  '今晩の抽出が届いていません（daily-harness の停止か POST 失敗。ログ: ~/Library/Logs/second-brain-daily-intake.log）';

/** テスト間で原文が衝突しないようにする（一覧が日付を問わず全件出るため） */
const unique = (text: string, date: string) => text + '〔' + date + '〕';

// ---- 固定応答（描き分けの検証用） ----

/** ローカルタイムの ISO8601 風文字列。`latestReceivedAt` は日付部分だけ見られる（§3.5） */
function todayStamp() {
  const now = new Date();
  return now.toLocaleDateString('sv-SE') + 'T00:41:00+09:00';
}

function stubItem(overrides: Partial<StoredItem> & { id: number; lane: Lane; text: string }): StoredItem {
  return {
    date: '2026-08-28',
    slug: 'slug-' + overrides.id,
    note: null,
    lineNo: null,
    sourcePath: sourcePathOf('2026-08-28'),
    sourceNote: sourceNoteOf('2026-08-28'),
    status: 'proposed',
    decidedAt: null,
    applyState: 'pending',
    appliedAt: null,
    error: null,
    resultPath: null,
    resultUrl: null,
    receivedAt: todayStamp(),
    ...overrides,
  };
}

/**
 * 一覧 GET（未決・失敗の両方）を固定応答にする。
 * 未着・0件・レーン構成は「サーバー全体の最後の受信」に依存する（§3.5）ので、
 * 使い捨てとはいえ全 spec で共有する DB では実データで作れない。
 */
async function stubList(
  page: Page,
  proposed: {
    items: StoredItem[];
    latestDate: string | null;
    latestReceivedAt: string | null;
    latestItemCount: number | null;
  },
) {
  await page.route(
    (url) => url.pathname === '/api/intake/candidates' && url.searchParams.get('status') === 'proposed',
    (route) => route.fulfill({ json: proposed }),
  );
  await page.route(
    (url) =>
      url.pathname === '/api/intake/candidates' && url.searchParams.get('applyState') === 'failed',
    (route) =>
      route.fulfill({ json: { items: [], latestDate: null, latestReceivedAt: null, latestItemCount: null } }),
  );
}

// ---- 承認の記録（§3.2） ----

test('✅で approved になり、決着したカードは消えずに淡色で残る（再タップで取り消せる）', async ({
  page,
  request,
}) => {
  const date = '2026-08-01';
  const text = unique('「アイデアの原料は一人称の摩擦にしかない」', date);
  const other = unique('「口調は資産になる」', date);
  await seed(request, date, [
    { lane: 'thought', text, note: 'idea-forge の配線がまだ無い' },
    { lane: 'thought', text: other },
  ]);
  await page.goto('/waiting');

  await expect(page.getByRole('heading', { name: 'あなた待ち' })).toBeVisible();
  // ✅の締切と、❌・無操作の違いを常時出す（§3.2・§3.3）
  await expect(page.getByText('✅したものが今晩00:40に反映されます')).toBeVisible();

  const card = cardOf(page, text);
  // 原文と補足が出る（要約は存在しない・§3.2）
  await expect(card).toContainText('「アイデアの原料は一人称の摩擦にしかない」');
  await expect(card).toContainText('idea-forge の配線がまだ無い');

  const keep = card.getByRole('button', { name: '残す' });
  await expect(keep).toHaveAttribute('aria-pressed', 'false');

  // 表示は optimistic なので、サーバー側は poll で確定を待つ
  await keep.click();
  await expect(keep).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => approvedTexts(request)).toContain(text);

  // **決着してもカードは消えない**（淡色で残す＝誤タップの取り消し路・§3.2）
  await expect(card).toBeVisible();
  await expect(card).toHaveClass(/wt__card--decided/);

  // もう一度押すと proposed へ戻る（反映までは何度でも変えられる）
  await keep.click();
  await expect(keep).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(() => approvedTexts(request)).not.toContain(text);
  await expect(card).not.toHaveClass(/wt__card--decided/);

  // 隣のカードは巻き添えにならない
  await expect(cardOf(page, other).getByRole('button', { name: '残す' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );

  // 再取得すると未決一覧からは落ちる（`?status=proposed` で引くため・§3.2）
  await keep.click();
  await expect.poll(() => approvedTexts(request)).toContain(text);
  await page.reload();
  await expect(cardOf(page, text)).toHaveCount(0);
  await expect(cardOf(page, other)).toHaveCount(1);
});

test('❌（捨てる）で rejected になり、そこから取り消せる。今晩の適用対象にはならない', async ({
  page,
  request,
}) => {
  const date = '2026-08-02';
  const text = unique('「今日は疲れた」', date);
  await seed(request, date, [{ lane: 'thought', text }]);
  await page.goto('/waiting');

  const card = cardOf(page, text);
  await card.getByRole('button', { name: '捨てる' }).click();
  await expect(card).toHaveClass(/wt__card--decided/);

  // 取り消し導線が出る（❌と無操作を区別する・§3.2）
  const undo = card.getByRole('button', { name: '捨てるのを取り消す' });
  await expect(undo).toBeVisible();

  // ❌は「触らない」の意思表示（docs/specs/22-daily-intake.md §3.3）。
  // 承認済み集合には入らない＝候補ファイルへ書き戻されない
  expect(await approvedTexts(request)).not.toContain(text);

  await undo.click();
  await expect(card.getByRole('button', { name: '捨てる' })).toBeVisible();
  // 取り消せば未決に戻る（後日タップできる）
  await expect.poll(() => proposedTexts(request)).toContain(text);
});

test('decision の POST が失敗したら巻き戻してトーストを出し、「再試行」で反映される', async ({
  page,
  request,
}) => {
  const date = '2026-08-03';
  const text = unique('「関門を1画面に集めたい」', date);
  await seed(request, date, [{ lane: 'thought', text }]);
  await page.goto('/waiting');

  const keep = cardOf(page, text).getByRole('button', { name: '残す' });
  await expect(keep).toHaveAttribute('aria-pressed', 'false');

  // decision の POST だけを一時的に落とす（GET は通したままにして再検証を壊さない）
  const DECISION = '**/api/intake/candidates/*/decision';
  await page.route(DECISION, (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'internal', message: 'DB に書けませんでした' } }),
    }),
  );

  await keep.click();

  // ① トーストで理由と再試行を出す（§4）。
  //    先にこれを待つ——失敗の確定前に巻き戻しを見ると「まだ押していないだけ」でも通ってしまう
  const toast = page.locator('.toast');
  await expect(toast).toContainText('DB に書けませんでした');
  const retry = toast.getByRole('button', { name: '再試行' });
  await expect(retry).toBeVisible();

  // ② optimistic が巻き戻る（サーバー側も未決のまま）
  await expect(keep).toHaveAttribute('aria-pressed', 'false');
  expect(await approvedTexts(request)).not.toContain(text);

  // ③ 復旧後に「再試行」で同じ decision が通る
  await page.unroute(DECISION);
  await retry.click();
  await expect(keep).toHaveAttribute('aria-pressed', 'true');
  await expect(toast).toHaveCount(0);
  await expect.poll(() => approvedTexts(request)).toContain(text);
});

// ---- 反映失敗（§3.4） ----

test('failed の候補は「未処理の失敗」として先頭に固定され、赤帯＋error 全文が出て操作が無効になる', async ({
  page,
  request,
}) => {
  const date = '2026-08-04';
  const ERROR =
    '候補ファイルに一致する原文が見つかりません: 90_Meta/daily_intake/2026-08-04.md（原文が編集された可能性）';
  const failing = unique('「書き戻しに失敗する行」', date);
  const stored = await seed(request, date, [{ lane: 'tone', text: failing }]);
  const target = pick(stored, failing);

  // 機械が書く列（docs/specs/22-daily-intake.md §3.4）。承認 → 反映失敗の順でしか書けない
  expect(
    (
      await request.post(`/api/intake/candidates/${target.id}/decision`, {
        data: { status: 'approved' },
      })
    ).status(),
  ).toBe(200);
  const result = await request.post(`/api/intake/candidates/${target.id}/apply-result`, {
    data: { state: 'failed', error: ERROR },
  });
  expect(result.status(), await result.text()).toBe(200);

  await page.goto('/waiting');

  const frame = failureFrame(page);
  await expect(frame).toContainText('未処理の失敗');
  const failed = frame.getByRole('region', { name: failing });
  await expect(failed).toHaveCount(1);
  await expect(failed.locator('.wt__result')).toHaveCount(1);
  await expect(failed).toContainText('反映失敗');
  // error は切らずに全文出す（手で直すための情報・§3.4）
  await expect(failed).toContainText(ERROR);
  // 失敗行は日付をまたいで出続けるので、いつの分か分かるよう日付を併記する
  await expect(failed).toContainText(date);

  // 反映が動いた行の操作は「無効化して表示」（§4）。消さない
  await expect(failed.getByRole('button', { name: '残す' })).toBeDisabled();
  await expect(failed.getByRole('button', { name: '捨てる' })).toBeDisabled();

  // 失敗枠は未決レーンより上にある（下に埋もれると気づけない・§3.4）
  const failedBox = await failed.boundingBox();
  const lanes = page.locator('.wt__lane').first();
  if (await lanes.count()) {
    const laneBox = await lanes.boundingBox();
    expect(failedBox && laneBox && failedBox.y).toBeLessThan(laneBox ? laneBox.y : Infinity);
  }

  // 失敗行は `status = approved` なので未決一覧には現れない（重複しない）
  expect(await proposedTexts(request)).not.toContain(failing);
});

test('failed 一覧の取得が落ちても未決は出し、取得できなかったことを画面に出す', async ({
  page,
  request,
}) => {
  const date = '2026-08-05';
  const text = unique('「失敗一覧が落ちても作業は続く」', date);
  await seed(request, date, [{ lane: 'thought', text }]);

  // 「未処理の失敗」の取得だけを落とす。この枠は「失敗を見落とさないため」の仕掛けなので、
  // 取得が黙って落ちること自体が事故になる（§3.4・docs/specs/22 §3.5 の「沈黙させない」原則）
  await page.route(
    (url) =>
      url.pathname === '/api/intake/candidates' && url.searchParams.get('applyState') === 'failed',
    (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'internal', message: '失敗一覧を読めません' } }),
      }),
  );

  await page.goto('/waiting');

  // ① 取得できなかったことが画面に出る（黙って空にしない）
  const banner = page.locator('.banner');
  await expect(banner).toContainText('反映失敗を取得できませんでした');
  await expect(banner).toContainText('失敗一覧を読めません');

  // ② 未決の承認作業はそのまま続けられる
  const card = cardOf(page, text);
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: '残す' }).click();
  await expect.poll(() => approvedTexts(request)).toContain(text);
});

// ---- 受信の3状態（§4・docs/specs/22-daily-intake.md §3.5） ----

test('未着（今日の受信が無い）は赤帯で出し、「候補なし」とは書かない', async ({ page }) => {
  await stubList(page, { items: [], latestDate: null, latestReceivedAt: null, latestItemCount: null });
  await page.goto('/waiting');

  const banner = page.locator('.banner');
  await expect(banner).toHaveCount(1);
  // 文言は docs/specs/23-web-waiting.md §4 の確定文（1文字単位で一致させる）
  await expect(banner).toContainText(NOT_RECEIVED_MESSAGE);

  // 空リストを「候補なし」と書かない（沈黙させない・§4）
  await expect(page.getByText('拾う行はありませんでした')).toHaveCount(0);
  await expect(page.locator('.wt__card')).toHaveCount(0);
});

test('前日の受信はあるが今日が無い場合も未着として扱う（昨日の受信で黙らせない）', async ({ page }) => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  await stubList(page, {
    items: [],
    latestDate: '2026-08-26',
    latestReceivedAt: yesterday.toLocaleDateString('sv-SE') + 'T00:41:00+09:00',
    latestItemCount: 3,
  });
  await page.goto('/waiting');

  await expect(page.locator('.banner')).toContainText(NOT_RECEIVED_MESSAGE);
});

test('今日の受信があり0件だった日は正常表示（赤帯を出さない）', async ({ page }) => {
  await stubList(page, {
    items: [],
    latestDate: '2026-08-27',
    latestReceivedAt: todayStamp(),
    latestItemCount: 0,
  });
  await page.goto('/waiting');

  // 0件の日は正常（§4）。異常表示にしない
  await expect(page.getByText('前夜のノートから拾う行はありませんでした。')).toBeVisible();
  await expect(page.locator('.banner')).toHaveCount(0);
});

test('今日の受信があり未決が0件（全部タップ済み）なら「片付いています」と出す', async ({ page }) => {
  await stubList(page, {
    items: [],
    latestDate: '2026-08-27',
    latestReceivedAt: todayStamp(),
    latestItemCount: 4,
  });
  await page.goto('/waiting');

  await expect(page.getByText('今朝の分は片付いています。')).toBeVisible();
  await expect(page.locator('.banner')).toHaveCount(0);
});

// ---- レーン構成（§3.1） ----

test('レーンは ToDo → 考え → 口調 の順で、未決0件のレーンは見出しごと省く', async ({ page }) => {
  await stubList(page, {
    items: [
      // 意図的に「口調 → ToDo」の順で返す（並べ替えが画面側の責務であることを見る）
      stubItem({ id: 1, lane: 'tone', text: '「〜なんよな」' }),
      stubItem({ id: 2, lane: 'todo', text: '「週次2工程を automation に登録する」' }),
    ],
    latestDate: '2026-08-28',
    latestReceivedAt: todayStamp(),
    latestItemCount: 2,
  });
  await page.goto('/waiting');

  const lanes = page.locator('.wt__group--lane');
  const labels = await lanes.allInnerTexts();
  // 「考え」は0件なので見出しごと出ない（§3.1）
  expect(labels.map((label) => label.replace(/\s+/g, ' ').trim())).toEqual([
    '📌 ToDo 1',
    '🗣 口調 1',
  ]);

  // そのレーンの✅が何を起こすかを見出しの直下に明示する（§3.1）
  await expect(page.getByText('✅した行は今晩 Linear へ起票されます')).toBeVisible();
  await expect(page.getByText('✅した行は 05_口調.md に追記されます')).toBeVisible();
  await expect(page.getByText('✅した行は 20_Insights に Insight として作られます')).toHaveCount(0);
});

test('複数日ぶんが残っているときだけ、行に元ノートの日付を添える', async ({ page }) => {
  const carried = '「昨日タップし忘れた行」';
  const todayItem = '「今朝の行」';
  await stubList(page, {
    items: [
      stubItem({ id: 3, lane: 'thought', text: carried, date: '2026-08-26' }),
      stubItem({ id: 4, lane: 'thought', text: todayItem, date: '2026-08-28' }),
    ],
    latestDate: '2026-08-28',
    latestReceivedAt: todayStamp(),
    latestItemCount: 1,
  });
  await page.goto('/waiting');

  await expect(cardOf(page, carried)).toContainText('2026-08-26 のノート');
  await expect(cardOf(page, todayItem)).toContainText('2026-08-28 のノート');
});

test('1日ぶんだけのときは日付を添えない（持ち越しの合図を薄めない）', async ({ page }) => {
  const only = '「今朝の行だけ」';
  await stubList(page, {
    items: [stubItem({ id: 5, lane: 'thought', text: only, date: '2026-08-28' })],
    latestDate: '2026-08-28',
    latestReceivedAt: todayStamp(),
    latestItemCount: 1,
  });
  await page.goto('/waiting');

  await expect(cardOf(page, only)).toBeVisible();
  await expect(cardOf(page, only)).not.toContainText('のノート');
});

// ---- 出どころ（§3.2） ----

test('「出どころ」で候補ファイルのパスが開き、コピーできる（元ノートへのリンクは作らない）', async ({
  page,
  context,
  request,
}) => {
  const date = '2026-08-06';
  const text = unique('「出どころを確かめたい行」', date);
  await seed(request, date, [{ lane: 'thought', text }]);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/waiting');

  const card = cardOf(page, text);
  await expect(card.getByText(sourcePathOf(date))).toBeHidden();

  await card.getByRole('button', { name: '出どころ' }).click();
  await expect(card.getByText(sourcePathOf(date))).toBeVisible();

  // Vault を開くリンクは作らない（cerebellum は Vault を参照しない・§3.2）。
  // パスを渡すところまでが役目なので、**実際にクリップボードへ入ること**を見る
  await page.evaluate(() => navigator.clipboard.writeText('__まだコピーしていない__'));
  const copy = card.getByRole('button', { name: '候補ファイルのパスをコピー' });
  await copy.click();
  await expect(copy).toHaveText('コピー済');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(sourcePathOf(date));

  expect(pathnameOf(page.url())).toBe('/waiting');
});
