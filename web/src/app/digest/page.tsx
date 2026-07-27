import { Suspense } from 'react';
import { DigestScreen } from './DigestScreen';

/**
 * ダイジェスト詳細（docs/specs/12-web-digest.md）。`?date=` `?section=` `?taskId=` を読む
 * `useSearchParams` は静的 export では Suspense 境界が必要なので、合成本体を分けて包む。
 */
export default function DigestPage() {
  return (
    <Suspense>
      <DigestScreen />
    </Suspense>
  );
}
