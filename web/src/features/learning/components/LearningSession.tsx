'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';
import type { LearningGrade, LearningProblemDto, LearningResultResponse } from '@/shared/api';
import { ErrorBanner, Markdown, Toast } from '@/shared/ui';
import { useLearningResult, useSaveLearningResult } from '../hooks/useLearningResult';
import { useLearningSet } from '../hooks/useLearningSet';
import { EMPTY_CALCULATION, type CalculationScratch } from '../lib/calculator';
import { autoGrade, isAutoGraded } from '../lib/grade';
import { ProblemCard } from './ProblemCard';
import { RecordedResult } from './RecordedResult';
import { Stepper, type Step } from './Stepper';

export type LearningSessionProps = {
  /** `GET /api/learning/sets/{date}` の `{date}`。`today` または `YYYY-MM-DD` */
  date: string;
  /**
   * 成績の記録に**成功した直後**だけ呼ばれる（docs/specs/15-web-learning.md §3.4 ②）。
   * タスクの消し込みは day feature の仕事なので、app 層が合成して渡す
   * （features 間 import 禁止・docs/specs/07-web-foundation.md §3）。
   */
  onRecorded?: () => Promise<void> | void;
};

function Skeleton() {
  return (
    <div aria-busy="true" aria-live="polite">
      <section className="panel dg">
        <h2 className="mono dg__head"><span className="skel" style={{ width: 160 }}>&nbsp;</span></h2>
        <p className="dg__text"><span className="skel" style={{ width: '86%' }}>&nbsp;</span></p>
        <p className="dg__text"><span className="skel" style={{ width: '62%' }}>&nbsp;</span></p>
      </section>
    </div>
  );
}

/** 一本道の下部ボタン。次へ進む1つだけを置く（戻るは作らない＝迷わせない）。 */
function Next({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <div className="dg__bar dg__bar--end">
      <button type="button" className="mono btn btn--primary" disabled={disabled} onClick={onClick}>
        {label}
      </button>
    </div>
  );
}

/**
 * 学習セッション本体（docs/specs/15-web-learning.md §3）。
 * レッスン → 問題 → 採点 → 感想 の4段ステッパー。見えるのは今日の1セットだけで、
 * 途中離脱の復元はしない（同 §4。1セット10分想定）。
 */
export function LearningSession({ date, onRecorded }: LearningSessionProps) {
  const { set, error, isLoading } = useLearningSet(date);
  const { result, resultLoading, mutateResult } = useLearningResult(date);

  const onSaved = useCallback(
    (saved: LearningResultResponse) => {
      void mutateResult(saved, { revalidate: false });
    },
    [mutateResult],
  );
  const { save, saving, saveError, clearSaveError } = useSaveLearningResult(date, onSaved);

  const [step, setStep] = useState<Step>('lesson');
  const [answers, setAnswers] = useState<Record<number, string>>({});
  // 数値問題ごとの計算式・履歴。ステッパーで戻っても保持し、APIには送らない（同 §3.2）
  const [calculations, setCalculations] = useState<Record<number, CalculationScratch>>({});
  // 手でタップした採点。自動採点の結果を上書きする（同 §3.3）
  const [grades, setGrades] = useState<Record<number, LearningGrade>>({});
  const [feeling, setFeeling] = useState('');
  // 「やり直す」を押した後は、記録済み表示ではなく一本道を出す
  const [restarted, setRestarted] = useState(false);
  const [done, setDone] = useState(false);

  const setAnswer = (no: number, answer: string) => {
    setAnswers((current) => ({ ...current, [no]: answer }));
  };

  const setGrade = (no: number, grade: LearningGrade) => {
    setGrades((current) => ({ ...current, [no]: grade }));
  };

  const setCalculation = (no: number, calculation: CalculationScratch) => {
    setCalculations((current) => ({ ...current, [no]: calculation }));
  };

  /**
   * その問題の最終的な採点（同 §3.3）。タップした値が最優先で、無ければ自動採点、
   * 自動採点できない問題（`answerType` 無し・code）は undefined ＝タップ待ち。
   */
  const gradeOf = (problem: LearningProblemDto): LearningGrade | undefined => {
    const tapped = grades[problem.no];
    if (tapped) return tapped;
    return isAutoGraded(problem) ? autoGrade(problem, answers[problem.no] ?? '').grade : undefined;
  };

  const complete = async () => {
    if (!set) return;
    // ① 記録 → ② 成功したときだけ消し込み → ③ 完了画面（同 §3.4）。
    //    失敗したらここで止める＝ checks は呼ばない（記録なしに消し込まれるのが最悪ケース）
    const ok = await save({
      grades: set.problems.flatMap((problem) => {
        const grade = gradeOf(problem);
        if (!grade) return [];
        // answer はフォーム入力があった問題のみ送る（同 §3.4）。上書きしても入力のまま
        const answer = answers[problem.no];
        return [answer ? { no: problem.no, grade, answer } : { no: problem.no, grade }];
      }),
      feeling,
    });
    if (!ok) return;
    await onRecorded?.();
    setDone(true);
  };

  if (error) {
    if (error.code === 'not_found') {
      return (
        <div className="empty">今日の学習セットはありません（生成失敗か休み。ログ: night-study）</div>
      );
    }
    return <ErrorBanner message={error.message} />;
  }

  if (!set) return isLoading ? <Skeleton /> : null;

  if (done) {
    return (
      <>
        <Stepper current="feeling" complete />
        <section className="panel dg">
          <h2 className="mono dg__head">完了 — {set.theme}</h2>
          <p className="dg__text">記録しました。明日のセットに反映されます</p>
        </section>
        <div className="dg__bar dg__bar--end">
          <Link className="mono btn btn--primary" href="/">
            今日へ戻る
          </Link>
        </div>
      </>
    );
  }

  // 記録済みの日に再訪（同 §4）。読み込み中に一本道を先に出すとちらつくので待つ
  if (!restarted) {
    if (resultLoading) return <Skeleton />;
    if (result) {
      return (
        <RecordedResult
          theme={set.theme}
          result={result}
          onRestart={() => {
            setRestarted(true);
            setStep('lesson');
            setAnswers({});
            setCalculations({});
            setGrades({});
            setFeeling('');
          }}
        />
      );
    }
  }

  // 自動採点分は最初から揃っている（同 §3.3）
  const allGraded = set.problems.every((problem) => gradeOf(problem) !== undefined);
  const advance = (next: Step) => () => setStep(next);

  return (
    <>
      {/* 通過済みの段はタップで戻れる（同 §3）。回答入力・採点はここの state なので戻っても残る */}
      <Stepper current={step} onBack={setStep} />

      {step === 'lesson' && (
        <>
          <section className="panel dg">
            <h2 className="mono dg__head">今日の学習 — {set.theme}</h2>
            <Markdown md={set.lessonMd} />
          </section>
          <Next label="問題へ" onClick={advance('problems')} />
        </>
      )}

      {(step === 'problems' || step === 'grading') && (
        <>
          {set.problems.map((problem) => (
            <ProblemCard
              problem={problem}
              revealed={step === 'grading'}
              answer={answers[problem.no]}
              onAnswer={setAnswer}
              calculation={calculations[problem.no] ?? EMPTY_CALCULATION}
              onCalculation={setCalculation}
              grade={gradeOf(problem)}
              onGrade={setGrade}
              key={problem.no}
            />
          ))}
          {step === 'problems' ? (
            // 未回答の問題があっても進める（同 §3.2。未回答は採点段で×になる）
            <Next label="採点へ" onClick={advance('grading')} />
          ) : (
            <>
              {!allGraded && (
                <p className="mono dg__note lx__hint">全問に ○ △ × を付けると次へ進めます</p>
              )}
              <Next label="感想へ" disabled={!allGraded} onClick={advance('feeling')} />
            </>
          )}
        </>
      )}

      {step === 'feeling' && (
        <>
          <section className="panel dg">
            <h2 className="mono dg__head">当日の感想</h2>
            <label className="mono label" htmlFor="lx-feeling">
              FEELING
            </label>
            <textarea
              id="lx-feeling"
              className="input lx__textarea"
              rows={4}
              placeholder="どこで詰まった？何が腑に落ちた？（1〜2行）"
              value={feeling}
              onChange={(event) => setFeeling(event.target.value)}
            />
            {set.closingMd && (
              <div className="lx__closing">
                <Markdown md={set.closingMd} />
              </div>
            )}
          </section>
          <Next label={saving ? '記録中…' : '完了'} disabled={saving} onClick={() => void complete()} />
        </>
      )}

      {saveError && (
        <Toast
          message={'記録に失敗しました（' + saveError.message + '）'}
          actionLabel="再試行"
          busy={saving}
          onAction={() => void complete()}
          onDismiss={clearSaveError}
        />
      )}
    </>
  );
}
