'use client';

import { useState } from 'react';
import type { InboxItemDto } from '@/shared/api';
import { ErrorBanner, Toast } from '@/shared/ui';
import { useInboxDecision } from '../hooks/useInboxDecision';
import { useFailedInboxItems, useInboxItems } from '../hooks/useInboxItems';
import { useInboxSummary } from '../hooks/useInboxSummary';
import {
  groupByKind,
  kindEffect,
  kindLabel,
  localToday,
  partition,
  senderOf,
  type InboxRosterEntry,
} from '../lib/item';
import { missingSources, type InboxShiftEntry } from '../lib/missing';
import { InboxItemRow } from './InboxItemRow';
import { InboxMissing } from './InboxMissing';

export type InboxViewProps = {
  /**
   * 送信元 → 表示名の対応（docs/specs/25-web-inbox.md §3.2・§5）。
   * office.json の取得は app 層が行い（features 間 import を作らないため）、
   * 読めていないときは `undefined` が来る＝名簿との突合を諦める（§3.4）。
   */
  roster?: InboxRosterEntry[];
  /**
   * 未着判定に使う名簿の行（`review.cadence = "shift"` の社員だけ・§3.3-1）。
   * `roster` と同じく **app 層が office.json から作って渡す**（features 間 import を作らない・§5）。
   * `undefined` は「名簿と突き合わせられていない」＝未着判定を諦める（§3.3 末尾）。
   */
  shiftRoster?: InboxShiftEntry[];
  /**
   * office.json の取得が失敗した（:48310 停止など・§6）。**読み込み中と区別する**ために
   * 別の prop で受ける——`shiftRoster` が `undefined` なだけでは「まだ」か「取れない」かが
   * 分からず、諦めた旨の1行（§3.3 末尾）を出す時機を誤る。
   */
  rosterUnavailable?: boolean;
};

function Skeleton() {
  return (
    <div aria-busy="true" aria-live="polite">
      {[0, 1, 2].map((index) => (
        <section className="panel dg wt__card" key={index}>
          <p className="wt__from">
            <span className="skel" style={{ width: '32%' }}>&nbsp;</span>
          </p>
          <p className="wt__title wt__title--flat">
            <span className="skel" style={{ width: '84%' }}>&nbsp;</span>
          </p>
        </section>
      ))}
    </div>
  );
}

/**
 * 「あなた待ち」画面（docs/specs/25-web-inbox.md §3.2）。
 *
 * **kind でグループし、文言は kind で固定する**。送信元ごとの文言・専用コンポーネントを
 * 作らない——作った時点でハーネスごとの専用画面が再発する（同 §4・docs/specs/24-inbox.md §1）。
 */
export function InboxView({ roster, shiftRoster, rosterUnavailable }: InboxViewProps) {
  const { list, error, isLoading, mutate } = useInboxItems();
  const { failed: failedAcrossDates, failedError } = useFailedInboxItems();
  // 未着判定の受信側の根拠（§3.3-2）。受信の事実はサーバしか持たない（24 §3.5）
  const { summary, summaryError } = useInboxSummary();
  const { decide, failure, retry, dismiss } = useInboxDecision(list, mutate);
  // `bodyMd` の開閉。1画面で片付ける導線を割らないよう、遷移せずその場で開く（§3.2）
  const [openIds, setOpenIds] = useState<number[]>([]);

  const toggleBody = (id: number) =>
    setOpenIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );

  // 取得できていない段でのエラーは画面全体で出す。描画済みの行があるときは
  // バナーを足すだけで**行は保持する**（§6「ErrorBanner＋再検証待ち」）
  if (!list) {
    if (error) return <ErrorBanner message={error.message} />;
    return isLoading ? <Skeleton /> : null;
  }

  const today = localToday();
  const { failed, pending, decided } = partition(list.items, failedAcrossDates);
  const groups = groupByKind(pending);
  // 名簿 × 勤務帯 × 受信の突合（§3.3）。0件の受信も「届いた」なので未着にはならない
  const missing = missingSources(shiftRoster, summary?.sources);

  const row = (item: InboxItemDto, options?: { decided?: boolean; showDate?: boolean }) => (
    <InboxItemRow
      key={item.id}
      item={item}
      sender={senderOf(item.source, roster)}
      // 業務日は今日でなければ小さく添える（§3.2）。持ち越しの合図を薄めない
      showDate={options?.showDate ?? item.date !== today}
      decided={options?.decided}
      open={openIds.includes(item.id)}
      onToggleBody={() => toggleBody(item.id)}
      onDecide={(id, decision) => void decide(id, decision)}
    />
  );

  return (
    <>
      <h1 className="wt__head">あなた待ち</h1>

      {error && <ErrorBanner message={error.message} />}

      {/* 失敗一覧の取得エラーは黙らせない（枠が「気づくため」の仕掛けなので、
          取得が落ちたこと自体を出す）。未決の一覧はそのまま下に出し、作業は続けられる */}
      {failedError && (
        <ErrorBanner message={'未処理の失敗を取得できませんでした: ' + failedError.message} />
      )}

      {/* summary が取れないと未着は判定できない。判定を黙って落とさず、取得の失敗として出す
          （§6 の「`/api/inbox/*` 500・通信失敗 → ErrorBanner」。office.json 側の失敗と違い
          こちらは cerebellum の API なので、名簿の1行notice ではなくバナーで扱う） */}
      {summaryError && (
        <ErrorBanner message={'受信の状況を取得できませんでした: ' + summaryError.message} />
      )}

      {/* 未着（§3.3）。失敗枠より上——監視の監視がここしか無い（24 §9） */}
      <InboxMissing entries={missing} unavailable={rosterUnavailable} />

      {/* 未処理の失敗（§3.2）。取得元は `?applyState=failed` なので過去日の失敗もここに出る
          ——下に埋もれると気づけないので**最上部**に固定し、日付をカードに併記する */}
      {failed.length > 0 && (
        <section className="wt__failed" aria-label="未処理の失敗">
          <p className="mono wt__group">未処理の失敗</p>
          {failed.map((item) => row(item, { decided: true, showDate: true }))}
        </section>
      )}

      {groups.map((group) => (
        <section className="wt__kind" key={group.kind} aria-label={kindLabel(group.kind)}>
          <p className="mono wt__group wt__group--kind">
            {kindLabel(group.kind)}
            <span className="wt__count">{group.items.length}</span>
          </p>
          {/* そこで押すと何が起きるかを見出しの直下に1行で書く（§3.2） */}
          <p className="wt__effect">{kindEffect(group.kind)}</p>
          {group.items.map((item) => row(item))}
        </section>
      ))}

      {groups.length === 0 && failed.length === 0 && decided.length === 0 && (
        <p className="empty">確認待ちはありません。</p>
      )}

      {/* 今日決めたもの（§3.2）。誤タップの救済路なので、決着直後に消さず畳んで残す */}
      {decided.length > 0 && (
        <section className="wt__done" aria-label="今日決めたもの">
          <p className="mono wt__group wt__group--kind">今日決めたもの</p>
          {decided.map((item) => row(item, { decided: true }))}
        </section>
      )}

      {/* decision の POST 失敗はトーストで再試行（§6）。巻き戻して終わりにしない */}
      {failure && (
        <Toast
          message={'記録できませんでした: ' + failure.message}
          actionLabel="再試行"
          onAction={() => void retry()}
          onDismiss={dismiss}
        />
      )}
    </>
  );
}
