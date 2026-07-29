'use client';

import { useSearchParams } from 'next/navigation';
import { DevView } from '@/features/dev';

/**
 * 「開発」画面の合成（docs/specs/19-web-dev-history.md）。
 * `?run={pj}/{run_id}` があれば詳細、無ければ一覧。どちらも同じ経路（`/dev`）なので
 * ブラウザバックで一覧へ戻れる（§3.1-3）。
 */
export function DevScreen() {
  const runKey = useSearchParams().get('run');

  return (
    <main>
      <DevView runKey={runKey} />
    </main>
  );
}
