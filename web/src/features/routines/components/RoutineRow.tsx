import type { RoutineDto } from '@/shared/api';
import { metaOf } from '../lib/meta';

type Props = {
  routine: RoutineDto;
  onSelect: (routine: RoutineDto) => void;
};

/**
 * マスタ1行（docs/specs/10-web-routines.md §3.1）。
 * 「今日」画面の `.row` を流用し、チェックリングの代わりに間隔チップを置く。
 */
export function RoutineRow({ routine, onSelect }: Props) {
  const meta = metaOf(routine);
  return (
    <button type="button" className="row row--tap" onClick={() => onSelect(routine)}>
      <span className="mono rt__chip">{routine.interval}</span>
      <span className="row__body">
        <span className="row__text" style={{ display: 'block' }}>{routine.content}</span>
        {meta && <span className="mono row__meta" style={{ display: 'block' }}>{meta}</span>}
      </span>
    </button>
  );
}
