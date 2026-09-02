/**
 * inbox feature の公開 API（barrel）。外部からは必ずこのファイル経由で import する。
 *
 * 依存ルール（docs/specs/07-web-foundation.md §3・AGENTS.md ルール5）: features 間 import 禁止。
 * 名簿（office.json）との突合に必要な取得は **app 層が `features/office` の `useOffice` で行い**、
 * ここへは `rosterOf()` で構造だけを渡す（docs/specs/25-web-inbox.md §5「app 層で組み合わせる」）。
 *
 * 「今日」第3段の `InboxSummaryStrip` / `useInboxSummary`（同 §5）は別タスクで足す。
 */
export { InboxView } from './components/InboxView';
export type { InboxViewProps } from './components/InboxView';
export { rosterOf } from './lib/item';
export type { InboxRosterEntry } from './lib/item';
