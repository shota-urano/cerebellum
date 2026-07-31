import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

// cerebellum-6ub.1 [Frontend] `/harness` 画面（提案カード・全文展開・承認トグル・適用結果帯・未着表示）
// 受け入れ基準（docs/specs/18-web-harness.md §3・§4）:
//   承認チェックのトグル（proposed ⇄ approved）/ 「見送る」/ 「全文を読む」のその場展開 /
//   killed カードに操作が無いこと / 未着（receivedAt: null）の赤帯 / failed カードの先頭固定と赤帯
//
// 起動しているのは release バイナリ＋使い捨ての空 DB（playwright.config.ts）なので、
// 提案データは**実 API（POST /api/harness/proposals）で投入**する（docs/specs/03-api.md §3）。
//
// 並列実行の前提（fullyParallel）:
//   - テストごとに別の日付を使う（同じ日付を共有すると再送 409 や承認状態の混線で落ちる）
//   - 「未処理の失敗」枠の取得元は `?applyState=failed`＝**日付を問わない全件**（§3.3）なので、
//     どのテストの画面にも他テストが作った失敗が現れる。よって
//     (a) slug / summary はテストごとに一意にする（region 名の重複で strict mode に触れない）
//     (b) 件数の検証は当日一覧（`.hn__list`）にスコープする

/** 静的 export の遷移先は末尾スラッシュが付き得るので、比較前に落とす */
const pathnameOf = (url: string) => new URL(url).pathname.replace(/\/+$/, '') || '/';

type SeedProposal = {
  slug: string;
  insightName: string;
  verdict: 'adopt' | 'experiment' | 'killed';
  category?: string | null;
  summary: string;
  challengeVerdict?: 'hold' | 'weaken' | 'refute' | null;
  challengeNote?: string | null;
  detailPath?: string;
  detailMd: string;
};

type StoredProposal = { id: number; slug: string; status: string; applyState: string };

/** その日の提案を投入し、保存後の行（id 付き）を返す。 */
async function seed(
  request: APIRequestContext,
  date: string,
  proposals: SeedProposal[],
  kind: 'daily' | 'prune' | 'model_switch' = 'daily',
): Promise<StoredProposal[]> {
  const res = await request.post('/api/harness/proposals', { data: { date, kind, proposals } });
  expect(res.status(), await res.text()).toBe(200);
  const body = (await res.json()) as { proposals: StoredProposal[] };
  return body.proposals;
}

/** 画面を経由せずサーバー上の status を読む（optimistic 表示ではなく実状態を見るため）。 */
async function statusOf(request: APIRequestContext, date: string, slug: string) {
  const res = await request.get('/api/harness/proposals?date=' + date);
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { proposals: StoredProposal[] };
  return body.proposals.find((item) => item.slug === slug)?.status;
}

/** カードは `<section aria-label={summary}>`＝role=region で引く。 */
const cardOf = (page: Page, summary: string) => page.getByRole('region', { name: summary });

/** 「未処理の失敗」枠（§3.3）。日付をまたいだ失敗がここに出る。 */
const failureFrame = (page: Page) => page.getByRole('region', { name: '未処理の失敗' });

/** 当日一覧（失敗行は上の枠へ移すので、ここには出ない）。 */
const dayCards = (page: Page) => page.locator('.hn__list .hn__card');

/** 投入した行を slug で引く（見つからなければテストを落とす）。 */
function pick(proposals: StoredProposal[], slug: string): StoredProposal {
  const found = proposals.find((item) => item.slug === slug);
  if (!found) throw new Error('投入した提案が見つからない: ' + slug);
  return found;
}

const ADOPT_NOTE = '合格ラインを数字で明確にしたうえで崩せなかった';
const ADOPT_PATH = '40_Projects/harness/判定/2026-06-01-検索状態外置き.md';

const ADOPT: SeedProposal = {
  slug: 'kensaku-jotai-sotooki',
  insightName: '検索状態のハーネス外置きで20Bが長期検索でフロンティア級に届く',
  verdict: 'adopt',
  category: '⑥実験（新機軸）',
  summary: 'AIに全部覚えさせず外にメモ帳を置く方式を採る',
  challengeVerdict: 'hold',
  challengeNote: ADOPT_NOTE,
  detailPath: ADOPT_PATH,
  detailMd: '# 判定\n\n本文の1段落目。\n\n- 根拠となる箇条書き\n- もう1本の根拠\n',
};

const EXPERIMENT: SeedProposal = {
  slug: 'sabuagento-heiretsu',
  insightName: 'サブエージェント並列化は評価契約とセットでのみ効く',
  verdict: 'experiment',
  category: '④並列化',
  summary: '並列化は評価契約を先に決めてから試す',
  challengeVerdict: 'weaken',
  challengeNote: '条件を絞れば通る',
  detailMd: '# 実験計画\n\n2週間で判定する。\n',
};

const KILLED: SeedProposal = {
  slug: 'zenbu-jido-ka',
  insightName: '全工程の自動化で人間の確認を無くせる',
  verdict: 'killed',
  summary: '確認を全部なくす案は見送り',
  detailMd: '# 却下理由\n\n復旧手段が無くなるため。\n',
};

/**
 * テスト間で slug / summary が衝突しないようにする。
 * 「未処理の失敗」枠が日付を問わず全件出す仕様（§3.3）なので、他テストのカードが
 * 同じ画面に並んでも role 名が一意であれば locator が曖昧にならない。
 */
function forDate(base: SeedProposal, date: string): SeedProposal {
  return { ...base, slug: base.slug + '-' + date, summary: base.summary + '〔' + date + '〕' };
}

test('承認チェックが proposed ⇄ approved でトグルし、リロード後もサーバー状態が残る', async ({
  page,
  request,
}) => {
  const date = '2026-06-01';
  const adopt = forDate(ADOPT, date);
  const experiment = forDate(EXPERIMENT, date);
  await seed(request, date, [adopt, experiment]);
  await page.goto('/harness?date=' + date);

  // 見出しは kind=daily の既定（docs/specs/18 §3）
  await expect(page.getByRole('heading', { name: 'ハーネス取り込み — ' + date })).toBeVisible();
  // 押した先で何が起きるかを常時表示（§3.2）
  await expect(page.getByText('チェックしたものが翌朝06:20に自動で適用されます')).toBeVisible();

  const card = cardOf(page, adopt.summary);
  // カードの中身: 判定バッジ（category 併記）・1行要約・敵対レビューの結論・Insight名（§3.1）
  await expect(card).toContainText('🟢 採用提案');
  await expect(card).toContainText('⑥実験（新機軸）');
  await expect(card).toContainText('⚔️ 崩せず');
  await expect(card).toContainText(ADOPT_NOTE);
  await expect(card).toContainText(adopt.insightName);

  const check = card.getByRole('button', { name: '採用する' });
  await expect(check).toHaveAttribute('aria-pressed', 'false');

  // 表示は optimistic なので、サーバー側は poll で確定を待つ（§3.2）
  await check.click();
  await expect(check).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => statusOf(request, date, adopt.slug)).toBe('approved');

  // もう一度押すと proposed へ戻る（翌朝の適用までは何度でも変えられる・§3.2）
  await check.click();
  await expect(check).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(() => statusOf(request, date, adopt.slug)).toBe('proposed');

  // 隣のカードは巻き添えにならない
  await expect(
    cardOf(page, experiment.summary).getByRole('button', { name: '採用する' }),
  ).toHaveAttribute('aria-pressed', 'false');

  // 再取得しても承認が残る（optimistic 表示ではなくサーバーに記録されている）
  await check.click();
  await expect(check).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => statusOf(request, date, adopt.slug)).toBe('approved');
  await page.reload();
  await expect(cardOf(page, adopt.summary).getByRole('button', { name: '採用する' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('「見送る」で rejected になり、そこから proposed へ戻せる', async ({ page, request }) => {
  const date = '2026-06-02';
  const experiment = forDate(EXPERIMENT, date);
  await seed(request, date, [experiment]);
  await page.goto('/harness?date=' + date);

  const card = cardOf(page, experiment.summary);
  await card.getByRole('button', { name: '見送る' }).click();
  await expect.poll(() => statusOf(request, date, experiment.slug)).toBe('rejected');

  // 見送りは消えずに残り、取り消し導線が出る（見送りと未決を区別する・§3.2）
  const undo = card.getByRole('button', { name: '見送りを取り消す' });
  await expect(undo).toBeVisible();
  await undo.click();
  await expect(card.getByRole('button', { name: '見送る' })).toBeVisible();
  await expect.poll(() => statusOf(request, date, experiment.slug)).toBe('proposed');
});

test('decision の POST が失敗したら巻き戻してトーストを出し、「再試行」で反映される', async ({
  page,
  request,
}) => {
  const date = '2026-06-08';
  const adopt = forDate(ADOPT, date);
  await seed(request, date, [adopt]);
  await page.goto('/harness?date=' + date);

  const check = cardOf(page, adopt.summary).getByRole('button', { name: '採用する' });
  await expect(check).toHaveAttribute('aria-pressed', 'false');

  // decision の POST だけを一時的に落とす（GET は通したままにして再検証を壊さない）
  const DECISION = '**/api/harness/proposals/*/decision';
  await page.route(DECISION, (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'internal', message: 'DB に書けませんでした' } }),
    }),
  );

  await check.click();

  // ① トーストで理由と再試行を出す（§4「トーストで再試行」）。
  //    先にこれを待つ——失敗の確定前に巻き戻しを見ると「まだ押していないだけ」でも通ってしまう
  const toast = page.locator('.toast');
  await expect(toast).toContainText('DB に書けませんでした');
  const retry = toast.getByRole('button', { name: '再試行' });
  await expect(retry).toBeVisible();

  // ② optimistic が巻き戻る（サーバー側も proposed のまま）
  await expect(check).toHaveAttribute('aria-pressed', 'false');
  expect(await statusOf(request, date, adopt.slug)).toBe('proposed');

  // ③ 復旧後に「再試行」で同じ decision が通り、トーストが消えて状態が反映される
  await page.unroute(DECISION);
  await retry.click();
  await expect(check).toHaveAttribute('aria-pressed', 'true');
  await expect(toast).toHaveCount(0);
  await expect.poll(() => statusOf(request, date, adopt.slug)).toBe('approved');
});

test('「全文を読む」でその場に detailMd が展開し、別画面へ遷移しない', async ({ page, request }) => {
  const date = '2026-06-03';
  const adopt = forDate(ADOPT, date);
  await seed(request, date, [adopt]);
  await page.goto('/harness?date=' + date);

  const card = cardOf(page, adopt.summary);
  await expect(card.getByText('本文の1段落目。')).toBeHidden();

  await card.getByRole('button', { name: '全文を読む' }).click();
  await expect(card.getByText('本文の1段落目。')).toBeVisible();
  await expect(card.getByText('根拠となる箇条書き')).toBeVisible();
  // detailPath は全文の末尾にコピーボタン付きで出る（§3.1）
  await expect(card.getByText(ADOPT_PATH)).toBeVisible();
  await expect(card.getByRole('button', { name: '判定文のパスをコピー' })).toBeVisible();

  // 遷移していない（1画面で片付ける導線を割らない・§3.1）
  expect(pathnameOf(page.url())).toBe('/harness');
  expect(new URL(page.url()).searchParams.get('date')).toBe(date);

  await card.getByRole('button', { name: '全文を閉じる' }).click();
  await expect(card.getByText('本文の1段落目。')).toBeHidden();
});

test('killed カードは淡色で承認操作を持たない（採用チェック・見送るが無い）', async ({ page, request }) => {
  const date = '2026-06-04';
  const adopt = forDate(ADOPT, date);
  const killedSeed = forDate(KILLED, date);
  await seed(request, date, [adopt, killedSeed]);
  await page.goto('/harness?date=' + date);

  const killed = cardOf(page, killedSeed.summary);
  await expect(killed).toContainText('⚫️ 見送り');
  await expect(killed).toHaveClass(/hn__card--killed/);
  // 承認操作は無い（§3.1 の表「操作なし」）。「全文を読む」は表示の開閉なので残る
  await expect(killed.getByRole('button', { name: '採用する' })).toHaveCount(0);
  await expect(killed.getByRole('button', { name: '見送る' })).toHaveCount(0);
  await expect(killed.getByRole('button', { name: '全文を読む' })).toHaveCount(1);

  // 対照: adopt のカードには両方ある
  const adoptCard = cardOf(page, adopt.summary);
  await expect(adoptCard.getByRole('button', { name: '採用する' })).toHaveCount(1);
  await expect(adoptCard.getByRole('button', { name: '見送る' })).toHaveCount(1);
});

test('未着（receivedAt: null）は赤帯で出し、「提案なし」とは書かない', async ({ page }) => {
  // 投入していない日＝ night-harness の POST が飛んでいない状態（§4・docs/specs/17 §3.5）
  await page.goto('/harness?date=2026-06-05');

  const banner = page.locator('.banner');
  await expect(banner).toHaveCount(1);
  await expect(banner).toContainText('今朝の判定が届いていません');
  await expect(banner).toContainText('~/Library/Logs/second-brain-harness.log');

  // 空リストを「提案なし」と書かない（沈黙させない・§4）
  await expect(page.getByText('提案なし')).toHaveCount(0);
  await expect(dayCards(page)).toHaveCount(0);
});

test('failed の提案は「未処理の失敗」として一覧の先頭に固定され、赤帯＋error 全文が出る（日付をまたいでも出る）', async ({
  page,
  request,
}) => {
  const date = '2026-06-06';
  const other = '2026-06-09';
  const ERROR = 'patch が当たりませんでした: 40_Projects/harness/判定/xxx.md hunk #2 失敗';
  const adopt = forDate(ADOPT, date);
  const experiment = forDate(EXPERIMENT, date);
  const stored = await seed(request, date, [adopt, experiment]);
  // 返却順で2件目の行を承認 → 適用失敗にする（機械が書く列。docs/specs/17 §3.4）
  const target = pick(stored, experiment.slug);
  expect(
    (
      await request.post(`/api/harness/proposals/${target.id}/decision`, {
        data: { status: 'approved' },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await request.post(`/api/harness/proposals/${target.id}/apply-result`, {
        data: { state: 'failed', error: ERROR },
      })
    ).status(),
  ).toBe(200);

  await page.goto('/harness?date=' + date);

  const frame = failureFrame(page);
  await expect(frame).toContainText('未処理の失敗');
  const failed = cardOf(page, experiment.summary);
  await expect(frame.getByRole('region', { name: experiment.summary })).toHaveCount(1);
  await expect(failed.locator('.hn__result--bad')).toHaveCount(1);
  await expect(failed).toContainText('適用失敗');
  // error は切らずに全文出す（原因が切れると手で直せない・§3.3）
  await expect(failed).toContainText(ERROR);
  // 適用が終わった行のチェックは無効（§4「適用済み行へのタップ」）
  await expect(failed.getByRole('button', { name: '採用する' })).toHaveCount(0);

  // 当日一覧には失敗行を出さない（上の枠へ移している）
  await expect(dayCards(page)).toHaveCount(1);
  await expect(dayCards(page).first()).toContainText(adopt.summary);

  // 返却順では2件目だが、失敗しているので一覧の先頭に来る（§3.3）
  // 他テストが作った失敗も同じ枠に並ぶので、位置は「自分の2枚の相対順」で見る
  const texts = await page.locator('.hn__card').allInnerTexts();
  const failedIndex = texts.findIndex((text) => text.includes(experiment.summary));
  const restIndex = texts.findIndex((text) => text.includes(adopt.summary));
  expect(failedIndex).toBeGreaterThanOrEqual(0);
  expect(failedIndex).toBeLessThan(restIndex);

  // 別の日の画面でも「未処理の失敗」として出続ける（取得元は ?applyState=failed・§3.3）。
  // 日付が併記されるので、いつの失敗か分かる
  const otherAdopt = forDate(ADOPT, other);
  await seed(request, other, [otherAdopt]);
  await page.goto('/harness?date=' + other);

  await expect(page.getByRole('heading', { name: 'ハーネス取り込み — ' + other })).toBeVisible();
  const carried = failureFrame(page).getByRole('region', { name: experiment.summary });
  await expect(carried).toHaveCount(1);
  await expect(carried).toContainText(date);
  await expect(carried).toContainText(ERROR);
  // その日の一覧はその日の分だけ
  await expect(dayCards(page)).toHaveCount(1);
  await expect(dayCards(page).first()).toContainText(otherAdopt.summary);
});

// ---- 今日画面からの導線（docs/specs/18-web-harness.md §2 の2経路のうちタスク行の側） ----
//
// `detailRef = harness.proposals` を持つ行はタップ領域が2つに割れる
// （docs/specs/12-web-digest.md §3.1 の作法。learning.session の先例は cerebellum-c32.1）:
//   - チェックリング                      → チェックのトグル（遷移しない）
//   - それ以外の面（内容・メタ・シェブロン） → /harness?date=&taskId= へ遷移
//
// なぜ日次 API の応答だけ固定するか（サーバは本物の release バイナリのまま）:
//   「今日」のスナップショットは最初の GET /api/days/today で確定し、以後は不変
//   （docs/specs/02-data-model.md §4・AGENTS.md ルール3）。E2E は使い捨て DB を全 spec で
//   共有し、他の spec も `/` を開く（＝空のスナップショットを確定させる）ため、ルーティン API に
//   detail_ref 付きの行を足しても今日の確定済みスナップショットには入らない——入るかどうかが
//   spec の実行順に依存する（flaky）。検証対象は TaskRow の分岐なので日次 API だけ固定する。

/** task_id は sha1 先頭12桁（docs/specs/02-data-model.md §3） */
const HARNESS_TASK_ID = 'c4e17a90b3d6';
const HARNESS_CONTENT = 'ハーネス取り込み判定の承認';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

/** `GET /api/days/today` / `POST .../checks/{taskId}` の応答（docs/specs/03-api.md §3） */
function dayBody(doneTaskId: string | null) {
  const now = new Date();
  return {
    date: now.toLocaleDateString('sv-SE'), // ローカルタイムの YYYY-MM-DD
    weekday: WEEKDAYS[now.getDay()],
    readonly: false,
    progress: { done: doneTaskId ? 1 : 0, total: 1 },
    tasks: [
      {
        id: HARNESS_TASK_ID,
        time: '6:50',
        effort: '5分',
        tool: 'cerebellum',
        content: HARNESS_CONTENT,
        done: doneTaskId === HARNESS_TASK_ID,
        checkedAt: doneTaskId === HARNESS_TASK_ID ? now.toISOString() : null,
        detailRef: 'harness.proposals',
      },
    ],
  };
}

/**
 * 今日の日次 API を固定応答にする。チェックの POST は呼ばれた taskId を記録したうえで、
 * 本物と同じく「トグル後のその日」を返す。
 */
async function stubToday(page: Page) {
  const checkedIds: string[] = [];

  await page.route('**/api/days/today', (route) => route.fulfill({ json: dayBody(null) }));
  await page.route('**/api/days/today/checks/*', (route) => {
    const taskId = decodeURIComponent(new URL(route.request().url()).pathname.split('/').pop() ?? '');
    checkedIds.push(taskId);
    return route.fulfill({ json: dayBody(taskId) });
  });

  return checkedIds;
}

test('harness.proposals の行は面をタップすると /harness へ遷移する', async ({ page }) => {
  const checkedIds = await stubToday(page);

  // 開始地点は「今日」画面（遷移先の /harness とは別の画面）
  await page.goto('/');
  expect(pathnameOf(page.url())).toBe('/');

  const link = page.getByRole('link', { name: HARNESS_CONTENT + ' の詳細を開く' });
  await expect(link).toBeVisible();
  await link.click();

  await page.waitForURL((url) => pathnameOf(url.toString()) === '/harness');

  // docs/specs/18-web-harness.md §2: /harness?date=&taskId=
  const params = new URL(page.url()).searchParams;
  expect(params.get('date')).toBe('today');
  expect(params.get('taskId')).toBe(HARNESS_TASK_ID);

  // ダイジェスト詳細（catch-all の遷移先）へ落ちていない
  expect(params.get('section')).toBeNull();
  // 実際にハーネス画面が描画されている（URL だけ合っている状態と区別する）
  await expect(page.getByRole('heading', { name: /^ハーネス取り込み — / })).toBeVisible();

  // 遷移はトグルを兼ねない（面タップで消し込まれると、承認する前に記録が確定してしまう）
  expect(checkedIds).toEqual([]);
});

test('harness.proposals の行のリングはトグルだけで、遷移しない', async ({ page }) => {
  const checkedIds = await stubToday(page);

  await page.goto('/');

  const ring = page.getByRole('button', { name: HARNESS_CONTENT + ' のチェックを切り替える' });
  await expect(ring).toHaveAttribute('aria-pressed', 'false');

  const checked = page.waitForResponse((res) => res.url().includes('/api/days/today/checks/'));
  await ring.click();
  await checked;

  // トグルされ（optimistic → POST 応答）、「今日」画面に留まる
  await expect(ring).toHaveAttribute('aria-pressed', 'true');
  expect(pathnameOf(page.url())).toBe('/');
  expect(checkedIds).toEqual([HARNESS_TASK_ID]);
});

test('kind=prune の日は見出しが「資産剪定」に差し替わる', async ({ page, request }) => {
  const date = '2026-06-07';
  const adopt = { ...forDate(ADOPT, date), slug: 'furui-skill-archive-' + date };
  await seed(request, date, [adopt], 'prune');
  await page.goto('/harness?date=' + date);

  await expect(page.getByRole('heading', { name: '資産剪定 — ' + date })).toBeVisible();
  // カードの構造・操作は daily と同じ（§4）
  await expect(cardOf(page, adopt.summary).getByRole('button', { name: '採用する' })).toHaveCount(1);
});
