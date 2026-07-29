/**
 * dev feature の公開 API（barrel）。外部からは必ずこのファイル経由で import する。
 *
 * 依存ルール（docs/specs/07-web-foundation.md §3）: features 間 import 禁止。
 * run 詳細カードは nightshift feature からではなく `shared/ui/RunCard` を使う
 * （docs/specs/19-web-dev-history.md §3.3 の共通化）。
 */
export { DevView } from './components/DevView';
export type { DevViewProps } from './components/DevView';
