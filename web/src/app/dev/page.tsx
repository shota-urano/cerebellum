import { Suspense } from 'react';
import { DevScreen } from './DevScreen';

/**
 * 「開発」画面（docs/specs/19-web-dev-history.md）。`?run=` を読む `useSearchParams` は
 * 静的 export では Suspense 境界が必要なので、合成本体をクライアント側に分けて包む。
 */
export default function DevPage() {
  return (
    <Suspense>
      <DevScreen />
    </Suspense>
  );
}
