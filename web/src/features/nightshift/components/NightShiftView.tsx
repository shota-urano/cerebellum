'use client';

import { ErrorBanner, RunCard } from '@/shared/ui';
import { useNightShiftRun } from '../hooks/useNightShiftRun';

export type NightShiftViewProps = {
  /** 対象の夜（`YYYY-MM-DD`）。`today` の解決は呼び出し側が day API で済ませて渡す */
  date?: string;
};

function Skeleton() {
  return (
    <div aria-busy="true" aria-live="polite">
      <section className="panel dg">
        <h2 className="mono dg__head"><span className="skel" style={{ width: 140 }}>&nbsp;</span></h2>
        <p className="dg__text"><span className="skel" style={{ width: '70%' }}>&nbsp;</span></p>
        <p className="dg__text"><span className="skel" style={{ width: '52%' }}>&nbsp;</span></p>
      </section>
    </div>
  );
}

/**
 * 夜勤詳細ビュー本体（docs/specs/13-web-nightshift.md）。
 * その夜に回した1プロジェクトの「PR リンク」と「検証動画」だけを出す。
 * 全 PJ・全実行の一覧は出さない（それは「開発」画面 docs/specs/19 の役割）。
 * カード本体は shared/ui の RunCard（19 §3.3 の共通化）。
 */
export function NightShiftView({ date }: NightShiftViewProps) {
  const { run, ready, error, isLoading } = useNightShiftRun(date);

  if (error) return <ErrorBanner message={error.message} />;
  if (!date || !ready) return !date || isLoading ? <Skeleton /> : null;

  if (!run) {
    return <div className="empty">この夜の夜勤レポはありません（シフトなし、またはレポ未生成）</div>;
  }

  return <RunCard run={run} title={`夜勤レポ — ${run.pj}`} />;
}
