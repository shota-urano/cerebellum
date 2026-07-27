/**
 * day feature の公開 API（barrel）。外部からは必ずこのファイル経由で import する。
 *
 * 依存ルール（docs/specs/07 §3）: features 間 import 禁止。
 * 履歴画面は history feature からではなく `app/history/page.tsx` で `DayView` を
 * readonly モードで合成する（docs/specs/09 §3）。
 */
export { DayView } from './components/DayView';
export type { DayViewProps } from './components/DayView';
/**
 * ダイジェスト詳細の「読んだ」チェックが使う（docs/specs/12-web-digest.md §5）。
 * digest feature からは import せず、`app/digest/page.tsx` が合成する。
 */
export { useDay } from './hooks/useDay';
export { useToggleCheck } from './hooks/useToggleCheck';
