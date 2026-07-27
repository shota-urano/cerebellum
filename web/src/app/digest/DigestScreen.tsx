'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useDay, useToggleCheck } from '@/features/day';
import { DigestView } from '@/features/digest';
import { ErrorBanner } from '@/shared/ui';

/**
 * ダイジェスト詳細の合成（docs/specs/12-web-digest.md）。
 * app 層が digest / day の両 feature を並べる（feature 間 import 禁止・docs/specs/07-web-foundation.md §3）。
 */
export function DigestScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const date = params.get('date') ?? 'today';
  const section = params.get('section') ?? undefined;
  // 「読んだ」で消し込む元タスク。今日画面のシェブロンから渡ってくる
  const taskId = params.get('taskId');

  const { day, mutate } = useDay(date);
  const { toggle, toggleError } = useToggleCheck(day, mutate);

  const task = taskId ? day?.tasks.find((item) => item.id === taskId) : undefined;
  // 過去日は読み取り専用なので「読んだ」を出さない（docs/specs/12-web-digest.md §3.2）
  const canCheck = task !== undefined && day?.readonly === false;

  const markRead = async () => {
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

      <DigestView date={date} section={section} />

      {canCheck && (
        <div className="dg__bar dg__bar--end">
          <button type="button" className="mono btn btn--primary" onClick={() => void markRead()}>
            {task.done ? '読んだ（済）' : '読んだ'}
          </button>
        </div>
      )}
    </main>
  );
}
