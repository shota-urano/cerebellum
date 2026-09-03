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
 * 「今日」画面は2つの間に WAITING・LEARNING を挟むので、`DayView` ではなくこの2つを
 * `app/page.tsx` が直接並べる（docs/specs/30-web-today-order.md §3.1・§5）。
 * 並べるのは app 層の仕事なので、他 feature からこの2つを import しない（同 §5・07 §3）。
 */
export { DayHeader } from './components/DayHeader';
export type { DayHeaderProps } from './components/DayHeader';
export { DayTasks } from './components/DayTasks';
export type { DayTasksProps } from './components/DayTasks';
/**
 * ダイジェスト詳細の「読んだ」チェックが使う（docs/specs/12-web-digest.md §5）。
 * digest feature からは import せず、`app/digest/page.tsx` が合成する。
 */
export { useDay } from './hooks/useDay';
export { useToggleCheck } from './hooks/useToggleCheck';
