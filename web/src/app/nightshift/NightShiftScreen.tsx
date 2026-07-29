'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useDay, useToggleCheck } from '@/features/day';
import { NightShiftView } from '@/features/nightshift';
import { ErrorBanner } from '@/shared/ui';

/**
 * 夜勤詳細の合成（docs/specs/13-web-nightshift.md）。
 * app 層が nightshift / day の両 feature を並べる（DigestScreen と同じ構図）。
 * `today` の実日付は day API の返す `date` で解決して NightShiftView に渡す
 * （夜勤ビューアの run_id は `YYYY-MM-DD-n` なので実日付が要る）。
 */
export function NightShiftScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const date = params.get('date') ?? 'today';
  // 「確認した」で消し込む元タスク。今日画面のシェブロンから渡ってくる
  const taskId = params.get('taskId');

  const { day, mutate } = useDay(date);
  const { toggle, toggleError } = useToggleCheck(day, mutate);

  const task = taskId ? day?.tasks.find((item) => item.id === taskId) : undefined;
  // 過去日は読み取り専用なので「確認した」を出さない（digest と同じ規則）
  const canCheck = task !== undefined && day?.readonly === false;

  const markChecked = async () => {
    if (!task) return;
    await toggle(task.id);
    router.push('/');
  };

  return (
    <main>
      {toggleError && <ErrorBanner message={toggleError.message} />}

      <div className="dg__bar">
        <Link className="mono btn" href="/">
          ◀ 今日へ
        </Link>
      </div>

      <NightShiftView date={day?.date} />

      {canCheck && (
        <div className="dg__bar dg__bar--end">
          <button type="button" className="mono btn btn--primary" onClick={() => void markChecked()}>
            {task.done ? '確認した（済）' : '確認した'}
          </button>
        </div>
      )}
    </main>
  );
}
