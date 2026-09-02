'use client';

import Link from 'next/link';
import { InboxView, rosterOf, shiftRosterOf } from '@/features/inbox';
import { useOffice } from '@/features/office';

/**
 * 「あなた待ち」画面（docs/specs/25-web-inbox.md §3.2）。
 *
 * `?date=` を取らない——一覧は日付ではなく状態（`?status=open`）で引くため
 * （docs/specs/24-inbox.md §3.4）。`useSearchParams` を使わないので Suspense 境界も要らない。
 *
 * 名簿（office.json）は :48310 が配信する外部データで、取得口は office feature が持つ（§5）。
 * **ここで組み合わせる**ことで features 間 import を作らない（AGENTS.md ルール5）。
 * 取得できないときは `undefined` のまま渡し、名簿との突合だけを諦める（§3.4）。
 * 未着判定（§3.3）も同じ名簿の突合なので、取れなかったことを `rosterUnavailable` で伝える
 * ——「まだ読み込み中」と「:48310 が停止していて読めない」を画面が区別できるようにする（§6）。
 */
export default function WaitingPage() {
  const { office, error } = useOffice();

  return (
    <main>
      <div className="dg__bar">
        <Link className="mono btn" href="/">
          ◀ 今日へ
        </Link>
      </div>

      <InboxView
        roster={rosterOf(office)}
        shiftRoster={shiftRosterOf(office)}
        rosterUnavailable={Boolean(error)}
      />
    </main>
  );
}
