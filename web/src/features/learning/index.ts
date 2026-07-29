/**
 * learning feature の公開 API（barrel）。外部からは必ずこのファイル経由で import する。
 *
 * 依存ルール（docs/specs/07-web-foundation.md §3）: features 間 import 禁止。
 * タスクの消し込みは day feature のトグルを使うので、`app/learning/page.tsx` が
 * 両者を合成する（docs/specs/15-web-learning.md §3.4）。
 */
export { LearningSession } from './components/LearningSession';
export type { LearningSessionProps } from './components/LearningSession';
