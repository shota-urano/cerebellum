'use client';

import { useState } from 'react';
import type { LearningGrade, LearningProblemDto } from '@/shared/api';
import { Markdown } from '@/shared/ui';
import { GRADE_CHOICES, gradeLabel } from '../lib/grade';

/**
 * `kind = "code"` の作業ディレクトリ（docs/specs/15-web-learning.md §3.2）。
 * 解く行為はこの画面の外なので、パスをコピーさせて終わり——入力は求めない。
 */
function Workdir({ workdir }: { workdir: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(workdir);
      setCopied(true);
    } catch {
      // クリップボードが使えない環境（権限拒否など）ではパスが見えているので手写しできる
      setCopied(false);
    }
  };

  return (
    <div className="lx__workdir">
      <div className="lx__wdrow">
        <code className="mono lx__path">{workdir}</code>
        <button
          type="button"
          className="mono btn lx__copy"
          aria-label="作業ディレクトリのパスをコピー"
          onClick={() => void copy()}
        >
          {copied ? 'コピー済' : 'コピー'}
        </button>
      </div>
      <p className="mono dg__note">ターミナルで解いてから戻ってきてください</p>
    </div>
  );
}

export type ProblemCardProps = {
  problem: LearningProblemDto;
  /** true なら解答と自己採点を出す（回答ステップ。docs/specs/15-web-learning.md §3.3） */
  revealed: boolean;
  grade?: LearningGrade;
  onGrade?: (no: number, grade: LearningGrade) => void;
};

/** 問題1件のカード。問題ステップと回答ステップで同じカードを使い、解答だけを開く。 */
export function ProblemCard({ problem, revealed, grade, onGrade }: ProblemCardProps) {
  return (
    <section className="panel dg lx__card">
      <h3 className="mono dg__head">
        問題{problem.no}
        <span className="lx__kind">{problem.kind === 'code' ? 'CODE' : 'QUIZ'}</span>
      </h3>

      <Markdown md={problem.questionMd} />

      {problem.kind === 'code' && problem.workdir && <Workdir workdir={problem.workdir} />}

      {revealed && (
        <>
          <div className="lx__answer">
            <span className="mono label">解答</span>
            <Markdown md={problem.answerMd} />
          </div>

          <div className="lx__grades" role="group" aria-label={'問題' + problem.no + ' の自己採点'}>
            {GRADE_CHOICES.map((choice) => (
              <button
                type="button"
                className={'mono btn lx__grade' + (grade === choice.value ? ' btn--primary' : '')}
                aria-label={gradeLabel(problem.no, choice.mark, choice.caption)}
                aria-pressed={grade === choice.value}
                onClick={() => onGrade?.(problem.no, choice.value)}
                key={choice.value}
              >
                <span className="lx__mark">{choice.mark}</span>
                <span className="lx__caption">{choice.caption}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
