import type { IntakeCandidateDto, IntakeCandidatesResponse, IntakeLane, IntakeStatus } from '@/shared/api';

/**
 * レーンの並びは **ToDo → 考え → 口調** で固定（docs/specs/23-web-waiting.md §3.1）。
 * 日付ではなくレーンで束ねるのは、そのほうがタップの流れが速いため（同 §3.1）。
 */
export const LANE_ORDER: IntakeLane[] = ['todo', 'thought', 'tone'];

/** レーン見出し（docs/specs/23-web-waiting.md §3.1 の表） */
export function laneLabel(lane: IntakeLane) {
  switch (lane) {
    case 'todo':
      return '📌 ToDo';
    case 'thought':
      return '💭 考え';
    default:
      return '🗣 口調';
  }
}

/**
 * そのレーンの✅が何を起こすか（docs/specs/23-web-waiting.md §3.1）。
 * **押した先で何が起きるかを画面上で明示する**——タップの結果が Vault 側の副作用なので、
 * 画面に書いていないと「何が起きるか分からないまま押す」ことになる。
 */
export function laneEffect(lane: IntakeLane) {
  switch (lane) {
    case 'todo':
      return '✅した行は今晩 Linear へ起票されます';
    case 'thought':
      return '✅した行は 20_Insights に Insight として作られます';
    default:
      return '✅した行は 05_口調.md に追記されます';
  }
}

/** 未決をレーン別に束ねる。未決0件のレーンは**見出しごと落とす**（同 §3.1）。 */
export function groupByLane(items: IntakeCandidateDto[]) {
  return LANE_ORDER.map((lane) => ({
    lane,
    items: items.filter((item) => item.lane === lane),
  })).filter((group) => group.items.length > 0);
}

/**
 * 元ノートの日付を各行に添えるか（docs/specs/23-web-waiting.md §3.1）。
 * 複数日ぶんが残っているときだけ添える——1日ぶんしか無いのに全行へ日付を振ると、
 * 「持ち越しがある」という唯一の合図が薄まる。
 */
export function hasMultipleDates(items: IntakeCandidateDto[]) {
  return new Set(items.map((item) => item.date)).size > 1;
}

/**
 * 受信の状態（docs/specs/22-daily-intake.md §3.5 の3状態）。
 *
 * - `missing` … 今日の受信が無い＝**未着**（00:40 の実行が落ちたか POST 失敗）→ 異常表示
 * - `empty` … 今日の受信はあり、拾う行が0件だった → **正常**
 * - `received` … 今日の受信あり・候補あり
 *
 * `items` の空だけを見て「今日は候補なし」と書かないための判定。`latestReceivedAt` は
 * ISO8601（オフセット付き・ローカルタイム）なので、日付部分をそのまま比較する。
 */
export function deliveryStateOf(
  list: Pick<IntakeCandidatesResponse, 'latestReceivedAt' | 'latestItemCount'>,
  today: string,
): 'missing' | 'empty' | 'received' {
  if (!list.latestReceivedAt || list.latestReceivedAt.slice(0, 10) !== today) return 'missing';
  return list.latestItemCount === 0 ? 'empty' : 'received';
}

/** ローカルタイムの `YYYY-MM-DD`（日付境界は深夜0時・Asia/Tokyo。docs/specs/00-overview.md §4） */
export function localToday(now: Date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
}

/**
 * 承認操作が凍結された行か（docs/specs/23-web-waiting.md §4「適用済み行へのタップ → 無効化」）。
 * 適用が動いた行の承認はもう変えられない（サーバーも `bad_request`）。
 */
export function isFrozen(candidate: IntakeCandidateDto) {
  return candidate.applyState !== 'pending';
}

/** optimistic 表示用に1件の `status` だけ差し替えた一覧を作る。 */
export function withStatus(
  list: IntakeCandidatesResponse,
  id: number,
  status: IntakeStatus,
): IntakeCandidatesResponse {
  return {
    ...list,
    items: list.items.map((item) => (item.id === id ? { ...item, status } : item)),
  };
}

/**
 * サーバーが返した1件で一覧を置き換える（decision のレスポンスは単体なので合流させる）。
 *
 * **決着した行も一覧から消さない**（docs/specs/23-web-waiting.md §3.2）。✅/❌の直後に
 * 消えると誤タップを取り消せなくなるため、淡色で残して再タップで `proposed` に戻せるようにする。
 * 次回の再取得（`?status=proposed`）で自然に落ちる。
 */
export function withCandidate(
  list: IntakeCandidatesResponse,
  candidate: IntakeCandidateDto,
): IntakeCandidatesResponse {
  return {
    ...list,
    items: list.items.map((item) => (item.id === candidate.id ? candidate : item)),
  };
}
