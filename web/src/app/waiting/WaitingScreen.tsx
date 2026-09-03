'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { InboxKind } from '@/shared/api';
import { InboxView, localToday, rosterOf, shiftRosterOf } from '@/features/inbox';
import { useOffice } from '@/features/office';
import { isValidDateParam, shiftDate } from '@/shared/lib';
import { DateNav } from '@/shared/ui';

/** `?kind=` の語彙は DTO の4値だけ（docs/specs/03-api.md §3）。未知の値は絞り込まない */
const KINDS: InboxKind[] = ['alert', 'approve', 'choose', 'read'];

function kindOf(value: string | null): InboxKind | undefined {
  return KINDS.find((kind) => kind === value);
}

/**
 * 「あなた待ち」画面の合成（docs/specs/25-web-inbox.md §3.2・
 * docs/specs/29-web-inbox-history.md §3.2・§3.3）。
 *
 * 今日のビューの一覧は日付ではなく状態（`?status=open`）で引く（docs/specs/24-inbox.md §3.4）。
 * `?date=` を付けた日は**読み取り専用の過去日ビュー**になる（29 §3.2。取得は `?date=` の1本＝
 * docs/specs/28-inbox-history.md）。画面の `?kind=` は**表示の絞り込みだけ**で、取得のクエリではない
 * ——「今日」第3段の件数から入ったとき、その種類が並んだ状態で開くための導線（同 §3.1）。
 * 過去日では無視される（29 §3.2-5）。
 *
 * 日付ナビ（29 §3.3）は `shared/ui` の `DateNav` を **app 層で合成する**
 * ——`app/history/HistoryScreen.tsx` と同じ分担（feature 間 import を作らない・
 * docs/specs/07-web-foundation.md §3）。カレンダー UI は作らない（09 §4 の決定を踏襲）。
 *
 * 名簿（office.json）は :48310 が配信する外部データで、取得口は office feature が持つ（§5）。
 * **ここで組み合わせる**ことで features 間 import を作らない（AGENTS.md ルール5）。
 * 取得できないときは `undefined` のまま渡し、名簿との突合だけを諦める（§3.4）。
 * 未着判定（§3.3）も同じ名簿の突合なので、取れなかったことを `rosterUnavailable` で伝える
 * ——「まだ読み込み中」と「:48310 が停止していて読めない」を画面が区別できるようにする（§6）。
 */
export function WaitingScreen() {
  const { office, error } = useOffice();
  const router = useRouter();
  const params = useSearchParams();
  const dateParam = params.get('date');

  // 不正な `?date=`（29 §6・09 §6 と同じ扱い）。サーバへ投げれば 400 になる値は手前で弾き、
  // 今日へ戻る導線を出す
  if (dateParam !== null && !isValidDateParam(dateParam)) {
    return (
      <main>
        <div className="empty" style={{ marginTop: 14 }}>
          不正な日付
          <div style={{ marginTop: 10, fontSize: 12.5 }}>
            <Link href="/waiting">今日へ</Link>
          </div>
        </div>
      </main>
    );
  }

  // 「今日」は inbox と同じ境界（深夜0時・ローカルタイム。docs/specs/00-overview.md §4）で決める。
  // ここがずれると、ナビの止まり位置と §3.1 / §3.2 の切り替えが食い違う
  const today = localToday();
  const iso = dateParam ?? today;
  // **翌日方向は今日まで**（未来へ進めない・29 §3.3・09 §3）
  const canNext = iso < today;
  const goto = (date: string) => router.push('/waiting?date=' + date);

  return (
    <main>
      <div className="dg__bar">
        <Link className="mono btn" href="/">
          ◀ 今日へ
        </Link>
        {/* 過去日から今日へ戻る導線を1つ置く（29 §3.3）。`?date=` を落とすだけで §3.1 のビューへ戻る */}
        {iso !== today && (
          <Link className="mono btn" href="/waiting" style={{ marginLeft: 'auto' }}>
            今日
          </Link>
        )}
      </div>

      <DateNav
        iso={iso}
        canNext={canNext}
        onPrev={() => goto(shiftDate(iso, -1))}
        onNext={() => canNext && goto(shiftDate(iso, 1))}
      />

      <InboxView
        date={dateParam ?? undefined}
        roster={rosterOf(office)}
        shiftRoster={shiftRosterOf(office)}
        rosterUnavailable={Boolean(error)}
        kind={kindOf(params.get('kind'))}
      />
    </main>
  );
}
