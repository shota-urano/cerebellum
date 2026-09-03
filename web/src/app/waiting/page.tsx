import { Suspense } from 'react';
import { WaitingScreen } from './WaitingScreen';

/**
 * 「あなた待ち」画面（docs/specs/25-web-inbox.md §3.2）。
 *
 * `?kind=` と `?date=` を読む `useSearchParams` は静的 export では Suspense 境界が必要なので、
 * 合成本体を分けて包む（`app/learning/page.tsx` と同じ構図）。
 *
 * 今日のビューの一覧は日付ではなく状態（`?status=open`）で引く（docs/specs/24-inbox.md §3.4）。
 * `?date=` を付けた日は読み取り専用の過去日ビューになり、その日の全項目を `?date=` の1本で引く
 * （docs/specs/29-web-inbox-history.md §3.2・§3.3・docs/specs/28-inbox-history.md）。
 */
export default function WaitingPage() {
  return (
    <Suspense>
      <WaitingScreen />
    </Suspense>
  );
}
