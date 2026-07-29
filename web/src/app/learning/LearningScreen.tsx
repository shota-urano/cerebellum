'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import { useDay, useToggleCheck } from '@/features/day';
import { LearningSession } from '@/features/learning';
import { ErrorBanner } from '@/shared/ui';

/**
 * 学習セッションの合成（docs/specs/15-web-learning.md）。
 * app 層が learning / day の両 feature を並べる（DigestScreen と同じ構図・同 §5）。
 */
export function LearningScreen() {
  const params = useSearchParams();
  const date = params.get('date') ?? 'today';
  // 記録できたら消し込む元タスク。今日画面の行タップから渡ってくる（同 §2）
  const taskId = params.get('taskId');

  const { day, mutate } = useDay(date);
  const { toggle, toggleError } = useToggleCheck(day, mutate);

  const task = taskId ? day?.tasks.find((item) => item.id === taskId) : undefined;

  /**
   * 記録が成功した後にだけ呼ばれる（同 §3.4 ②）。
   * - `taskId` が無いクエリ、または過去日（readonly）は消し込まない
   * - 既に done のタスクはトグルしない（やり直しで未消化に戻ってしまうため）
   */
  const checkOff = useCallback(async () => {
    if (!task || task.done || day?.readonly !== false) return;
    await toggle(task.id);
  }, [day?.readonly, task, toggle]);

  return (
    <main>
      {toggleError && <ErrorBanner message={toggleError.message} />}

      <div className="dg__bar">
        <Link className="mono btn" href="/">
          ◀ 今日へ
        </Link>
      </div>

      <LearningSession date={date} onRecorded={checkOff} />
    </main>
  );
}
