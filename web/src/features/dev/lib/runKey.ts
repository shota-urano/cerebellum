import { runSource, type Run } from '@/shared/api';

/**
 * 詳細 URL の `?run=` に載せる run の識別子（`{pj}/{run_id}`。docs/specs/19-web-dev-history.md §2）。
 * run_id は PJ をまたぐと重複し得る（`YYYY-MM-DD-n`）ので、PJ と対で一意にする。
 */
export function runKeyOf(run: Run): string {
  return run.pj + '/' + run.run_id;
}

/** `?run=` の値から該当 run を1件返す（無ければ undefined＝「この run は見つかりません」） */
export function findRun(runs: Run[], key: string): Run | undefined {
  return runs.find((run) => runKeyOf(run) === key);
}

/** 一覧のバッジと詳細の見出しに使う source の日本語ラベル（夜勤=🌙 / 手動=🔧。§3.1） */
export function sourceLabel(run: Run): string {
  return runSource(run) === 'manual' ? '🔧 手動' : '🌙 夜勤';
}
