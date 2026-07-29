import { Suspense } from 'react';
import { LearningScreen } from './LearningScreen';

/**
 * 学習セッション（docs/specs/15-web-learning.md）。`?date=` `?taskId=` を読む
 * `useSearchParams` は静的 export では Suspense 境界が必要なので、合成本体を分けて包む。
 */
export default function LearningPage() {
  return (
    <Suspense>
      <LearningScreen />
    </Suspense>
  );
}
