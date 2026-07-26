import { formatDate } from '@/shared/lib';
import { SegmentBar } from './SegmentBar';

/** 日付＋進捗の計器盤カード。見た目の正本は `docs/design/02-today.md`（`.hdr` in globals.css）。 */
export function HeaderPanel({ iso, done, total }: { iso: string; done: number; total: number }) {
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
          <div className="mono label" style={{ marginBottom: 6 }}>CLEARED</div>
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
