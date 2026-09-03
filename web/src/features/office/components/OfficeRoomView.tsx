/* eslint-disable @next/next/no-img-element -- Rust の静的 export 配信には Next Image optimizer が無いため */
import Link from 'next/link';
import {
  actionCountOf,
  breakdownOf,
  deptBlocksOf,
  lastRunOf,
  lineBlocksOf,
  lineLabelOf,
  rosterOf,
  shiftStateOf,
  workLabelOf,
  type OfficeDeptRoom,
  type OfficeEmployee,
  type OfficeRun,
} from '../lib/office';

/**
 * フロアの軸は**2つだけ**。部屋（＝部署）が主で、ライン（工程）は同じ席・同じ並びの
 * **絞り込み**（docs/specs/21-web-office-roster.md §3.7-1・
 * docs/specs/27-web-office-departments.md §3.2-4）。見た目を作り分けない。
 *
 * 部屋 id が `dept` の id になった（同 §3.1-1）ので、26 §3.3 の部署絞り込みは部屋と
 * **同じもの**になった——`dept` の軸を別に持たない（別名の解決は `OfficeView` 側）。
 */
export type OfficeFloorScope =
  /** 部屋 id ＝ `dept` の id（docs/specs/27-web-office-departments.md §3.1-1・§3.2-1） */
  | {
      kind: 'room';
      roomId: string;
      /** 入ってきたクエリの別名。自分へのリンクはこの名前を保つ（§3.2-1） */
      param: 'room' | 'dept';
    }
  | { kind: 'line'; lineId: string };

export type OfficeRoomViewProps = {
  scope: OfficeFloorScope;
  /** 下部の導線に出す部屋（27 §3.1 の dept 由来。cerebellum に部屋の表を持たない・§4） */
  rooms: OfficeDeptRoom[];
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
  rooms,
  employees,
  runs,
  stopped,
  today,
  selectedRunId,
  selectedEmployeeId,
}: OfficeRoomViewProps) {
  // 部屋＝部署なので（27 §3.1-1）、部屋のフロアの id はそのまま部署 id
  const currentId = scope.kind === 'room' ? scope.roomId : null;
  /**
   * ヘッダの見出し（27 §3.1-5）。全景タイルと**同じ形**——`departments` の label を主に、
   * id を等幅で小さく添える。表示名は `officeDeptRoomsOf` が組んだ部屋から引くだけで、
   * cerebellum 側に部署の日本語ラベル表を持たない（同 §4）。
   *
   * label が届いていない部屋（`departments` 未着・未知の部署・旧4部屋 id）は §3.1-4 の
   * とおり **id を見出しに出す**ので、26 §3.3-2 の `DEPT: {id}` の形をそのまま使い、
   * 添えの id 行は出さない（同じ文字を2度書かない）。
   */
  const deptLabel =
    scope.kind === 'room' ? (rooms.find((room) => room.id === scope.roomId)?.label ?? null) : null;
  // ラインの未知の値はラベルに変えず値のまま出す（21 §3.7-3）
  const title =
    scope.kind === 'line' ? `LINE: ${lineLabelOf(scope.lineId)}` : (deptLabel ?? `DEPT: ${currentId}`);
  const subId = deptLabel === null ? null : currentId;
  const scopeHref =
    scope.kind === 'room'
      ? `/office?${scope.param}=${encodeURIComponent(scope.roomId)}`
      : `/office?line=${encodeURIComponent(scope.lineId)}`;
  // 勤務帯 → 手動起動 → 停止中（21 §3.4-1）。ブロック内は返却順のまま
  const blocks =
    scope.kind === 'line'
      ? lineBlocksOf(employees, stopped, scope.lineId)
      : deptBlocksOf(employees, stopped, scope.roomId);
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
          {/* label が届いた部屋だけ id を等幅で小さく添える（27 §3.1-5・全景タイルと同じ） */}
          {subId !== null && <p className="mono of3__room-id">{subId}</p>}
          <p className={actions > 0 ? 'of3__room-action-copy' : 'of3__room-quiet-copy'}>
            {actions > 0 ? `確認が必要な仕事：${actions}件` : '静かに稼働中'}
          </p>
          <p className="mono of3__room-breakdown">{breakdown}</p>
        </div>
      </header>

      <section className={`of3__room-floor${blocks.rows > 2 ? ' of3__room-floor--crowded' : ''}`} aria-label={`${title}の社員`}>
        <div className="of3__room-blocks">
          {/*
            誰も居ないときも落とさない（21 §3.7-6・26 §3.3-5）。旧4部屋の id
            （`library` / `lab` / `market` / `studio`）と未知の部署もここに落ちる——
            **リダイレクトも対応表も置かない**（27 §3.2-3）。全景への導線はヘッダの
            「‹ OFFICE」が兼ねる。
          */}
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

      {/* 部屋の正規の入口は `?room=`（27 §3.2-1。`?dept=` は互換のための別名） */}
      <nav className="of3__room-nav" aria-label="部署を移動">
        {rooms.map((candidate) => (
          <Link key={candidate.id} className={candidate.id === currentId ? 'of3__room-nav-link is-active' : 'of3__room-nav-link'} href={`/office?room=${encodeURIComponent(candidate.id)}`} aria-current={candidate.id === currentId ? 'page' : undefined}>
            <span className="mono">{candidate.label ?? candidate.id}</span>
          </Link>
        ))}
        <Link className="mono of3__desk-shortcut" href="/office?desk=1" scroll={false}>MY DESK</Link>
      </nav>
    </>
  );
}
