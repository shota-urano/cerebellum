'use client';

import { useState } from 'react';
import { ErrorBanner } from '@/shared/ui';
import { useInboxByDate } from '../hooks/useInboxItems';
import { senderOf, type InboxRosterEntry } from '../lib/item';
import { InboxItemRow } from './InboxItemRow';
import { InboxSkeleton } from './InboxSkeleton';

type Props = {
  /** 表示する業務日（`YYYY-MM-DD`）。今日以外がここへ来る（docs/specs/29-web-inbox-history.md §3.3） */
  date: string;
  /** 送信元 → 表示名の対応（docs/specs/25-web-inbox.md §3.2・§5。取得は app 層） */
  roster?: InboxRosterEntry[];
};

/**
 * 過去日のビュー（docs/specs/29-web-inbox-history.md §3.2）。**読み取り専用**
 * （docs/specs/09-web-history.md §3 の過去日と同じ姿勢）。
 *
 * - その日に届いた全項目を **1列・id 降順**（サーバ返却順のまま・§4）で並べる。
 *   kind でグループしない・未決グループも作らない——役割は「その日に何が届いて自分が
 *   どうしたか」を読むことで、決める場所ではない（§3.2-1）
 * - 各行は状態表示だけ（`InboxItemRow` の `readonly`）。**決定ボタン・ラジオを出さない**（§3.2-2）
 * - 固定文言（25 §3.2 の表「押すと何が起きるか」）も出さない——押せない画面に
 *   押した結果の説明を置かない（§4）
 * - 失敗枠（最上部の「未処理の失敗」）と未着判定は**出さない**（§3.2-4）。どちらも
 *   「いま気づくべき異常」の枠で、過去日には意味が無い（未着は今日 due の突合＝25 §3.3）。
 *   その日の `failed` 行は行内の帯（`apply_error` の等幅表示）で足りる
 * - `?kind=` フィルタは無視する（グループしないため・§3.2-5）
 *
 * 取得は `?date=` の1本だけ（§2）。`?status=open` / `?applyState=failed` は**引かない**
 * ——出さない枠のために取得を走らせない。
 */
export function InboxDateView({ date, roster }: Props) {
  const { dated, datedError, datedLoading } = useInboxByDate(date);
  // `bodyMd` の開閉。読み返しが目的なので、その場で開ける（§3.2-3）
  const [openIds, setOpenIds] = useState<number[]>([]);

  const toggleBody = (id: number) =>
    setOpenIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );

  return (
    <>
      <h1 className="wt__head">あなた待ち</h1>

      {/* `?date=` の 500・通信失敗（§6）。文言はサーバーの message をそのまま出す（07 §6） */}
      {datedError && <ErrorBanner message={datedError.message} />}

      {/* 取得できていないときは**0件と言い切らない**（§6）。空表示は取得できた0件だけに出す */}
      {!dated ? (
        datedError ? null : datedLoading ? (
          <InboxSkeleton />
        ) : null
      ) : dated.items.length === 0 ? (
        <p className="empty">この日に届いたものはありません。</p>
      ) : (
        dated.items.map((item) => (
          <InboxItemRow
            key={item.id}
            item={item}
            sender={senderOf(item.source, roster)}
            // 業務日は今日でなければ小さく添える（25 §3.2）。過去日は全行が該当する
            showDate
            readonly
            open={openIds.includes(item.id)}
            onToggleBody={() => toggleBody(item.id)}
          />
        ))
      )}
    </>
  );
}
