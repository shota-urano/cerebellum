/** 素材に無いので今日/履歴と同じ `.skel` の作りで用意する（docs/specs/10-web-routines.md §3.4）。 */
const PLACEHOLDER_ROWS = 6;

function Bar({ width }: { width: number | string }) {
  return <span className="skel" style={{ width }}>&nbsp;</span>;
}

/**
 * ロード中スケルトン。実表示と同じクラス（`.row` / `.rt__chip`）で描くので、
 * 取得完了時に枠がずれない（「今日」画面の DaySkeleton と同じ考え方）。
 */
export function RoutinesSkeleton() {
  return (
    <div className="panel stack" style={{ overflow: 'hidden' }} aria-busy="true" aria-live="polite">
      <div className="mono list__head">
        <span>ROUTINES</span>
        <Bar width={54} />
      </div>
      {Array.from({ length: PLACEHOLDER_ROWS }, (_, i) => (
        <div className="row" key={i}>
          <span className="mono rt__chip"><Bar width={28} /></span>
          <span className="row__body">
            <span className="row__text" style={{ display: 'block' }}>
              <Bar width={i % 3 === 0 ? '58%' : i % 3 === 1 ? '82%' : '70%'} />
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}
