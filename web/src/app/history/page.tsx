import { Suspense } from 'react';
import { HistoryScreen } from './HistoryScreen';

/**
 * 「履歴」画面（docs/specs/09）。`?date=` を読む `useSearchParams` は静的 export では
 * Suspense 境界が必要なので、合成本体をクライアント側に分けて包む。
 */
export default function HistoryPage() {
  return (
    <Suspense>
      <HistoryScreen />
    </Suspense>
  );
}
