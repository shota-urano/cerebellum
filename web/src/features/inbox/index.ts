/**
 * inbox feature の公開 API（barrel）。外部からは必ずこのファイル経由で import する。
 *
 * 依存ルール（docs/specs/07-web-foundation.md §3・AGENTS.md ルール5）: features 間 import 禁止。
 * 名簿（office.json）との突合に必要な取得は **app 層が `features/office` の `useOffice` で行い**、
 * ここへは `rosterOf()` で構造だけを渡す（docs/specs/25-web-inbox.md §5「app 層で組み合わせる」）。
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
/**
 * 「今日」第3段（同 §3.1・§5）。件数と未着行だけを出す表示部品で、
 * 取得（`useInboxSummary`）と名簿突合（`missingSources`）は **app 層が行う**
 * ——第1段の赤点も同じ集計を読むので、同じ問いを2回しないため（§5）。
 */
export { InboxSummaryStrip } from './components/InboxSummaryStrip';
export type { InboxSummaryStripProps } from './components/InboxSummaryStrip';
export { missingSources } from './lib/missing';
/** 赤点の条件（同 §3.1）。`alert` の未決・未着・`applyState=failed` のいずれか */
export { hasInboxAlert } from './lib/summary';
/**
 * ドロワーの「あなた待ち」バッジの件数（同 §3.5）。集計だけを公開し、**ドロワー自身は
 * inbox を import しない**（`shared/ui` はナビゲーションのみ・docs/specs/16 §5）——
 * 取得と受け渡しは app 層（`app/AppHud.tsx`）が行う。
 */
export { openTotal } from './lib/summary';
