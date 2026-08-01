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
        <span className="mono row__meta" style={{ display: 'block' }}>
          {/* 表示専用の参照番号（§3.1-3）。ソート・検索・リンク等の機能は持たせない（§4） */}
          <span className="rt__id">#{routine.id}</span>
          {meta}
        </span>
      </span>
    </button>
  );
}
