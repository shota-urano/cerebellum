'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { DayView } from '@/features/day';
import { DateNav, InvalidDate, WeekSummary, isValidDateParam, useToday } from '@/features/history';
import { shiftDate } from '@/shared/lib';

/**
 * 「履歴」画面の合成（docs/specs/09）。app 層が day / history の両 feature を並べる
 * （history が day を import しない。docs/specs/07 §3）。
 * 組み立て順は `docs/design/03-history.md`「レイアウト構造」に従う。
 */
export function HistoryScreen() {
  const router = useRouter();
  const dateParam = useSearchParams().get('date');
  const { today } = useToday();

  if (dateParam !== null && !isValidDateParam(dateParam)) {
    return (
      <main>
        <InvalidDate />
      </main>
    );
  }

  // date 省略時は今日（docs/specs/09 §3）。「今日」はサーバー由来なので取得までは null。
  const iso = dateParam ?? today ?? null;
  const canNext = iso !== null && today !== undefined && iso < today;
  const goto = (date: string) => router.push('/history?date=' + date);

  return (
    <main>
      <DateNav
        iso={iso}
        canNext={canNext}
        onPrev={() => iso !== null && goto(shiftDate(iso, -1))}
        onNext={() => canNext && iso !== null && goto(shiftDate(iso, 1))}
      />

      {/* 今日だけトグル可（docs/specs/09 §3）。過去日はサーバーも readonly:true を返す */}
      <DayView date={dateParam ?? 'today'} readonly={iso === null || iso !== today} />

      <WeekSummary selected={iso} onSelect={goto} />
    </main>
  );
}
