'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { HarnessView } from '@/features/harness';

/**
 * `/harness?date=` の合成（docs/specs/18-web-harness.md §2）。
 * `date` 省略時は今日（サーバーが `today` を解決する）。
 *
 * ドロワーへの「ハーネス」項目追加は docs/specs/18 の別の実装単位（cerebellum-6ub.2）。
 */
export function HarnessScreen() {
  const params = useSearchParams();
  const date = params.get('date') ?? 'today';

  return (
    <main>
      <div className="dg__bar">
        <Link className="mono btn" href="/">
          ◀ 今日へ
        </Link>
      </div>

      <HarnessView date={date} />
    </main>
  );
}
