import type { SummaryDayDto } from '@/shared/api';
import { shiftDate } from '@/shared/lib';

/** サマリの対象日数（直近7日固定。docs/specs/09 §4） */
export const WEEK_DAYS = 7;

/** 記録なしの日は `done`/`total` が null（docs/specs/03 §3: 存在する日のみ返る） */
export type WeekRow = {
  iso: string;
  /** `MM-DD` 表記（`docs/design/03-history.md` コンポーネント一覧） */
  date: string;
  done: number | null;
  total: number | null;
};

/** `today` を末尾にした直近7日（日付昇順）。サマリに無い日は「記録なし」行にする。 */
export function buildWeek(today: string, summary: SummaryDayDto[]): WeekRow[] {
  const byDate = new Map(summary.map((day) => [day.date, day]));
  return Array.from({ length: WEEK_DAYS }, (_, i) => {
    const iso = shiftDate(today, i - (WEEK_DAYS - 1));
    const hit = byDate.get(iso);
    return {
      iso,
      date: iso.slice(5),
      done: hit ? hit.done : null,
      total: hit ? hit.total : null,
    };
  });
}
