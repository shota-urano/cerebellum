import SegmentBar from './SegmentBar';
import { WEEK } from '@/lib/data';

type Props = { selected: string; onSelect: (iso: string) => void };

export default function WeekSummary({ selected, onSelect }: Props) {
  return (
    <section className="panel week">
      <div className="mono label" style={{ marginBottom: 12 }}>LAST 7 DAYS</div>
      {WEEK.map((day) => (
        <button
          type="button"
          key={day.iso}
          className={'week__row' + (day.iso === selected ? ' week__row--sel' : '')}
          onClick={() => onSelect(day.iso)}
        >
          <span className="mono week__date">{day.date}</span>
          <span className="mono week__ratio">{day.done === null ? '記録なし' : day.done + '/' + day.total}</span>
          <span className="week__bar">
            <SegmentBar
              done={day.done ?? 0}
              total={day.total ?? 11}
              voided={day.done === null}
              height={4}
              gap={2}
            />
          </span>
        </button>
      ))}
    </section>
  );
}
