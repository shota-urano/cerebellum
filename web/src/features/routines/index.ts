/**
 * routines feature の公開 API（barrel）。外部からは必ずこのファイル経由で import する。
 *
 * 依存ルール（docs/specs/07-web-foundation.md §3）: features 間 import 禁止。
 * 「今日」画面の行メタ規則は day feature から借りず、`lib/meta.ts` に持つ。
 */
export { RoutinesView } from './components/RoutinesView';
