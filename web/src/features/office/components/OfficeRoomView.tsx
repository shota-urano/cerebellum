/* eslint-disable @next/next/no-img-element -- Rust の静的 export 配信には Next Image optimizer が無いため */
import Link from 'next/link';
import {
  actionCountOf,
  breakdownOf,
  deptBlocksOf,
  lastRunOf,
  lineBlocksOf,
  lineLabelOf,
  OFFICE_ROOMS,
  roomBlocksOf,
  rosterOf,
  shiftStateOf,
  workLabelOf,
  type OfficeEmployee,
  type OfficeRoomId,
  type OfficeRun,
} from '../lib/office';

/**
 * フロアの軸。部屋（役割）が主で、ライン（工程）と部署（組織図の所属）は同じ席・同じ並びの
 * **絞り込み**（docs/specs/21-web-office-roster.md §3.7-1・
 * docs/specs/26-web-office-company.md §3.3-1）。見た目を作り分けない。
 */
export type OfficeFloorScope =
  | { kind: 'room'; roomId: OfficeRoomId }
  | { kind: 'line'; lineId: string }
  | { kind: 'dept'; deptId: string };

export type OfficeRoomViewProps = {
  scope: OfficeFloorScope;
  employees: OfficeEmployee[];
  runs: OfficeRun[];
  stopped: OfficeEmployee[];
  today: string;
  selectedRunId: string | null;
  selectedEmployeeId: string | null;
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

/**
 * 席。**タップは常に社員名簿へ行く**（docs/specs/21-web-office-roster.md §3.1-1）。
 * run の有無で「開くもの」が変わらないようにする——run を持たない社員（手動起動・未実行）の
 * 席だけタップできない状態が、席の意味を不定にしていた。
 */
function RoomStation({
  employee,
  run,
  today,
  scopeHref,
  stopped = false,
  selected,
}: {
  employee: OfficeEmployee;
  run: OfficeRun | undefined;
  today: string;
  /** 現在のフロア。席のリンクはこの文脈を保つ（部屋なら部屋へ、ラインならラインへ戻れる） */
  scopeHref: string;
  stopped?: boolean;
  selected: boolean;
}) {
  const state = stopped ? { label: '停止中', tone: 'neutral' as const } : shiftStateOf(employee, run, today);
  const actions = stopped ? 0 : actionCountOf(run);
  // 席に出す名簿項目は起動コマンドだけ（人間が「どう呼ぶか」・21 §3.3-2）
  const command = rosterOf(employee).command;
  const className = `of3__worker of3__worker--${state.tone}${actions > 0 ? ' of3__worker--action' : ''}${stopped ? ' of3__worker--stopped' : ''}${selected ? ' of3__worker--selected' : ''}`;

  return (
    <Link
      className={className}
      href={`${scopeHref}&employee=${encodeURIComponent(employee.automation_id)}`}
      scroll={false}
      aria-label={`${employee.name}の名簿を開く：${actions > 0 ? '確認待ち' : state.label}`}
    >
      <span className="of3__worker-visual" aria-hidden="true">
        <img src={stationAsset(employee, state.tone === 'bad')} alt="" />
      </span>
      {actions > 0 && <span className="of3__worker-alert">確認待ち {actions}</span>}
      {actions === 0 && state.tone === 'live' && <span className="of3__worker-live">処理中…</span>}
      {actions === 0 && state.tone === 'bad' && <span className="of3__worker-bad">失敗</span>}
      <span className="of3__worker-name">{employee.name}</span>
      <span className="mono of3__worker-shift">{stopped ? (employee.shift?.label ?? '勤務時間未設定') : workLabelOf(employee)}</span>
      {!stopped && command && <span className="mono of3__worker-command">{command}</span>}
      {actions === 0 && state.tone !== 'live' && state.tone !== 'bad' && (
        <span className="mono of3__worker-meta">
          {'lastDate' in state && state.lastDate ? `直近 ${state.lastDate}` : state.label}
        </span>
      )}
      {actions === 0 && 'note' in state && state.note && <span className="mono of3__worker-meta">{state.note}</span>}
      {actions > 0 && <span className="of3__worker-copy">{run?.headline ?? '確認を待っています'}</span>}
    </Link>
  );
}

/** 部屋（またはライン）へ入った後だけ社員名・勤務時間・報告導線を開示する。 */
export function OfficeRoomView({
  scope,
  employees,
  runs,
  stopped,
  today,
  selectedRunId,
  selectedEmployeeId,
}: OfficeRoomViewProps) {
  const room =
    scope.kind === 'room'
      ? (OFFICE_ROOMS.find((candidate) => candidate.id === scope.roomId) ?? OFFICE_ROOMS[0])
      : null;
  // ラインの未知の値はラベルに変えず値のまま出す（21 §3.7-3）。
  // 部署は**そもそも翻訳しない**——日本語ラベルの対応表を cerebellum に持たない（26 §3.3-2・§4）
  const title =
    scope.kind === 'room'
      ? (room?.label ?? '')
      : scope.kind === 'line'
        ? `LINE: ${lineLabelOf(scope.lineId)}`
        : `DEPT: ${scope.deptId}`;
  const scopeHref =
    scope.kind === 'room'
      ? `/office?room=${scope.roomId}`
      : scope.kind === 'line'
        ? `/office?line=${encodeURIComponent(scope.lineId)}`
        : `/office?dept=${encodeURIComponent(scope.deptId)}`;
  // 勤務帯 → 手動起動 → 停止中（21 §3.4-1）。ブロック内は返却順のまま
  const blocks =
    scope.kind === 'room'
      ? roomBlocksOf(employees, stopped, scope.roomId)
      : scope.kind === 'line'
        ? lineBlocksOf(employees, stopped, scope.lineId)
        : deptBlocksOf(employees, stopped, scope.deptId);
  const onDuty = [...blocks.scheduled, ...blocks.manual];
  const actions = onDuty.reduce(
    (count, employee) => count + actionCountOf(lastRunOf(runs, employee.automation_id)),
    0,
  );
  // 内訳（21 §3.4-3 ＋ docs/specs/26-web-office-company.md §3.2）。
  // 組むのは lib の `breakdownOf`——会社案内（26 §3.4-1「§3.2 の内訳」）と同じ形を2箇所に書かない
  const breakdown = breakdownOf(blocks);

  const station = (employee: OfficeEmployee, isStopped: boolean) => {
    const run = isStopped ? undefined : lastRunOf(runs, employee.automation_id);
    return (
      <RoomStation
        key={employee.automation_id}
        employee={employee}
        run={run}
        today={today}
        scopeHref={scopeHref}
        stopped={isStopped}
        selected={employee.automation_id === selectedEmployeeId || (run !== undefined && run.run_id === selectedRunId)}
      />
    );
  };

  return (
    <>
      <header className="of3__room-header">
        <Link className="mono of3__back" href="/office">‹ OFFICE</Link>
        <div>
          <p className="mono of3__room-title">{title}</p>
          <p className={actions > 0 ? 'of3__room-action-copy' : 'of3__room-quiet-copy'}>
            {actions > 0 ? `確認が必要な仕事：${actions}件` : '静かに稼働中'}
          </p>
          <p className="mono of3__room-breakdown">{breakdown}</p>
        </div>
      </header>

      <section className={`of3__room-floor${blocks.rows > 2 ? ' of3__room-floor--crowded' : ''}`} aria-label={`${title}の社員`}>
        <div className="of3__room-blocks">
          {/* ラインに誰も居ないときも落とさない（21 §3.7-6） */}
          {blocks.rows === 0 && (
            <p className="of3__floor-empty">
              {scope.kind === 'line' ? 'このラインの社員は居ません' : 'この部署の社員は居ません'}
            </p>
          )}
          <div className="of3__worker-grid">{blocks.scheduled.map((employee) => station(employee, false))}</div>

          {blocks.manual.length > 0 && (
            <>
              <p className="mono of3__block-label">手動起動</p>
              <div className="of3__worker-grid">{blocks.manual.map((employee) => station(employee, false))}</div>
            </>
          )}

          {blocks.stopped.length > 0 && (
            <>
              <p className="mono of3__block-label">停止中</p>
              <div className="of3__worker-grid">{blocks.stopped.map((employee) => station(employee, true))}</div>
            </>
          )}
        </div>
      </section>

      <nav className="of3__room-nav" aria-label="部署を移動">
        {OFFICE_ROOMS.map((candidate) => (
          <Link key={candidate.id} className={candidate.id === room?.id ? 'of3__room-nav-link is-active' : 'of3__room-nav-link'} href={`/office?room=${candidate.id}`} aria-current={candidate.id === room?.id ? 'page' : undefined}>
            <span className="mono">{candidate.label}</span>
          </Link>
        ))}
        <Link className="mono of3__desk-shortcut" href="/office?desk=1" scroll={false}>MY DESK</Link>
      </nav>
    </>
  );
}
