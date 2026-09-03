/* eslint-disable @next/next/no-img-element -- Rust の静的 export 配信には Next Image optimizer が無いため */
import Link from 'next/link';
import {
  actionCountOf,
  breakdownOf,
  lastRunOf,
  shiftStateOf,
  type OfficeDeptRoom,
  type OfficeRun,
} from '../lib/office';

export type OfficeOverviewProps = {
  /**
   * 出す部屋（`officeDeptRoomsOf` が組んだ dept 由来の一覧・27 §3.1-1〜4）。
   * 並び・見出し・所属の判定は lib 側の1本に寄せる——画面側で部屋を作り直さない。
   */
  rooms: OfficeDeptRoom[];
  runs: OfficeRun[];
  /** 停止中の総数（20 §3.1-5 の「停止中 n名」）。部屋ごとの停止中は内訳に出る */
  stoppedCount: number;
  today: string;
};

type RoomSummary = {
  id: string;
  /** 見出しの主。`departments` の label、無ければ id そのまま（27 §3.1-4・§3.1-5） */
  title: string;
  /** 見出しに等幅で添える id。label が無い部屋（＝見出しが id）では出さない（§3.1-5） */
  subId: string | null;
  /** 在籍数（勤務帯＋手動）。停止中は含めない（20 §3.5-1 のまま） */
  members: number;
  /** 所属社員数の内訳（26 §3.2 の形。部屋ごとに出す・§3.1-6） */
  breakdown: string;
  failed: number;
  running: number;
  actions: number;
};

function summarizeRooms(rooms: OfficeDeptRoom[], runs: OfficeRun[], today: string) {
  const summaries: RoomSummary[] = [];
  let failed = 0;
  let actions = 0;

  for (const room of rooms) {
    const summary = roomSummaryOf(room, runs, today);
    // 全景の集計は在籍社員だけを見る（停止中は件数だけを弱く出す・20 §3.1-5）
    failed += summary.failed;
    actions += summary.actions;
    summaries.push(summary);
  }

  return { rooms: summaries, failed, actions };
}

function roomSummaryOf(room: OfficeDeptRoom, runs: OfficeRun[], today: string): RoomSummary {
  const onDuty = [...room.blocks.scheduled, ...room.blocks.manual];
  let failed = 0;
  let running = 0;
  let actions = 0;
  for (const employee of onDuty) {
    const run = lastRunOf(runs, employee.automation_id);
    const state = shiftStateOf(employee, run, today);
    actions += actionCountOf(run);
    if (state.tone === 'bad') failed += 1;
    if (state.tone === 'live') running += 1;
  }
  return {
    id: room.id,
    title: room.label ?? room.id,
    subId: room.label === null ? null : room.id,
    members: onDuty.length,
    // 部署ルーム・会社案内と同じ関数で組む（同じ形を2箇所に書かない・lib の breakdownOf）
    breakdown: breakdownOf(room.blocks),
    failed,
    running,
    actions,
  };
}

/** 部屋の信号（20 §3.1-4）。人間対応→失敗→実行中→正常の順で1つだけ強調する */
function RoomSignal({ room }: { room: RoomSummary }) {
  if (room.actions > 0) return <span className="of3__room-signal of3__room-signal--action">確認 {room.actions}</span>;
  if (room.failed > 0) return <span className="of3__room-signal of3__room-signal--bad">失敗 {room.failed}</span>;
  if (room.running > 0) return <span className="of3__room-signal of3__room-signal--live">処理中…</span>;
  return <span className="of3__room-signal">正常</span>;
}

/**
 * 部署の部屋と MY DESK だけを見せる、低認知負荷のオフィス全景
 * （docs/specs/27-web-office-departments.md §3.1。20 §3.1 の固定4部屋を置き換えたもの）。
 *
 * 部屋は `profile.dept` の値ごとに1つで、skill 名からの分類はしない（§3.1-1）。
 * 最上部の2行と MY DESK は据え置き（§3.1-7）。全景の高さは**部屋数だけ**に依存し、
 * 社員数では変わらない（§3.1-8）——社員名・勤務時刻は部屋へ入るまで出さないため。
 */
export function OfficeOverview({ rooms, runs, stoppedCount, today }: OfficeOverviewProps) {
  const summary = summarizeRooms(rooms, runs, today);

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

      {/*
        会社案内への導線（docs/specs/26-web-office-company.md §3.4-6）。**全景からはここ1つだけ**で、
        部屋＋MY DESK の構図（`.of3__campus`）には足さない。
      */}
      <p className="of3__company-link">
        <Link className="mono of3__company" href="/office?company=1">会社案内</Link>
      </p>

      <section className="of3__campus" aria-label="AIオフィス全景">
        {/* MY DESK は据え置き（§3.1-7）。件数の出どころも変えない（20 §3.3） */}
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

        {/* 2列のタイル。1タイルは見出し・信号・内訳の3行に収める（§3.1-8） */}
        <div className="of3__rooms">
          {summary.rooms.map((room) => (
            <Link
              key={room.id}
              className="of3__room"
              /* 部屋 id ＝ `dept` の id。正規の入口は `?room=`（27 §3.2-1。`?dept=` は別名） */
              href={`/office?room=${encodeURIComponent(room.id)}`}
              aria-label={`${room.title}に入る、社員${room.members}名`}
            >
              <span className="of3__room-name">{room.title}</span>
              {/* label が届いた部屋だけ id を等幅で小さく添える（§3.1-5） */}
              {room.subId !== null && <span className="mono of3__room-id">{room.subId}</span>}
              <RoomSignal room={room} />
              <span className="mono of3__room-crew">{room.breakdown}</span>
            </Link>
          ))}
        </div>
      </section>

      {stoppedCount > 0 && <p className="mono of3__stopped-count">停止中 {stoppedCount}名</p>}
    </>
  );
}
