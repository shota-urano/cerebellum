/* eslint-disable @next/next/no-img-element -- Rust の静的 export 配信には Next Image optimizer が無いため */
import Link from 'next/link';
import {
  actionCountOf,
  lastRunOf,
  OFFICE_ROOMS,
  roomOf,
  shiftStateOf,
  type OfficeEmployee,
  type OfficeRun,
  type OfficeRoomId,
} from '../lib/office';

export type OfficeOverviewProps = {
  employees: OfficeEmployee[];
  runs: OfficeRun[];
  stoppedCount: number;
  today: string;
};

type RoomSummary = {
  id: OfficeRoomId;
  label: string;
  employees: number;
  failed: number;
  running: number;
  actions: number;
};

function summarizeRooms(employees: OfficeEmployee[], runs: OfficeRun[], today: string) {
  const summaries = new Map<OfficeRoomId, RoomSummary>(
    OFFICE_ROOMS.map((room) => [
      room.id,
      { id: room.id, label: room.label, employees: 0, failed: 0, running: 0, actions: 0 },
    ]),
  );

  let failed = 0;
  let actions = 0;
  for (const employee of employees) {
    const run = lastRunOf(runs, employee.automation_id);
    const state = shiftStateOf(employee, run, today);
    const room = summaries.get(roomOf(employee));
    if (!room) continue;
    const actionCount = actionCountOf(run);
    room.employees += 1;
    room.actions += actionCount;
    if (state.tone === 'bad') {
      room.failed += 1;
      failed += 1;
    }
    if (state.tone === 'live') room.running += 1;
    actions += actionCount;
  }

  return { rooms: [...summaries.values()], failed, actions };
}

function RoomSignal({ room }: { room: RoomSummary }) {
  if (room.actions > 0) return <span className="of3__room-signal of3__room-signal--action">確認 {room.actions}</span>;
  if (room.failed > 0) return <span className="of3__room-signal of3__room-signal--bad">失敗 {room.failed}</span>;
  if (room.running > 0) return <span className="of3__room-signal of3__room-signal--live">処理中…</span>;
  return <span className="of3__room-signal">正常</span>;
}

/** 4部屋と MY DESK だけを見せる、低認知負荷のオフィス全景。 */
export function OfficeOverview({ employees, runs, stoppedCount, today }: OfficeOverviewProps) {
  const summary = summarizeRooms(employees, runs, today);

  return (
    <>
      <div className="of3__headline" aria-label="昨夜のオフィス概要">
        <p>
          昨夜：<strong className={summary.failed > 0 ? 'of3__bad' : 'of3__good'}>
            {summary.failed > 0 ? `失敗 ${summary.failed}` : '正常'}
          </strong>
        </p>
        <p>
          あなたの仕事：<strong className={summary.actions > 0 ? 'of3__action' : 'of3__good'}>
            {summary.actions}件
          </strong>
        </p>
      </div>

      <section className="of3__campus" aria-label="AIオフィス全景">
        {summary.rooms.map((room) => (
          <Link
            key={room.id}
            className={`of3__room of3__room--${room.id}`}
            href={`/office?room=${room.id}`}
            aria-label={`${room.label}に入る、社員${room.employees}名`}
          >
            <span className="mono of3__room-name">{room.label}</span>
            <span className="mono of3__room-count">{room.employees}名</span>
            <RoomSignal room={room} />
          </Link>
        ))}

        {summary.actions > 0 ? (
          <Link className="of3__desk" href="/office?desk=1" scroll={false} aria-label={`MY DESK、承認待ち${summary.actions}件`}>
            <img className="of3__desk-person" src="/images/office/employee-station-white.png" alt="" />
            <img className="of3__folders" src="/images/office/approval-folders.png" alt="" />
            <span className="mono of3__desk-name">MY DESK</span>
            <span className="of3__desk-status">承認待ち <b>{summary.actions}</b></span>
          </Link>
        ) : (
          <div className="of3__desk of3__desk--quiet" aria-label="MY DESK、承認待ちはありません">
            <img className="of3__desk-person" src="/images/office/employee-station-white.png" alt="" />
            <span className="mono of3__desk-name">MY DESK</span>
            <span className="of3__desk-status">承認待ち 0</span>
          </div>
        )}
      </section>

      {stoppedCount > 0 && <p className="mono of3__stopped-count">停止中 {stoppedCount}名</p>}
    </>
  );
}
