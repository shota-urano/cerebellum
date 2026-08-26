import Link from 'next/link';
import { actionCountOf, lastRunOf, type OfficeEmployee, type OfficeRun } from '../lib/office';

export type OfficeDeskSheetProps = {
  employees: OfficeEmployee[];
  runs: OfficeRun[];
};

/** 機械可読な承認待ちだけを集める、自分の机。 */
export function OfficeDeskSheet({ employees, runs }: OfficeDeskSheetProps) {
  const tasks = employees.flatMap((employee) => {
    const run = lastRunOf(runs, employee.automation_id);
    const count = actionCountOf(run);
    return run && count > 0 ? [{ employee, run, count }] : [];
  });
  const total = tasks.reduce((sum, task) => sum + task.count, 0);

  return (
    <div className="of3__desk-layer" role="presentation">
      <Link className="of2__sheet-backdrop" href="/office" scroll={false} aria-label="MY DESKを閉じる" />
      <section className="of3__desk-sheet" role="dialog" aria-modal="true" aria-labelledby="office-desk-title">
        <div className="of2__sheet-grip" aria-hidden="true" />
        <div className="of3__desk-sheet-head">
          <div>
            <p className="mono of3__desk-kicker">MY DESK</p>
            <h2 id="office-desk-title">承認待ち {total}件</h2>
          </div>
          <Link className="mono of2__sheet-close" href="/office" scroll={false}>閉じる</Link>
        </div>
        {tasks.length === 0 ? (
          <p className="of3__desk-empty">いま確認が必要な仕事はありません</p>
        ) : (
          <div className="of3__task-list">
            {tasks.map(({ employee, run, count }) => (
              <Link key={run.run_id} className="of3__task" href={`/office?desk=1&run=${encodeURIComponent(run.run_id)}`} scroll={false}>
                <span className="of3__task-count">{count}件</span>
                <strong>{employee.name}</strong>
                <span>{run.headline ?? '確認を待っています'}</span>
                <span className="mono of3__task-action">内容を確認</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
