'use client';

import { useState } from 'react';
import type { IntakeCandidateDto, IntakeDecisionInput } from '@/shared/api';
import { CheckRing } from '@/shared/ui';
import { isFrozen } from '../lib/candidate';
import { CopyPath } from './CopyPath';

type Props = {
  candidate: IntakeCandidateDto;
  /** 元ノートの日付を出すか（複数日ぶんが残っているときだけ・docs/specs/23-web-waiting.md §3.1） */
  showDate?: boolean;
  onDecide: (id: number, status: IntakeDecisionInput['status']) => void;
};

/**
 * 反映失敗の帯（docs/specs/23-web-waiting.md §3.4）。
 *
 * 主因は「候補ファイルの原文が編集されて行が見つからない」（docs/specs/22-daily-intake.md §8）
 * なので、**エラー文は全文をそのまま出す**——人間がターミナルで直すための情報が切れると、
 * 失敗を見せている意味が無くなる。
 */
function ApplyFailure({ candidate }: { candidate: IntakeCandidateDto }) {
  if (candidate.applyState !== 'failed') return null;

  return (
    <div className="wt__result" role="alert">
      <span className="wt__result__tag">🚨</span>
      <div className="wt__result__body">
        <p className="dg__text">反映失敗</p>
        {candidate.error && <p className="mono wt__err">{candidate.error}</p>}
      </div>
    </div>
  );
}

/**
 * 候補カード（docs/specs/23-web-waiting.md §3.2）。
 * 上から 反映失敗の帯（あれば）→ **原文**（最も大きく・引用の様式）→ 補足 → 操作。
 *
 * 要約は存在しない（送信側が原文引用主義）ので、判断材料は原文そのもの。
 */
export function CandidateCard({ candidate, showDate, onDecide }: Props) {
  // 適用が動いた行は承認操作を**無効化して見せる**（§4）。消さないのは、
  // apply-result は `status = approved` の行にしか書き戻せない＝必ず「自分が✅した行」であり、
  // チェックを消すと承認した記録が画面から消えてしまうため
  const frozen = isFrozen(candidate);
  const approved = candidate.status === 'approved';
  const rejected = candidate.status === 'rejected';
  const decided = approved || rejected;
  const [pathOpen, setPathOpen] = useState(false);

  return (
    <section
      className={'panel dg wt__card' + (decided ? ' wt__card--decided' : '')}
      aria-label={candidate.text}
    >
      <ApplyFailure candidate={candidate} />

      <p className="wt__text">{candidate.text}</p>
      {candidate.note && <p className="wt__note">{candidate.note}</p>}

      <div className="wt__acts">
        <button
          type="button"
          className={'wt__check' + (approved ? ' wt__check--on' : '')}
          aria-pressed={approved}
          disabled={frozen}
          onClick={() => onDecide(candidate.id, approved ? 'proposed' : 'approved')}
        >
          <CheckRing done={approved} />
          <span>残す</span>
        </button>
        <button
          type="button"
          className={'mono btn wt__reject' + (rejected ? ' wt__reject--on' : '')}
          aria-pressed={rejected}
          disabled={frozen}
          onClick={() => onDecide(candidate.id, rejected ? 'proposed' : 'rejected')}
        >
          {rejected ? '捨てるのを取り消す' : '捨てる'}
        </button>
        {showDate && <span className="mono wt__date">{candidate.date} のノート</span>}
        <button
          type="button"
          className="mono wt__more"
          aria-expanded={pathOpen}
          onClick={() => setPathOpen((current) => !current)}
        >
          {pathOpen ? '出どころを閉じる' : '出どころ'}
        </button>
      </div>

      {pathOpen && (
        <div className="wt__src">
          <CopyPath label="候補ファイルのパス" path={candidate.sourcePath} />
          {candidate.sourceNote && <CopyPath label="元ノートのパス" path={candidate.sourceNote} />}
        </div>
      )}
    </section>
  );
}
