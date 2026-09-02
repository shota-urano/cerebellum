/**
 * learning feature の公開 API（barrel）。外部からは必ずこのファイル経由で import する。
 *
 * 依存ルール（docs/specs/07-web-foundation.md §3）: features 間 import 禁止。
 * タスクの消し込みは day feature のトグルを使うので、`app/learning/page.tsx` が
 * 両者を合成する（docs/specs/15-web-learning.md §3.4）。
 */
export { LearningSession } from './components/LearningSession';
export type { LearningSessionProps } from './components/LearningSession';
/**
 * 「今日」第2段の状態1行（docs/specs/25-web-inbox.md §3.1・§5）。
 * `features/day` からは import せず、`app/page.tsx` が3段を並べる（features 間 import 禁止）。
 */
export { LearningTodayLine } from './components/LearningTodayLine';
export type { LearningTodayLineProps } from './components/LearningTodayLine';
