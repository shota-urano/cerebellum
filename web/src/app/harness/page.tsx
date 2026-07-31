import { Suspense } from 'react';
import { HarnessScreen } from './HarnessScreen';

/**
 * ハーネス承認ビュー（docs/specs/18-web-harness.md）。`?date=` を読む
 * `useSearchParams` は静的 export では Suspense 境界が必要なので、本体を分けて包む。
 */
export default function HarnessPage() {
  return (
    <Suspense>
      <HarnessScreen />
    </Suspense>
  );
}
