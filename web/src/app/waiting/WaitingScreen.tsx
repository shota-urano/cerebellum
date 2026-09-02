'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type { InboxKind } from '@/shared/api';
import { InboxView, rosterOf, shiftRosterOf } from '@/features/inbox';
import { useOffice } from '@/features/office';

/** `?kind=` の語彙は DTO の4値だけ（docs/specs/03-api.md §3）。未知の値は絞り込まない */
const KINDS: InboxKind[] = ['alert', 'approve', 'choose', 'read'];

function kindOf(value: string | null): InboxKind | undefined {
  return KINDS.find((kind) => kind === value);
}

/**
 * 「あなた待ち」画面の合成（docs/specs/25-web-inbox.md §3.2）。
 *
 * 一覧は日付ではなく状態（`?status=open`）で引く（docs/specs/24-inbox.md §3.4）。
 * 画面の `?kind=` は**表示の絞り込みだけ**で、取得のクエリではない
 * ——「今日」第3段の件数から入ったとき、その種類が並んだ状態で開くための導線（同 §3.1）。
 *
 * 名簿（office.json）は :48310 が配信する外部データで、取得口は office feature が持つ（§5）。
 * **ここで組み合わせる**ことで features 間 import を作らない（AGENTS.md ルール5）。
 * 取得できないときは `undefined` のまま渡し、名簿との突合だけを諦める（§3.4）。
 * 未着判定（§3.3）も同じ名簿の突合なので、取れなかったことを `rosterUnavailable` で伝える
 * ——「まだ読み込み中」と「:48310 が停止していて読めない」を画面が区別できるようにする（§6）。
 */
export function WaitingScreen() {
  const { office, error } = useOffice();
  const params = useSearchParams();

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
        kind={kindOf(params.get('kind'))}
      />
    </main>
  );
}
