'use client';

import { ErrorBanner } from '@/shared/ui';
import { useOffice } from '../hooks/useOffice';
import { localDate, splitByEnabled, staleHours } from '../lib/office';
import { ShiftBand } from './ShiftBand';

function Skeleton() {
  return (
    <div className="panel stack" aria-busy="true" aria-live="polite" style={{ overflow: 'hidden' }}>
      {Array.from({ length: 4 }, (_, i) => (
        <div className="row of__row" key={i}>
          <span className="mono of__shift">
            <span className="skel" style={{ width: 62 }}>&nbsp;</span>
          </span>
          <span className="of__main">
            <span className="row__text of__name">
              <span className="skel" style={{ width: '58%' }}>&nbsp;</span>
            </span>
            <span className="row__meta of__line">
              <span className="skel" style={{ width: '80%' }}>&nbsp;</span>
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * 「オフィス」画面本体（docs/specs/20-web-office.md §3）。
 * 無人稼働している automation が「いつ動く役なのか」「直近で何を出したのか」を勤務帯で出す。
 * データ源は :48310 の office.json（cerebellum のサーバーは経由しない・§2）。
 *
 * run 詳細（`/office?run=`）は別の実装単位（§実装単位の2件目）。ここでは帯までを持つ。
 */
export function OfficeView() {
  const { office, ready, error, isLoading } = useOffice();

  if (error) return <ErrorBanner message={error.message} />;
  if (!ready || !office) return isLoading ? <Skeleton /> : null;

  const employees = office.employees ?? [];
  const runs = office.runs ?? [];
  // 端末時計を使う（サーバー由来の日付が無い画面。lib の localDate のコメント参照）
  const now = new Date();
  const stale = staleHours(office.generated_at, now.getTime());
  const { onDuty, stopped } = splitByEnabled(employees);

  return (
    <>
      {stale !== null && (
        // 生成の停止に気付けるようにする。エラーにはしない（§6）
        <div className="dg__warn of__stale">
          <span className="mono banner__tag">!</span>
          <p className="dg__text">データが {stale} 時間前のものです</p>
        </div>
      )}

      {employees.length === 0 ? (
        <div className="empty">登録されている automation がありません</div>
      ) : (
        <>
          <ShiftBand title="勤務帯" employees={onDuty} runs={runs} today={localDate(now)} />
          {stopped.length > 0 && (
            <ShiftBand
              title="停止中"
              employees={stopped}
              runs={runs}
              today={localDate(now)}
              stopped
            />
          )}
        </>
      )}
    </>
  );
}
