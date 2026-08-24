/* eslint-disable @next/next/no-img-element -- Rust の静的 export 配信には Next Image optimizer が無いため */
import Link from 'next/link';
import {
  lastRunOf,
  shiftStateOf,
  type OfficeEmployee,
  type OfficeRun,
  type ShiftState,
} from '../lib/office';

type Station = {
  employee: OfficeEmployee;
  run: OfficeRun | undefined;
  state: ShiftState;
};

export type OfficeFloorProps = {
  employees: OfficeEmployee[];
  runs: OfficeRun[];
  stopped: OfficeEmployee[];
  today: string;
  selectedRunId: string | null;
};

function stationOf(employee: OfficeEmployee, runs: OfficeRun[], today: string): Station {
  const run = lastRunOf(runs, employee.automation_id);
  return { employee, run, state: shiftStateOf(employee, run, today) };
}

const STATION_ASSETS = [
  '/images/office/employee-station.png',
  '/images/office/employee-station-white.png',
  '/images/office/employee-station-gray.png',
] as const;

/** 同じ社員は再描画後も同じ姿になる。失敗だけは状態が一目で分かる専用アセット。 */
function stationAssetOf(employee: OfficeEmployee, state: ShiftState): string {
  if (state.tone === 'bad') return '/images/office/employee-station-failed.png';
  let hash = 0;
  for (const char of employee.automation_id) hash = (hash + char.charCodeAt(0)) % STATION_ASSETS.length;
  return STATION_ASSETS[hash];
}

function StationView({ station, selected }: { station: Station; selected: boolean }) {
  const { employee, run, state } = station;
  const body = (
    <>
      <span className="of2__name">{employee.name}</span>
      <span className="of2__desk" aria-hidden="true">
        <img
          className="of2__avatar"
          src={stationAssetOf(employee, state)}
          alt=""
          width={300}
          height={300}
        />
      </span>
      <span className="mono of2__shift">{employee.shift?.label ?? '勤務時間未設定'}</span>
      <span className={'mono of2__state of2__state--' + state.tone}>
        <span className="of2__state-dot" aria-hidden="true" />
        {state.label || '待機'}
      </span>
      {state.lastDate && <span className="mono of2__last">直近 {state.lastDate}</span>}
      {state.note && <span className="mono of2__note">{state.note}</span>}
    </>
  );

  const className =
    'of2__station of2__station--' + state.tone + (selected ? ' of2__station--selected' : '');

  if (!run) {
    return (
      <div className={className + ' of2__station--idle'} aria-label={employee.name + '、' + state.label}>
        {body}
      </div>
    );
  }

  return (
    <Link
      className={className}
      href={'/office?run=' + encodeURIComponent(run.run_id)}
      scroll={false}
      aria-label={employee.name + 'の直近報告を開く：' + state.label}
    >
      {body}
    </Link>
  );
}

function StoppedStation({ employee }: { employee: OfficeEmployee }) {
  return (
    <div className="of2__station of2__station--stopped">
      <span className="of2__name">{employee.name}</span>
      <span className="of2__desk" aria-hidden="true">
        <img
          className="of2__avatar"
          src="/images/office/employee-station-gray.png"
          alt=""
          width={300}
          height={300}
        />
      </span>
      <span className="mono of2__shift">{employee.shift?.label ?? '勤務時間未設定'}</span>
      <span className="mono of2__state of2__state--neutral">停止中</span>
    </div>
  );
}

/**
 * automation を社員として配置する2Dフロア（docs/specs/20-web-office.md §3.1）。
 * 背景と社員アバターは画像アセット、名前・勤務時間・状態・リンクは実データで描く。
 */
export function OfficeFloor({ employees, runs, stopped, today, selectedRunId }: OfficeFloorProps) {
  const stations = employees.map((employee) => stationOf(employee, runs, today));
  const counts = stations.reduce(
    (total, station) => {
      if (station.state.tone === 'bad') total.failed += 1;
      else if (station.state.tone === 'live' || station.state.tone === 'good') total.working += 1;
      else total.waiting += 1;
      return total;
    },
    { working: 0, waiting: 0, failed: 0 },
  );

  return (
    <>
      <div className="of2__summary" aria-label="オフィスの稼働状況">
        <span className="mono of2__summary-item of2__summary-item--live">
          <span className="of2__summary-mark" aria-hidden="true" />勤務中 {counts.working}
        </span>
        <span className="mono of2__summary-item">
          <span className="of2__summary-mark" aria-hidden="true" />待機 {counts.waiting}
        </span>
        <span className="mono of2__summary-item of2__summary-item--bad">
          <span className="of2__summary-mark" aria-hidden="true">!</span>失敗 {counts.failed}
        </span>
      </div>

      <section className="of2__floor" aria-label="勤務中の社員フロア">
        <div className="of2__grid">
          {stations.map((station) => (
            <StationView
              key={station.employee.automation_id}
              station={station}
              selected={station.run?.run_id === selectedRunId}
            />
          ))}
        </div>
      </section>

      {stopped.length > 0 && (
        <section className="of2__stopped" aria-labelledby="office-stopped-title">
          <div className="mono of2__room-head" id="office-stopped-title">
            <span>停止中</span>
            <span>{stopped.length} 名</span>
          </div>
          <div className="of2__grid">
            {stopped.map((employee) => (
              <StoppedStation key={employee.automation_id} employee={employee} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
