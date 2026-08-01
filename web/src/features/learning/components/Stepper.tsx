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

export function Stepper({ current, complete }: { current: Step; complete?: boolean }) {
  const index = STEPS.indexOf(current);

  return (
    <ol className="mono lx__steps" aria-label="学習の進行">
      {STEPS.map((step, position) => {
        const state = complete || position < index ? ' lx__step--past' : position === index ? ' lx__step--on' : '';
        return (
          <li
            className={'lx__step' + state}
            aria-current={!complete && position === index ? 'step' : undefined}
            key={step}
          >
            {LABEL[step]}
          </li>
        );
      })}
    </ol>
  );
}
