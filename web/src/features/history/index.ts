/**
 * history feature の公開 API（barrel）。外部からは必ずこのファイル経由で import する。
 *
 * 依存ルール（docs/specs/07 §3）: features 間 import 禁止。
 * タスク一覧は day feature を import せず `app/history/page.tsx` で合成する（docs/specs/09 §3）。
 */
export { InvalidDate } from './components/InvalidDate';
export { WeekSummary } from './components/WeekSummary';
export { useSummary } from './hooks/useSummary';
export { useToday } from './hooks/useToday';
export { isValidDateParam } from './lib/query';
