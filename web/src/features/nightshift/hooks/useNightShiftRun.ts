'use client';

import { runSource, useRuns } from '@/shared/api';

/**
 * その夜（date = `YYYY-MM-DD`）の夜勤 run を1件返す。night-shift は毎晩1プロジェクトなので、
 * run_id（`YYYY-MM-DD-n`）が date で始まり、**かつ source が `night-shift`（無記載含む）**の
 * 最初の1件＝その夜の実行（一覧は新しい順。docs/specs/13-web-nightshift.md §3）。
 * 同じ日に手動 dev-loop の run（`source=manual`）があっても夜勤ビューには出さない
 * （手動 run は「開発」画面 docs/specs/19-web-dev-history.md の役割。2026-07-29 改訂）。
 */
export function useNightShiftRun(date: string | undefined) {
  const { runs, ready, error, isLoading } = useRuns(Boolean(date));
  const run = date
    ? runs?.find((item) => item.run_id.startsWith(date) && runSource(item) === 'night-shift')
    : undefined;
  return { run, ready, error, isLoading };
}
