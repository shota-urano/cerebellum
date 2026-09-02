/**
 * office feature の公開 API（barrel）。外部からは必ずこのファイル経由で import する。
 *
 * 依存ルール（docs/specs/07-web-foundation.md §3）: features 間 import 禁止。
 * :48310 への接続規則は `shared/api` の `viewerBase()` を流用する（docs/specs/20 §4）。
 * `shared/ui/RunCard` は流用しない（automation の run は dev-loop の run と形が違う・§5）。
 */
export { OfficeView } from './components/OfficeView';
/**
 * office.json の取得口。「あなた待ち」（docs/specs/25-web-inbox.md §5）が名簿との突合に使う。
 * **取得経路を重複実装しない**ために公開する。合成は app 層で行うので、
 * features 間 import は生まれない（同 §5）。
 */
export { useOffice } from './hooks/useOffice';
