'use client';

import { useState } from 'react';
import DateNav from '@/components/DateNav';
import TaskList from '@/components/TaskList';
import EmptyState from '@/components/EmptyState';
import WeekSummary from '@/components/WeekSummary';
import { snapshotFor } from '@/lib/data';
import { TODAY, shiftDate } from '@/lib/date';

export default function HistoryPage() {
  const [iso, setIso] = useState(shiftDate(TODAY, -1));
  const tasks = snapshotFor(iso);
  const done = tasks?.filter((t) => t.done).length ?? 0;

  return (
    <main>
      <DateNav
        iso={iso}
        canNext={iso < TODAY}
        onPrev={() => setIso(shiftDate(iso, -1))}
        onNext={() => setIso((cur) => (cur < TODAY ? shiftDate(cur, 1) : cur))}
      />

      <div className="ro">
        <span className="mono ro__badge">読み取り専用</span>
        <span className="ro__rule" />
        <span className="mono ro__count">{tasks ? done + ' / ' + tasks.length : '— / —'}</span>
      </div>

      {tasks ? (
        <TaskList tasks={tasks} style={{ marginTop: 14 }} />
      ) : (
        <EmptyState message="記録なし" style={{ marginTop: 14 }} />
      )}

      <WeekSummary selected={iso} onSelect={setIso} />
    </main>
  );
}
