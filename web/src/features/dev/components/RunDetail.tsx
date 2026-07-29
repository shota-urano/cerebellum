import type { Run } from '@/shared/api';
import { RunCard } from '@/shared/ui';
import { findRun, sourceLabel } from '../lib/runKey';

/**
 * run 詳細（docs/specs/19-web-dev-history.md §3.2）。
 * カードは夜勤ビューと同じ `shared/ui/RunCard`（§3.3 の共通化）。
 * 夜勤ビューとの差分は「確認した」チェックが無いことだけ——タスクではないため。
 *
 * 見つからないときの「一覧へ戻る」導線は呼び出し側（DevView）の戻りバーが兼ねる
 * （同じ導線を2つ並べない）。
 */
export function RunDetail({ runs, runKey }: { runs: Run[]; runKey: string }) {
  const run = findRun(runs, runKey);

  if (!run) {
    return <div className="empty">この run は見つかりません</div>;
  }

  return <RunCard run={run} title={sourceLabel(run) + ' — ' + run.pj} />;
}
