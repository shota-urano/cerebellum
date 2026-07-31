'use client';

import type { HarnessDecisionInput, HarnessProposalDto } from '@/shared/api';
import { CheckRing, Markdown } from '@/shared/ui';
import { badgeOf, challengeLabel, isFrozen } from '../lib/proposal';
import { CopyPath } from './CopyPath';

type Props = {
  proposal: HarnessProposalDto;
  /** 全文を開いているか（開閉の状態は一覧側が持つ） */
  open: boolean;
  /** 提案の日付を出すか（「未処理の失敗」枠は日付をまたぐので、いつの分か分からないと直せない） */
  showDate?: boolean;
  onToggleDetail: () => void;
  onDecide: (id: number, status: HarnessDecisionInput['status']) => void;
};

/** 適用結果の帯（docs/specs/18-web-harness.md §3.3）。`pending` の行には出さない。 */
function ApplyResult({ proposal }: { proposal: HarnessProposalDto }) {
  if (proposal.applyState === 'applied') {
    return (
      <div className="hn__result">
        <span className="hn__result__tag">✅</span>
        <div className="hn__result__body">
          {/* 文言は ✅「適用済み（{appliedAt}）」で確定（§3.3）。`appliedAt` は
              docs/specs/03-api.md §3 の値を**そのまま**出す——秒・タイムゾーンを落とすと
              適用が走った時刻をログと突き合わせられなくなる */}
          <p className="dg__text">適用済み{proposal.appliedAt ? '（' + proposal.appliedAt + '）' : ''}</p>
          {proposal.snapshotPath && (
            <CopyPath label="スナップショットの置き場所" path={proposal.snapshotPath} />
          )}
        </div>
      </div>
    );
  }

  if (proposal.applyState === 'failed') {
    return (
      <div className="hn__result hn__result--bad" role="alert">
        <span className="hn__result__tag">🚨</span>
        <div className="hn__result__body">
          <p className="dg__text">適用失敗</p>
          {/* error は全文を出す（原因が切れると手で直せない・§3.3） */}
          {proposal.error && <p className="mono hn__err">{proposal.error}</p>}
        </div>
      </div>
    );
  }

  return null;
}

/**
 * 提案カード（docs/specs/18-web-harness.md §3.1）。
 * 上から 判定バッジ → 1行要約（最も大きく） → 敵対レビューの結論 → Insight名 → 操作。
 *
 * `killed` は**承認操作を持たない**（同 §3.1 の表「操作なし」・淡色）。
 * 「全文を読む」は表示の開閉であって承認操作ではないので、`killed` でも残す
 * （なぜ見送られたかを読めることに意味がある）。
 */
export function ProposalCard({ proposal, open, showDate, onToggleDetail, onDecide }: Props) {
  const killed = proposal.verdict === 'killed';
  // 適用が動いた行は承認操作を**無効化して見せる**（§4）。消さない理由は `isFrozen` を参照
  const frozen = isFrozen(proposal);
  const approved = proposal.status === 'approved';
  const rejected = proposal.status === 'rejected';

  return (
    <section
      className={'panel dg hn__card' + (killed ? ' hn__card--killed' : '')}
      aria-label={proposal.summary}
    >
      <ApplyResult proposal={proposal} />

      <p className="mono hn__badge">
        {badgeOf(proposal)}
        {showDate && <span className="hn__date">{proposal.date}</span>}
      </p>
      <p className="hn__summary">{proposal.summary}</p>

      {proposal.challengeVerdict && (
        <p className="hn__chal">
          <span className="mono hn__chal__tag">⚔️ {challengeLabel(proposal.challengeVerdict)}</span>
          {proposal.challengeNote && <span className="hn__chal__note">{proposal.challengeNote}</span>}
        </p>
      )}

      <p className="mono hn__insight">{proposal.insightName}</p>

      <div className="hn__acts">
        {/* 承認操作の軸を持つのは `killed` 以外（§3.1 の表）。適用が動いた行はここを
            `disabled` にして残す——「無効化」であって非表示ではない（§4・`isFrozen`） */}
        {!killed && (
          <>
            <button
              type="button"
              className={'hn__check' + (approved ? ' hn__check--on' : '')}
              aria-pressed={approved}
              disabled={frozen}
              onClick={() => onDecide(proposal.id, approved ? 'proposed' : 'approved')}
            >
              <CheckRing done={approved} />
              <span>採用する</span>
            </button>
            <button
              type="button"
              className={'mono btn hn__reject' + (rejected ? ' hn__reject--on' : '')}
              aria-pressed={rejected}
              disabled={frozen}
              onClick={() => onDecide(proposal.id, rejected ? 'proposed' : 'rejected')}
            >
              {rejected ? '見送りを取り消す' : '見送る'}
            </button>
          </>
        )}
        <button type="button" className="mono btn" aria-expanded={open} onClick={onToggleDetail}>
          {open ? '全文を閉じる' : '全文を読む'}
        </button>
      </div>

      {open && (
        <div className="hn__detail">
          <Markdown md={proposal.detailMd} />
          {proposal.detailPath && <CopyPath label="判定文のパス" path={proposal.detailPath} />}
        </div>
      )}
    </section>
  );
}
