import { Suspense } from 'react';
import { NightShiftScreen } from './NightShiftScreen';

/**
 * 夜勤詳細（docs/specs/13-web-nightshift.md）。`?date=` `?taskId=` を読む
 * `useSearchParams` は静的 export では Suspense 境界が必要なので、合成本体を分けて包む。
 */
export default function NightShiftPage() {
  return (
    <Suspense>
      <NightShiftScreen />
    </Suspense>
  );
}
