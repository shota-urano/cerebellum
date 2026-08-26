/* eslint-disable @next/next/no-img-element -- Rust の静的 export 配信には Next Image optimizer が無いため */
import Link from 'next/link';
import {
  actionCountOf,
  lastRunOf,
  OFFICE_ROOMS,
  roomOf,
  shiftStateOf,
  type OfficeEmployee,
  type OfficeRoomId,
  type OfficeRun,
} from '../lib/office';

export type OfficeRoomViewProps = {
  roomId: OfficeRoomId;
  employees: OfficeEmployee[];
  runs: OfficeRun[];
  stopped: OfficeEmployee[];
  today: string;
  selectedRunId: string | null;
};

function stationAsset(employee: OfficeEmployee, failed: boolean) {
  if (failed) return '/images/office/employee-station-failed.png';
  const assets = [
    '/images/office/employee-station.png',
    '/images/office/employee-station-white.png',
    '/images/office/employee-station-gray.png',
  ];
  let hash = 0;
  for (const char of employee.automation_id) hash = (hash + char.charCodeAt(0)) % assets.length;
  return assets[hash];
}

function RoomStation({
  employee,
  run,
  today,
  roomId,
  stopped = false,
  selected,
}: {
  employee: OfficeEmployee;
  run: OfficeRun | undefined;
  today: string;
  roomId: OfficeRoomId;
  stopped?: boolean;
  selected: boolean;
}) {
  const state = stopped ? { label: '停止中', tone: 'neutral' as const } : shiftStateOf(employee, run, today);
  const actions = stopped ? 0 : actionCountOf(run);
  const content = (
    <>
      <span className="of3__worker-visual" aria-hidden="true">
        <img src={stationAsset(employee, state.tone === 'bad')} alt="" />
      </span>
      {actions > 0 && <span className="of3__worker-alert">確認待ち {actions}</span>}
      {actions === 0 && state.tone === 'live' && <span className="of3__worker-live">処理中…</span>}
      {actions === 0 && state.tone === 'bad' && <span className="of3__worker-bad">失敗</span>}
      <span className="of3__worker-name">{employee.name}</span>
      <span className="mono of3__worker-shift">{employee.shift?.label ?? '勤務時間未設定'}</span>
      {actions === 0 && state.tone !== 'live' && state.tone !== 'bad' && (
        <span className="mono of3__worker-meta">
          {'lastDate' in state && state.lastDate ? `直近 ${state.lastDate}` : state.label}
        </span>
      )}
      {actions === 0 && 'note' in state && state.note && <span className="mono of3__worker-meta">{state.note}</span>}
      {actions > 0 && <span className="of3__worker-copy">{run?.headline ?? '確認を待っています'}</span>}
    </>
  );
  const className = `of3__worker of3__worker--${state.tone}${actions > 0 ? ' of3__worker--action' : ''}${stopped ? ' of3__worker--stopped' : ''}${selected ? ' of3__worker--selected' : ''}`;

  return run && !stopped ? (
    <Link className={className} href={`/office?room=${roomId}&run=${encodeURIComponent(run.run_id)}`} scroll={false} aria-label={`${employee.name}の直近報告を開く：${actions > 0 ? '確認待ち' : state.label}`}>
      {content}
    </Link>
  ) : (
    <div className={className} aria-label={`${employee.name}、${state.label}`}>{content}</div>
  );
}

/** 部屋へ入った後だけ社員名・勤務時間・報告導線を開示する。 */
export function OfficeRoomView({ roomId, employees, runs, stopped, today, selectedRunId }: OfficeRoomViewProps) {
  const room = OFFICE_ROOMS.find((candidate) => candidate.id === roomId) ?? OFFICE_ROOMS[0];
  const members = employees.filter((employee) => roomOf(employee) === roomId);
  const stoppedMembers = stopped.filter((employee) => roomOf(employee) === roomId);
  const actions = members.reduce((count, employee) => count + actionCountOf(lastRunOf(runs, employee.automation_id)), 0);

  return (
    <>
      <header className="of3__room-header">
        <Link className="mono of3__back" href="/office">‹ OFFICE</Link>
        <div>
          <p className="mono of3__room-title">{room.label}</p>
          <p className={actions > 0 ? 'of3__room-action-copy' : 'of3__room-quiet-copy'}>
            {actions > 0 ? `確認が必要な仕事：${actions}件` : '静かに稼働中'}
          </p>
        </div>
      </header>

      <section className="of3__room-floor" aria-label={`${room.label}の社員`}>
        <div className="of3__worker-grid">
          {members.map((employee) => {
            const run = lastRunOf(runs, employee.automation_id);
            return <RoomStation key={employee.automation_id} employee={employee} run={run} today={today} roomId={roomId} selected={run?.run_id === selectedRunId} />;
          })}
          {stoppedMembers.map((employee) => (
            <RoomStation key={employee.automation_id} employee={employee} run={undefined} today={today} roomId={roomId} stopped selected={false} />
          ))}
        </div>
      </section>

      <nav className="of3__room-nav" aria-label="部署を移動">
        {OFFICE_ROOMS.map((candidate) => (
          <Link key={candidate.id} className={candidate.id === roomId ? 'of3__room-nav-link is-active' : 'of3__room-nav-link'} href={`/office?room=${candidate.id}`} aria-current={candidate.id === roomId ? 'page' : undefined}>
            <span className="mono">{candidate.label}</span>
          </Link>
        ))}
        <Link className="mono of3__desk-shortcut" href="/office?desk=1" scroll={false}>MY DESK</Link>
      </nav>
    </>
  );
}
