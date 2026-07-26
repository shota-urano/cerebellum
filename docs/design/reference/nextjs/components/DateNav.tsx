import { formatDate } from '@/lib/date';

type Props = {
  iso: string;
  onPrev: () => void;
  onNext: () => void;
  canNext: boolean;
};

export default function DateNav({ iso, onPrev, onNext, canNext }: Props) {
  return (
    <div className="panel nav">
      <button type="button" className="mono nav__btn" onClick={onPrev}>◀ 前日</button>
      <div className="mono nav__date">{formatDate(iso)}</div>
      <button type="button" className="mono nav__btn" onClick={onNext} disabled={!canNext}>翌日 ▶</button>
    </div>
  );
}
