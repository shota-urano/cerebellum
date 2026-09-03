import { ReadonlyHead } from './ReadonlyHead';
import { SegmentBar } from './SegmentBar';

/** 素材に無いのでここで作る（docs/specs/08 §6・docs/design/02-today.md「未定事項」）。 */
const PLACEHOLDER_ROWS = 6;

/** 実表示と同じ行送りを占める帯（`&nbsp;` で行ボックスを作り、見た目だけ transform で細くする）。 */
function Bar({ width }: { width: number | string }) {
  return <span className="skel" style={{ width }}>&nbsp;</span>;
}

/**
 * ロード中スケルトン（ヘッダぶん）。寸法は実表示と同じクラスで描くので、取得完了時に
 * 枠がずれない（レイアウトシフトを避ける。docs/specs/08 §6）。
 *
 * docs/specs/30-web-today-order.md §5 に従いヘッダ用・リスト用に割った。「今日」は2つの間に
 * WAITING・LEARNING が入るので1つの塊では描けない——**様式・寸法は転写のまま**で、割っただけ。
 */
export function DayHeaderSkeleton({ readonly = false }: { readonly?: boolean }) {
  return (
    <div aria-busy="true" aria-live="polite">
      {readonly ? (
        <ReadonlyHead done={0} total={0} />
      ) : (
        <section className="panel hdr">
          <span className="hdr__bracket" style={{ top: 0, left: 0, width: 14, height: 1 }} />
          <span className="hdr__bracket" style={{ top: 0, left: 0, width: 1, height: 14 }} />
          <span className="hdr__bracket" style={{ bottom: 0, right: 0, width: 14, height: 1 }} />
          <span className="hdr__bracket" style={{ bottom: 0, right: 0, width: 1, height: 14 }} />

          <div className="hdr__top">
            <div>
              <div className="mono label" style={{ marginBottom: 6 }}>DATE</div>
              <div className="mono hdr__date"><Bar width={132} /></div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="mono label" style={{ marginBottom: 6 }}>CLEARED</div>
              <div className="mono hdr__count"><Bar width={62} /></div>
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <SegmentBar done={0} total={0} voided />
          </div>

          <div className="mono hdr__foot">
            <Bar width={76} />
            <Bar width={66} />
          </div>
        </section>
      )}
    </div>
  );
}

/** ロード中スケルトン（TASKS 一覧ぶん）。寸法・様式は割る前の転写のまま。 */
export function DayTasksSkeleton({ readonly = false }: { readonly?: boolean }) {
  return (
    <div aria-busy="true" aria-live="polite">
      <div className="panel stack" style={{ overflow: 'hidden', marginTop: readonly ? 14 : 18 }}>
        {!readonly && (
          <div className="mono list__head">
            <span>TASKS</span>
            <Bar width={54} />
          </div>
        )}
        {Array.from({ length: PLACEHOLDER_ROWS }, (_, i) => (
          <div className="row" key={i}>
            <span className="ring" />
            <span className="row__body">
              <span className="row__text" style={{ display: 'block' }}>
                <Bar width={i % 3 === 0 ? '58%' : i % 3 === 1 ? '82%' : '70%'} />
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
