/**
 * nightshift feature の公開 API（barrel）。外部からは必ずこのファイル経由で import する。
 *
 * 依存ルール（docs/specs/07-web-foundation.md §3）: features 間 import 禁止。
 * 「確認した」チェックは day feature のトグルを使うので、`app/nightshift/page.tsx` が
 * 両者を合成する（digest と同じ構図。docs/specs/13-web-nightshift.md）。
 */
export { NightShiftView } from './components/NightShiftView';
export type { NightShiftViewProps } from './components/NightShiftView';
