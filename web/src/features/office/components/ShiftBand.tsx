import {
  lastRunOf,
  shiftStateOf,
  type OfficeEmployee,
  type OfficeRun,
  type ShiftState,
} from '../lib/office';

export type ShiftBandProps = {
  /** パネル見出し（`勤務帯` / `停止中`） */
  title: string;
  /** 表示する社員（**返却順のまま**。勤務開始時刻の昇順・§3.1-1） */
  employees: OfficeEmployee[];
  runs: OfficeRun[];
  /** ローカルの今日（`YYYY-MM-DD`）。当日 run の有無判定に使う（§3.2） */
  today: string;
  /** 停止中の帯（`enabled: false`）。headline を出さない（§3.1-4） */
  stopped?: boolean;
};

/**
 * 勤務帯（docs/specs/20-web-office.md §3.1）。夜勤 01:00 から 22:00 までが
 * **1本の縦の帯**として一直線に並び、これがそのままシフト表になる。
 * 様式は履歴・開発画面と同じリスト（`.panel` + `.row`）を流用する（§5）。
 */
export function ShiftBand({ title, employees, runs, today, stopped = false }: ShiftBandProps) {
  return (
    <div className="panel stack" style={{ overflow: 'hidden', marginBottom: 12 }}>
      <div className="mono list__head">
        <span>{title}</span>
        <span>{employees.length} 名</span>
      </div>
      {employees.map((employee) => (
        <ShiftRow
          key={employee.automation_id}
          employee={employee}
          run={stopped ? undefined : lastRunOf(runs, employee.automation_id)}
          today={today}
          stopped={stopped}
        />
      ))}
    </div>
  );
}

/**
 * 1行 = 1社員（§3.1-2）。左に `shift.label`（等幅）・中央に `name`・右に直近 run の状態、
 * その下に直近 run の `headline` を1行（省略記号は生成側で付与済み。画面で再切り詰めしない・§3.1-3）。
 */
function ShiftRow({
  employee,
  run,
  today,
  stopped,
}: {
  employee: OfficeEmployee;
  run: OfficeRun | undefined;
  today: string;
  stopped: boolean;
}) {
  // 停止中は「休職者」なので状態も headline も出さない（§3.1-4）
  const state: ShiftState | null = stopped ? null : shiftStateOf(employee, run, today);
  // 失敗様式は `dg__warn` の流用（左 3px の赤ボーダー＋`--error` 文字。§3.2・§5）
  const bad = state?.tone === 'bad';

  return (
    <div className={'row of__row' + (bad ? ' of__row--bad' : '')}>
      <span className="mono of__shift">{employee.shift?.label ?? '—'}</span>
      <span className="of__main">
        <span className="of__top">
          <span className="row__text of__name">{employee.name}</span>
          {state && (
            <span className={'mono of__state of__state--' + state.tone}>
              {state.label}
              {state.lastDate && <span className="of__last">直近 {state.lastDate}</span>}
            </span>
          )}
        </span>
        {!stopped && run?.headline && <span className="row__meta of__line">{run.headline}</span>}
        {state?.note && <span className="mono row__meta of__line of__note">{state.note}</span>}
      </span>
    </div>
  );
}
