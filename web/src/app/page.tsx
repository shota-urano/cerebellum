import { DayView } from '@/features/day';

/** 「今日」画面（docs/specs/08）。app 層は feature を合成するだけ（docs/specs/07 §3）。 */
export default function TodayPage() {
  return (
    <main>
      <DayView date="today" />
    </main>
  );
}
