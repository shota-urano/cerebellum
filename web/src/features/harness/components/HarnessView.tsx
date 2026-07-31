'use client';

import { useState } from 'react';
import type { HarnessProposalDto } from '@/shared/api';
import { ErrorBanner, Toast } from '@/shared/ui';
import { useDecision } from '../hooks/useDecision';
import { useFailedProposals, useHarnessProposals } from '../hooks/useHarnessProposals';
import { headingOf, splitByFailure } from '../lib/proposal';
import { ProposalCard } from './ProposalCard';

export type HarnessViewProps = {
  /** `GET /api/harness/proposals?date=` の `{date}`。`today` または `YYYY-MM-DD` */
  date: string;
};

function Skeleton() {
  return (
    <div aria-busy="true" aria-live="polite">
      {[0, 1, 2].map((index) => (
        <section className="panel dg hn__card" key={index}>
          <p className="mono hn__badge">
            <span className="skel" style={{ width: 96 }}>&nbsp;</span>
          </p>
          <p className="hn__summary">
            <span className="skel" style={{ width: '86%' }}>&nbsp;</span>
          </p>
          <p className="mono hn__insight">
            <span className="skel" style={{ width: '52%' }}>&nbsp;</span>
          </p>
        </section>
      ))}
    </div>
  );
}

/**
 * 未着の赤帯（docs/specs/18-web-harness.md §4・docs/specs/17-harness-approval.md §3.5）。
 * **空リストを「今日は提案なし」と書かない**——night-harness は3件全 killed の日も3件送るので、
 * 空配列は「届いていない」ことを意味する。Slack 廃止後はここが唯一の異常検知路になる。
 */
function NotReceived() {
  return (
    <div className="banner hn__missing" role="alert">
      <span className="mono banner__tag">🚨</span>
      <span className="banner__text">
        今朝の判定が届いていません（night-harness の停止かPOST失敗。ログ:{' '}
        <code className="mono dg__code">~/Library/Logs/second-brain-harness.log</code>）
      </span>
    </div>
  );
}

/** ハーネス承認ビュー本体（docs/specs/18-web-harness.md §3）。 */
export function HarnessView({ date }: HarnessViewProps) {
  const { list, error, isLoading, mutate } = useHarnessProposals(date);
  const { failed: failedAcrossDates, failedError } = useFailedProposals();
  const { decide, failure, retry, dismiss } = useDecision(list, mutate);
  // 全文の開閉。1画面で3件片付ける導線を割らないよう、遷移せずその場で開く（§3.1）
  const [openIds, setOpenIds] = useState<number[]>([]);

  const toggleDetail = (id: number) =>
    setOpenIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );

  if (error) {
    // 不正な日付はダイジェスト詳細と同じ扱い
    if (error.code === 'bad_request') {
      return (
        <div className="empty">
          不正な日付です。
          <a className="dg__note" href="/harness">
            今日のハーネス
          </a>
          へ
        </div>
      );
    }
    return <ErrorBanner message={error.message} />;
  }

  if (!list) return isLoading ? <Skeleton /> : null;

  // 見出しの言い換えはその日の kind で決まる（daily / prune / model_switch・§4）
  const kind = list.proposals[0]?.kind ?? 'daily';
  const { failed, rest } = splitByFailure(list.proposals, failedAcrossDates);

  const card = (proposal: HarnessProposalDto, showDate?: boolean) => (
    <ProposalCard
      key={proposal.id}
      proposal={proposal}
      open={openIds.includes(proposal.id)}
      showDate={showDate}
      onToggleDetail={() => toggleDetail(proposal.id)}
      onDecide={(id, status) => void decide(id, status)}
    />
  );

  return (
    <>
      <h1 className="hn__head">
        {headingOf(kind)} — {list.date}
      </h1>

      {list.receivedAt === null && <NotReceived />}

      {/* 失敗一覧の取得エラーは黙らせない（§3.3 の枠が「気づくため」の仕掛けなので、
          取得が落ちたこと自体を出す）。当日一覧はそのまま下に出し、承認作業は続けられる */}
      {failedError && (
        <ErrorBanner message={'未処理の失敗を取得できませんでした: ' + failedError.message} />
      )}

      {/* 未処理の失敗（§3.3）。取得元は `?applyState=failed` なので過去日の失敗もここに出る
          ——失敗が下に埋もれると Slack 廃止後に気づけない。日付はカードに併記する */}
      {failed.length > 0 && (
        <section className="hn__failed" aria-label="未処理の失敗">
          <p className="mono hn__group">未処理の失敗</p>
          {failed.map((proposal) => card(proposal, true))}
        </section>
      )}

      <div className="hn__list">{rest.map((proposal) => card(proposal))}</div>

      {/* 押した先で何が起きるかを画面上で明示する（§3.2） */}
      <p className="hn__foot">チェックしたものが翌朝06:20に自動で適用されます</p>

      {/* decision の POST 失敗はトーストで再試行（§4）。巻き戻して終わりにしない */}
      {failure && (
        <Toast
          message={'承認を記録できませんでした: ' + failure.message}
          actionLabel="再試行"
          onAction={() => void retry()}
          onDismiss={dismiss}
        />
      )}
    </>
  );
}
