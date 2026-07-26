'use client';

import { ErrorBanner, VAULT_UNAVAILABLE_MESSAGE } from '@/shared/ui';
import { useSummary } from '../hooks/useSummary';
import { useToday } from '../hooks/useToday';
import { WEEK_DAYS, buildWeek } from '../lib/week';
import { SegmentBar } from './SegmentBar';

type Props = {
  /** ハイライトする行 */
  selected: string | null;
  onSelect: (iso: string) => void;
};

/** 記録なし日のバーは全区画 void。区画数は素材と同じ既定値を使う。 */
const VOID_SEGMENTS = 11;

/** 取得前のプレースホルダ行（素材に無し。`docs/design/03-history.md`「未定事項」） */
function SkeletonRows() {
  return (
    <div aria-busy="true">
      {Array.from({ length: WEEK_DAYS }, (_, i) => (
        <div className="week__row" key={i}>
          <span className="mono week__date"><span className="skel" style={{ width: 40 }}>&nbsp;</span></span>
          <span className="mono week__ratio"><span className="skel" style={{ width: 34 }}>&nbsp;</span></span>
          <span className="week__bar">
            <SegmentBar done={0} total={VOID_SEGMENTS} voided height={4} gap={2} />
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * 直近7日サマリ（docs/specs/09 §3）。行タップでその日の表示へ移動する。
 * 様式の正本は `docs/design/03-history.md`（`.week` in globals.css）。
 */
export function WeekSummary({ selected, onSelect }: Props) {
  // 7日分の日付は「今日」起点で組む（サーバー由来。docs/specs/09 §3）
  const { today, error: todayError } = useToday();
  const { summary, error: summaryError } = useSummary();

  const rows = today === undefined ? null : buildWeek(today, summary ?? []);

  return (
    <section className="panel week">
      <div className="mono label" style={{ marginBottom: 12 }}>LAST 7 DAYS</div>

      {summaryError && (
        <ErrorBanner
          message={summaryError.code === 'vault_unavailable' ? VAULT_UNAVAILABLE_MESSAGE : summaryError.message}
        />
      )}

      {rows === null ? (
        // 一度も取れていないままエラーになったら行は出さない（永久スケルトンにしない。docs/specs/08 §6 と同じ扱い）
        summaryError || todayError ? null : <SkeletonRows />
      ) : (
        rows.map((row) => (
          <button
            type="button"
            key={row.iso}
            className={'week__row' + (row.iso === selected ? ' week__row--sel' : '')}
            onClick={() => onSelect(row.iso)}
          >
            <span className="mono week__date">{row.date}</span>
            <span className="mono week__ratio">{row.done === null ? '記録なし' : row.done + '/' + row.total}</span>
            <span className="week__bar">
              <SegmentBar
                done={row.done ?? 0}
                total={row.total ?? VOID_SEGMENTS}
                voided={row.done === null}
                height={4}
                gap={2}
              />
            </span>
          </button>
        ))
      )}
    </section>
  );
}
