/**
 * 進捗インジケータ `レッスン ─ 問題 ─ 採点 ─ 感想`（docs/specs/15-web-learning.md §3）。
 */

/** 一本道の4段。完了画面は段に含めない（歩き終えた後の画面なので） */
export const STEPS = ['lesson', 'problems', 'grading', 'feeling'] as const;

export type Step = (typeof STEPS)[number];

const LABEL: Record<Step, string> = {
  lesson: 'レッスン',
  problems: '問題',
  grading: '採点',
  feeling: '感想',
};

export function Stepper({
  current,
  complete,
  onBack,
}: {
  current: Step;
  complete?: boolean;
  /**
   * 通過済みの段をタップしたとき（同 §3）。先の段は押せない要素で出すので、
   * ここへ渡るのは常に現在より手前の段だけ。省略すると全段が押せなくなる。
   */
  onBack?: (step: Step) => void;
}) {
  const index = STEPS.indexOf(current);

  return (
    <ol className="mono lx__steps" aria-label="学習の進行">
      {STEPS.map((step, position) => {
        const past = complete || position < index;
        const state = past ? ' lx__step--past' : position === index ? ' lx__step--on' : '';
        // 戻れるのは通過済みの段だけ（同 §3。先の段への飛び越しは不可＝押せる要素にしない）。
        // 完了画面は歩き終えた後なので戻さない（同 §3.4）
        const canGoBack = !complete && position < index && onBack !== undefined;
        return (
          <li
            className={'lx__step' + state + (canGoBack ? ' lx__step--back' : '')}
            aria-current={!complete && position === index ? 'step' : undefined}
            key={step}
          >
            {canGoBack ? (
              <button
                type="button"
                className="mono lx__stepback"
                aria-label={LABEL[step] + 'に戻る'}
                onClick={() => onBack(step)}
              >
                {/* 戻れることを段そのもので示す（「◀ 今日へ」と同じ向きの記号） */}
                <span className="lx__stepback__mark" aria-hidden="true">
                  ◀
                </span>
                {LABEL[step]}
              </button>
            ) : (
              LABEL[step]
            )}
          </li>
        );
      })}
    </ol>
  );
}
