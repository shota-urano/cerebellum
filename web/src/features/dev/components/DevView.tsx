'use client';

import Link from 'next/link';
import { useRuns } from '@/shared/api';
import { ErrorBanner } from '@/shared/ui';
import { RunDetail } from './RunDetail';
import { RunList } from './RunList';

export type DevViewProps = {
  /** `?run={pj}/{run_id}`。null なら一覧（docs/specs/19-web-dev-history.md §3） */
  runKey: string | null;
};

function Skeleton() {
  return (
    <div className="panel stack" aria-busy="true" aria-live="polite" style={{ overflow: 'hidden' }}>
      {Array.from({ length: 3 }, (_, i) => (
        <div className="row" key={i}>
          <span className="row__body">
            <span className="row__text" style={{ display: 'block' }}>
              <span className="skel" style={{ width: 120 }}>&nbsp;</span>
            </span>
            <span className="mono row__meta" style={{ display: 'block' }}>
              <span className="skel" style={{ width: '62%' }}>&nbsp;</span>
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * 「開発」画面本体（docs/specs/19-web-dev-history.md）。
 * dev-loop の実行履歴——夜勤も手動も——を一覧し、行タップで run 詳細（PR＋検証動画）を出す。
 * データ源は夜勤ビューアの runs.json（cerebellum のサーバーは経由しない・§2）。
 */
export function DevView({ runKey }: DevViewProps) {
  const { runs, ready, error, isLoading } = useRuns();

  if (error) return <ErrorBanner message={error.message} />;
  if (!ready || !runs) return isLoading ? <Skeleton /> : null;

  if (runKey === null) return <RunList runs={runs} />;

  return (
    <>
      <div className="dg__bar">
        <Link className="mono btn" href="/dev">
          ◀ 一覧へ
        </Link>
      </div>
      <RunDetail runs={runs} runKey={runKey} />
    </>
  );
}
