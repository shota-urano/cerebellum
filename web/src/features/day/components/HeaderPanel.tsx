import { formatDate } from '@/shared/lib';
import { SegmentBar } from './SegmentBar';

/**
 * 日付＋進捗の計器盤カード。見た目の正本は `docs/design/02-today.md`（`.hdr` in globals.css）。
 *
 * `alert` は「今日」第3段の異常の合図（docs/specs/25-web-inbox.md §3.1）。**進捗の計算には
 * 一切混ぜない**——AI 側の異常で日課の `done / total` や ALL CLEAR が動いてはいけない
 * （同 §3.1「ALL CLEAR の判定には含めない」）。何を異常と見るかの判定は inbox feature が持ち、
 * ここへは真偽値だけが渡る（合成は app 層・同 §5）。
 */
export function HeaderPanel({
  iso,
  done,
  total,
  alert = false,
}: {
  iso: string;
  done: number;
  total: number;
  alert?: boolean;
}) {
  return (
    <section className="panel hdr">
      <span className="hdr__bracket" style={{ top: 0, left: 0, width: 14, height: 1 }} />
      <span className="hdr__bracket" style={{ top: 0, left: 0, width: 1, height: 14 }} />
      <span className="hdr__bracket" style={{ bottom: 0, right: 0, width: 14, height: 1 }} />
      <span className="hdr__bracket" style={{ bottom: 0, right: 0, width: 1, height: 14 }} />

      <div className="hdr__top">
        <div>
          <div className="mono label" style={{ marginBottom: 6 }}>DATE</div>
          <div className="mono hdr__date">{formatDate(iso)}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="mono label" style={{ marginBottom: 6 }}>
            CLEARED
            {/* 第3段の異常の赤点（§3.1）。計器盤の右端に置くだけで、押す操作は持たない
                ——片付ける場所は第3段のタップ先（「あなた待ち」）で、ここは合図に徹する */}
            {alert && (
              <span className="hdr__alert" role="img" aria-label="確認待ちに異常があります" />
            )}
          </div>
          <div className="mono hdr__count">{done} / {total}</div>
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <SegmentBar done={done} total={total} />
      </div>

      <div className="mono hdr__foot">
        <span>PROGRESS {total ? Math.round((done / total) * 100) : 0}%</span>
        <span>REMAINING {total - done}</span>
      </div>
    </section>
  );
}
