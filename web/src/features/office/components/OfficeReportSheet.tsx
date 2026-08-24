'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Markdown } from '@/shared/ui';
import { type OfficeEmployee, type OfficeRun } from '../lib/office';

export type OfficeReportSheetProps = {
  employee: OfficeEmployee | undefined;
  run: OfficeRun | undefined;
  requestedRunId: string;
};

/** 選択した社員の直近報告。URL は `/office?run=` のためブラウザバックでも閉じられる。 */
export function OfficeReportSheet({ employee, run, requestedRunId }: OfficeReportSheetProps) {
  const [expanded, setExpanded] = useState(false);
  const missing = !run || !employee;

  return (
    <div className="of2__sheet-layer" role="presentation">
      <Link className="of2__sheet-backdrop" href="/office" scroll={false} aria-label="報告を閉じる" />
      <section
        className={'of2__sheet' + (run?.outcome === 'failed' ? ' of2__sheet--bad' : '')}
        role="dialog"
        aria-modal="true"
        aria-labelledby="office-report-title"
      >
        <div className="of2__sheet-grip" aria-hidden="true" />
        <div className="of2__sheet-head">
          <div>
            <p className="mono of2__sheet-state">
              {missing ? 'NOT FOUND' : run.outcome === 'failed' ? '失敗' : '直近の報告'}
            </p>
            <h2 className="of2__sheet-title" id="office-report-title">
              {missing ? 'その run は見つかりません' : employee.name}
            </h2>
            {!missing && <p className="mono of2__sheet-shift">{employee.shift?.label ?? '—'}</p>}
          </div>
          <Link className="mono of2__sheet-close" href="/office" scroll={false}>
            閉じる
          </Link>
        </div>

        {missing ? (
          <p className="of2__sheet-copy">run_id: {requestedRunId}</p>
        ) : (
          <>
            <p className="of2__sheet-copy of2__headline">{run.headline ?? '報告の要約はありません'}</p>
            <dl className="mono of2__meta">
              <div><dt>RUN</dt><dd>{run.run_number ?? '—'}</dd></div>
              <div><dt>予定</dt><dd>{run.scheduled_for?.slice(0, 16).replace('T', ' ') ?? '—'}</dd></div>
              <div><dt>開始</dt><dd>{run.started_at?.slice(0, 16).replace('T', ' ') ?? '—'}</dd></div>
              <div><dt>状態</dt><dd>{run.status ?? '—'}</dd></div>
              <div><dt>起動</dt><dd>{run.trigger ?? '—'}</dd></div>
            </dl>
            <button
              type="button"
              className="mono of2__report-button"
              aria-expanded={expanded}
              onClick={() => setExpanded((open) => !open)}
            >
              {expanded ? '報告を閉じる' : '報告を見る'}
            </button>
            {expanded && (
              <div className="of2__report-body">
                {run.output === null ? (
                  <p className="dg__text">報告全文は保持期間外です</p>
                ) : (
                  <Markdown md={run.output} />
                )}
                {run.truncated && <p className="mono of2__truncated">報告は途中で切れています</p>}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
