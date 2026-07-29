import Link from 'next/link';
import type { Run } from '@/shared/api';
import { runKeyOf, sourceLabel } from '../lib/runKey';

/**
 * run 履歴の一覧（docs/specs/19-web-dev-history.md §3.1）。
 * 並びは**サーバー返却順のまま**（runs.json が新しい順。クライアントで再ソートしない）。
 * 様式は履歴画面のリスト（`.panel` + `.row`）を流用する（§8）。
 */
export function RunList({ runs }: { runs: Run[] }) {
  if (runs.length === 0) {
    return <div className="empty">実行履歴はありません</div>;
  }

  return (
    <div className="panel stack" style={{ overflow: 'hidden' }}>
      <div className="mono list__head">
        <span>RUNS</span>
        <span>{runs.length} ITEMS</span>
      </div>
      {runs.map((run) => (
        <RunRow key={runKeyOf(run)} run={run} />
      ))}
    </div>
  );
}

/** 1行＝1 run。行タップで `?run=` 付き URL へ遷移する（ブラウザバックで一覧へ戻れる・§3.1-3） */
function RunRow({ run }: { run: Run }) {
  // 失敗・blocked が残っている run は目立たせる（§3.1-2）
  const failed = run.failed > 0;
  const blocked = run.blocked > 0;

  return (
    <Link
      className="row row--tap"
      href={'/dev?run=' + encodeURIComponent(runKeyOf(run))}
      aria-label={run.pj + ' ' + run.run_id + ' の詳細を開く'}
    >
      <span className="row__body">
        <span className="row__text" style={{ display: 'block' }}>
          {run.pj}
          <span className="mono dev__badge">{sourceLabel(run)}</span>
        </span>
        <span className="mono row__meta" style={{ display: 'block' }}>
          {run.run_id} ／ 完了 {run.passed} ·{' '}
          <span className={failed ? 'dev__bad' : undefined}>失敗 {run.failed}</span> ·{' '}
          <span className={blocked ? 'dev__bad' : undefined}>blocked {run.blocked}</span>
        </span>
      </span>
      <span className="mono row__chev" aria-hidden="true">›</span>
    </Link>
  );
}
