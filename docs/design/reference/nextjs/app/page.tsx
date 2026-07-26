'use client';

import HeaderPanel from '@/components/HeaderPanel';
import TaskList from '@/components/TaskList';
import AllClear from '@/components/AllClear';
import EmptyState from '@/components/EmptyState';
import ErrorBanner from '@/components/ErrorBanner';
import { TODAY } from '@/lib/date';
import { useTodayTasks } from '@/lib/useTodayTasks';

/** Vault 読み取りエラーの検証用フラグ。実運用では取得結果から立てる。 */
const VAULT_ERROR = false;

export default function TodayPage() {
  const { tasks, toggle } = useTodayTasks();
  const done = tasks.filter((t) => t.done).length;
  const total = tasks.length;

  return (
    <main>
      {VAULT_ERROR && <ErrorBanner message="Vault が読み取れません。同期完了後に自動で再試行します" />}

      <HeaderPanel iso={TODAY} done={done} total={total} />

      {total > 0 && done === total && <AllClear />}
      {total === 0 && <EmptyState message="今日のタスクはありません" style={{ marginTop: 12 }} />}

      {total > 0 && <TaskList tasks={tasks} onToggle={toggle} heading style={{ marginTop: 18 }} />}
    </main>
  );
}
