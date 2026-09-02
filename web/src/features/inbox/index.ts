/**
 * inbox feature の公開 API（barrel）。外部からは必ずこのファイル経由で import する。
 *
 * 依存ルール（docs/specs/07-web-foundation.md §3・AGENTS.md ルール5）: features 間 import 禁止。
 * 名簿（office.json）との突合に必要な取得は **app 層が `features/office` の `useOffice` で行い**、
 * ここへは `rosterOf()` で構造だけを渡す（docs/specs/25-web-inbox.md §5「app 層で組み合わせる」）。
 *
 * 「今日」第3段の `InboxSummaryStrip`（同 §5）は別タスクで足す。
 */
export { InboxView } from './components/InboxView';
export type { InboxViewProps } from './components/InboxView';
export { rosterOf } from './lib/item';
export type { InboxRosterEntry } from './lib/item';
/**
 * 未着判定（同 §3.3）。`shiftRosterOf()` も `rosterOf()` と同じく **office.json を構造で受ける**
 * ——取得は app 層の `useOffice`（office feature の barrel）が行う。
 */
export { shiftRosterOf } from './lib/missing';
export type { InboxMissingSource, InboxShiftEntry } from './lib/missing';
/** 送信元ごとの最終受信（同 §3.3-2 の受信側の根拠。「今日」第3段でも使う・§2） */
export { useInboxSummary } from './hooks/useInboxSummary';
