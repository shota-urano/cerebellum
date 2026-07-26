import type { DayResponse } from '@/shared/api';

/**
 * optimistic update 用に、1件のチェック状態を反転した日次レスポンスを作る（純関数）。
 * `progress.done` も同時に付け替える（ヘッダの数字とセグメントバーが即時連動する）。
 *
 * `checkedAt` は暫定値。POST 成功時はサーバーのレスポンスで丸ごと置き換わる。
 */
export function toggleTaskDone(day: DayResponse, taskId: string): DayResponse {
  const tasks = day.tasks.map((task) =>
    task.id === taskId
      ? { ...task, done: !task.done, checkedAt: task.done ? null : new Date().toISOString() }
      : task,
  );
  return {
    ...day,
    tasks,
    progress: { ...day.progress, done: tasks.filter((task) => task.done).length },
  };
}
