'use client';

import Link from 'next/link';
import { WaitingView } from '@/features/waiting';

/**
 * 「あなた待ち」画面（docs/specs/23-web-waiting.md）。
 *
 * ハーネス承認と違い `?date=` を取らない——一覧は日付ではなく状態（`?status=proposed`）で
 * 引くため（docs/specs/22-daily-intake.md §3.5）。`useSearchParams` を使わないので
 * Suspense 境界も要らない。
 */
export default function WaitingPage() {
  return (
    <main>
      <div className="dg__bar">
        <Link className="mono btn" href="/">
          ◀ 今日へ
        </Link>
      </div>

      <WaitingView />
    </main>
  );
}
