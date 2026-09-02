import { Suspense } from 'react';
import { WaitingScreen } from './WaitingScreen';

/**
 * 「あなた待ち」画面（docs/specs/25-web-inbox.md §3.2）。
 *
 * `?kind=` を読む `useSearchParams` は静的 export では Suspense 境界が必要なので、
 * 合成本体を分けて包む（`app/learning/page.tsx` と同じ構図）。
 * 一覧そのものは `?date=` を取らない——日付ではなく状態（`?status=open`）で引く画面
 * （docs/specs/24-inbox.md §3.4）。
 */
export default function WaitingPage() {
  return (
    <Suspense>
      <WaitingScreen />
    </Suspense>
  );
}
