'use client';

import { useState } from 'react';
import type { LearningGrade, LearningProblemDto } from '@/shared/api';
import { Markdown } from '@/shared/ui';
import { GRADE_CHOICES, answerLabel, autoGrade, gradeLabel, gradeMark, isAutoGraded } from '../lib/grade';

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

/**
 * 回答フォーム（docs/specs/15-web-learning.md §3.2）。
 * `choice` は選択肢のラジオ、`number`・`text` は1行テキスト入力。入力はローカル state で、
 * 未回答のまま採点段へ進める（未回答は採点段で×になる・同 §3.3）。
 */
function AnswerForm({
  problem,
  answer,
  onAnswer,
}: {
  problem: LearningProblemDto;
  answer: string;
  onAnswer: (no: number, answer: string) => void;
}) {
  const label = answerLabel(problem.no);

  if (problem.answerType === 'choice' && problem.choices) {
    return (
      <div className="lx__form">
        <span className="mono label">回答</span>
        <div className="lx__choices" role="radiogroup" aria-label={label}>
          {problem.choices.map((choice) => (
            <label className="lx__choice" key={choice}>
              <input
                type="radio"
                className="lx__radio"
                name={'lx-answer-' + problem.no}
                value={choice}
                checked={answer === choice}
                onChange={() => onAnswer(problem.no, choice)}
              />
              <span>{choice}</span>
            </label>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="lx__form">
      <span className="mono label">回答</span>
      <input
        type="text"
        className="input"
        // number も1行テキスト入力（全角入力を NFKC で受けるため type=number にしない）。
        // キーボードだけ数値向けにする
        inputMode={problem.answerType === 'number' ? 'decimal' : 'text'}
        aria-label={label}
        value={answer}
        onChange={(event) => onAnswer(problem.no, event.target.value)}
      />
    </div>
  );
}

export type ProblemCardProps = {
  problem: LearningProblemDto;
  /** true なら解答と採点を出す（採点ステップ。docs/specs/15-web-learning.md §3.3） */
  revealed: boolean;
  /** 回答フォームの入力（同 §3.2。ローカル state を親が持つ） */
  answer?: string;
  onAnswer?: (no: number, answer: string) => void;
  grade?: LearningGrade;
  onGrade?: (no: number, grade: LearningGrade) => void;
};

/** 問題1件のカード。問題ステップと採点ステップで同じカードを使い、解答だけを開く。 */
export function ProblemCard({ problem, revealed, answer, onAnswer, grade, onGrade }: ProblemCardProps) {
  const input = answer ?? '';
  const auto = isAutoGraded(problem) ? autoGrade(problem, input) : null;

  return (
    <section className="panel dg lx__card">
      <h3 className="mono dg__head">
        問題{problem.no}
        <span className="lx__kind">{problem.kind === 'code' ? 'CODE' : 'QUIZ'}</span>
      </h3>

      <Markdown md={problem.questionMd} />

      {problem.kind === 'code' && problem.workdir && <Workdir workdir={problem.workdir} />}

      {/* 問題ステップだけフォームを出す。採点ステップでは入った回答を読み取り専用で見せる */}
      {!revealed && isAutoGraded(problem) && onAnswer && (
        <AnswerForm problem={problem} answer={input} onAnswer={onAnswer} />
      )}

      {revealed && (
        <>
          {auto && (
            <div className="lx__yours">
              <span className="mono label">あなたの回答</span>
              <span className="lx__yourval">{input.trim() || '（未回答）'}</span>
            </div>
          )}

          <div className="lx__answer">
            <span className="mono label">解答</span>
            <Markdown md={problem.answerMd} />
          </div>

          {auto && (
            <p className={'mono lx__auto' + (auto.grade === 'o' ? '' : ' lx__auto--x')}>
              自動採点 <span className="lx__automark">{gradeMark(auto.grade)}</span>
              {auto.unanswered && <span className="lx__unanswered">（未回答）</span>}
            </p>
          )}

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
