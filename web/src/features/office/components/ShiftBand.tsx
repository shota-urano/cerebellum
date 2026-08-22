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
 * 様式は履歴・開発画面と同じ**リスト**（`.panel` + `.row`。19 の `RunList.tsx` と同じ）。
 *
 * 仕様 20 §5 は「パネルは `panel dg`」と書いているが、`dg` は詳細カード用の様式
 * （padding 14/16px）で、当てると区切り線がパネル端に届かず 390px で名前と headline の
 * 折り返しが増える（実測。docs/design/screenshots/cerebellum-004.1-office-dg.png）。
 * 19 §8 が「一覧はリスト様式・詳細は `panel dg` 様式」と書き分けているのと同じ構図なので、
 * §5 をその書き分けに合わせる提案を出している（AGENTS.md ルール9。実装は黙って変えない）。
 * 警告様式は §5 どおり `dg__warn` を流用（`OfficeView` の鮮度警告）。
 */
export function ShiftBand({ title, employees, runs, today, stopped = false }: ShiftBandProps) {
  return (
    <div className="panel stack of__band">
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
        {/* `of__headline` は様式を持たない識別用のクラス（headline と note を取り違えずに
            全行まとめて検証できるようにする固定フック）。様式は `of__line` 側が持つ */}
        {!stopped && run?.headline && (
          <span className="row__meta of__line of__headline">{run.headline}</span>
        )}
        {state?.note && <span className="mono row__meta of__line of__note">{state.note}</span>}
      </span>
    </div>
  );
}
