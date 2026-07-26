import { glowShadow } from '@/shared/lib';

type Props = {
  done: number;
  total: number;
  /** 記録なしの日はすべて空区画で描く */
  voided?: boolean;
  height?: number;
  gap?: number;
};

/** 進捗セグメントバー。見た目の正本は `docs/design/02-today.md`（`.segbar` in globals.css）。 */
export function SegmentBar({ done, total, voided = false, height = 6, gap = 3 }: Props) {
  return (
    <div className="segbar" style={{ gap }}>
      {Array.from({ length: Math.max(total, 1) }, (_, i) => {
        const on = !voided && i < done;
        return (
          <span
            key={i}
            className={'seg ' + (voided ? 'seg--void' : on ? 'seg--on' : 'seg--off')}
            style={{ height, boxShadow: on ? glowShadow(7, 0.55) : undefined }}
          />
        );
      })}
    </div>
  );
}
