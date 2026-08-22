/**
 * office feature の公開 API（barrel）。外部からは必ずこのファイル経由で import する。
 *
 * 依存ルール（docs/specs/07-web-foundation.md §3）: features 間 import 禁止。
 * :48310 への接続規則は `shared/api` の `viewerBase()` を流用する（docs/specs/20 §4）。
 * `shared/ui/RunCard` は流用しない（automation の run は dev-loop の run と形が違う・§5）。
 */
export { OfficeView } from './components/OfficeView';
