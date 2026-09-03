import type {
  InboxDecisionInput,
  InboxItemDto,
  InboxItemsResponse,
  InboxKind,
} from '@/shared/api';

/**
 * kind の並びは **⚠異常 → ✅承認 → ☑選択 → 📄読む** で固定（docs/specs/25-web-inbox.md §3.2・§4）。
 * 急ぐものから並べる。**送信元ごとの並び・文言は持たない**——持った時点で
 * 「ハーネスごとの専用画面」が別の形で再発する（docs/specs/24-inbox.md §1）。
 */
export const KIND_ORDER: InboxKind[] = ['alert', 'approve', 'choose', 'read'];

/** グループ見出し（docs/specs/25-web-inbox.md §3.2 の表・kind で固定） */
export function kindLabel(kind: InboxKind) {
  switch (kind) {
    case 'alert':
      return '⚠ 異常';
    case 'approve':
      return '✅ 承認';
    case 'choose':
      return '☑ 選択';
    default:
      return '📄 読む';
  }
}

/**
 * 見出しの直下に出す「そこで押すと何が起きるか」の1行
 * （docs/specs/25-web-inbox.md §3.2 の表・kind で固定）。
 * タップの結果が送信元側の副作用なので、画面に書いていないと
 * 「何が起きるか分からないまま押す」ことになる（docs/specs/18-web-harness.md §3.2 と同じ原則）。
 */
export function kindEffect(kind: InboxKind) {
  switch (kind) {
    case 'alert':
      return '確認した印を付けるだけ。直すのは人間';
    case 'approve':
      return '✅した行だけを、その係が次の勤務で適用する';
    case 'choose':
      return '選んだ1つを、その係が次の勤務で使う';
    default:
      return '読んだ印を付けるだけ';
  }
}

/** 決定済みの行に出す「何を決めたか」（`choose` は選んだ選択肢の label で出す） */
export function decidedLabel(item: InboxItemDto) {
  switch (item.status) {
    case 'approved':
      return '✅ 承認';
    case 'rejected':
      return '❌ 却下';
    case 'chosen': {
      const chosen = item.options?.find((option) => option.id === item.choice);
      return '☑ ' + (chosen ? chosen.label : (item.choice ?? ''));
    }
    case 'read':
      return '📄 読んだ';
    case 'acknowledged':
      return '⚠ 確認済み';
    default:
      return '';
  }
}

/**
 * 過去日ビューの状態表示（docs/specs/29-web-inbox-history.md §3.2-2）。
 *
 * 未決の行も「未決」と**出すだけ**——決めるのは今日のビュー。操作口が2箇所あると、
 * 同じ項目の状態が2画面で動いて追えなくなる（同 §3.2-2・§4「決定は今日のビューだけが持つ」）。
 * 決着した行の文言は `decidedLabel()` をそのまま使う（25 §3.2 の言い方を二重に持たない）。
 */
export function stateLabel(item: InboxItemDto) {
  return item.status === 'open' ? '未決' : decidedLabel(item);
}

/**
 * 適用が動いた行か（docs/specs/25-web-inbox.md §3.2「`apply_state ≠ pending` になった行は戻せず」）。
 *
 * **`!== 'pending'` では判定できない**——`read` / `alert` は読み戻しが無いので
 * `apply_state = none` のまま決定・取り消しができる（docs/specs/24-inbox.md §3.3-2）。
 * 凍結されるのは機械が実際に動いた `applied` / `failed` だけ。
 */
export function isFrozen(item: InboxItemDto) {
  return item.applyState === 'applied' || item.applyState === 'failed';
}

/**
 * 3つの置き場所へ振り分ける（docs/specs/25-web-inbox.md §3.2・出どころは
 * docs/specs/29-web-inbox-history.md §3.1 で置き換え）。
 *
 * - `failed` … `?applyState=failed` の取得結果。**最上部**に日をまたいで出し続ける
 * - `pending` … 未決。`?status=open` から拾う（**日付では引かない**・29 §3.1-2）
 * - `decided` … 下部「今日決めたもの」。**`?date={その日}` の取得結果から `status !== 'open'`
 *   を抽出する**（29 §3.1-1）。`?status=open` のキャッシュ残骸からは拾わない
 *   ——残骸はそのタブが再取得するまでの見かけで、リロード・タブ復帰で落ちる（29 §1）
 *
 * `dated` が `undefined`（取得前・取得失敗）のとき `decided` は空。呼び出し側は
 * 「0件」と「取得できていない」を `datedError` で区別する（29 §6）。
 *
 * `pending` に出ている id を `decided` から落とすのは、決定 POST 直後の
 * **二重表示を作らない**ため——取り消しは `?status=open` へ応答差し込みで戻り（29 §3.1-3）、
 * `?date=` 側の再検証はその後に届くので、両方に載る瞬間がある。
 */
export function partition(
  open: InboxItemDto[],
  failed: InboxItemDto[],
  dated: InboxItemDto[] | undefined,
) {
  const failedIds = new Set(failed.map((item) => item.id));
  const pending = open.filter((item) => !failedIds.has(item.id) && item.status === 'open');
  const pendingIds = new Set(pending.map((item) => item.id));
  return {
    failed,
    pending,
    decided: (dated ?? []).filter(
      (item) =>
        item.status !== 'open' && !failedIds.has(item.id) && !pendingIds.has(item.id),
    ),
  };
}

/**
 * 未決を kind 別に束ねる。**未決0件のグループは見出しごと落とす**（§3.2）。
 * グループ内は送信元でまとめ、送信元内はサーバー返却順（新しい順）のまま
 * ——クライアントで再ソートしない（§4）。
 */
export function groupByKind(items: InboxItemDto[]) {
  return KIND_ORDER.map((kind) => ({
    kind,
    items: bySource(items.filter((item) => item.kind === kind)),
  })).filter((group) => group.items.length > 0);
}

/**
 * 送信元でまとめる（初出順を保つ安定並べ替え）。
 * 送信元の登場順そのものはサーバー返却順に従う＝ここでも「新しい順」を壊さない。
 */
function bySource(items: InboxItemDto[]) {
  const order: string[] = [];
  for (const item of items) if (!order.includes(item.source)) order.push(item.source);
  return order.flatMap((source) => items.filter((item) => item.source === source));
}

/** 名簿の1行（`source` = office.json の `employees[].skill`・docs/specs/24-inbox.md §3.1） */
export interface InboxRosterEntry {
  source: string;
  name: string;
}

/**
 * office.json から `source` → 表示名の対応を作る（docs/specs/25-web-inbox.md §3.2・§5）。
 *
 * **名簿の正本は second-brain の `SKILL.md` frontmatter**で、cerebellum は対応表を持たない
 * （docs/specs/21-web-office-roster.md §4）。取得が落ちたら `undefined` を返し、
 * 画面は「名簿と突き合わせられなかった」側に倒す（全員を未登録扱いにしない）。
 *
 * 引数は構造だけで受ける——office feature の型を import すると features 間の依存になる
 * （AGENTS.md ルール5）。組み合わせは app 層が行う（§5）。
 */
export function rosterOf(
  office: { employees: { skill: string | null; name: string }[] } | undefined,
): InboxRosterEntry[] | undefined {
  if (!office) return undefined;
  return office.employees
    .filter((employee): employee is { skill: string; name: string } => Boolean(employee.skill))
    .map((employee) => ({ source: employee.skill, name: employee.name }));
}

/** 行に出す送信元の見せ方（docs/specs/25-web-inbox.md §3.2・§3.4） */
export interface InboxSender {
  label: string;
  /** 名簿に無い（または名簿が読めていない）ので `source` を等幅で出す */
  mono: boolean;
  /** `名簿未登録` バッジを添える。**受信は正常に扱う**（§3.4） */
  unregistered: boolean;
}

/**
 * 送信元の表示名を決める（§3.2「名簿の `name`。名簿に無ければ `source` をそのまま等幅で」）。
 * 名簿が読めていないとき（`roster` が `undefined`）は等幅で出すだけでバッジは付けない
 * ——バッジは「`SKILL.md` に `office:` を書け」の催促なので、
 * 名簿を読めていない状態で出すと催促の意味が壊れる（§3.4）。
 */
export function senderOf(source: string, roster?: InboxRosterEntry[]): InboxSender {
  const found = roster?.find((entry) => entry.source === source);
  if (found) return { label: found.name, mono: false, unregistered: false };
  return { label: source, mono: true, unregistered: roster !== undefined };
}

/** ローカルタイムの `YYYY-MM-DD`（日付境界は深夜0時・Asia/Tokyo。docs/specs/00-overview.md §4） */
export function localToday(now: Date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
}

/** optimistic 表示用に1件の決定だけ差し替えた一覧を作る。 */
export function withDecision(
  list: InboxItemsResponse,
  id: number,
  decision: InboxDecisionInput,
): InboxItemsResponse {
  return {
    items: list.items.map((item) =>
      item.id === id
        ? { ...item, status: decision.status, choice: decision.choice ?? null }
        : item,
    ),
  };
}

/**
 * サーバーが返した1件で `?status=open` の一覧を更新する（decision の応答は単体なので合流させる）。
 *
 * **一覧に無い id なら足す**。「今日決めたもの」は `?date=` 由来になった（29 §3.1-1）ので、
 * 下段の行は `?status=open` のキャッシュに載っていない。そこから取り消したとき、
 * 置換だけでは未決グループへ戻らない——`?status=open` 側は再取得せず応答差し込みで済ませる
 * 契約（29 §3.1-3）なので、差し込みが「無ければ挿入」まで面倒を見る必要がある。
 *
 * 挿入位置はサーバーの並び（`date DESC, id DESC`・24 §3.4）に合わせる。クライアントで
 * 並べ替えない規律（25 §4）を破らないため、末尾に足して見かけの順を崩すことはしない。
 */
export function withItem(list: InboxItemsResponse, item: InboxItemDto): InboxItemsResponse {
  if (list.items.some((current) => current.id === item.id)) {
    return { items: list.items.map((current) => (current.id === item.id ? item : current)) };
  }
  const at = list.items.findIndex(
    (current) => current.date < item.date || (current.date === item.date && current.id < item.id),
  );
  const items = [...list.items];
  items.splice(at < 0 ? items.length : at, 0, item);
  return { items };
}
