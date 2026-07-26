import { glowShadow } from '@/lib/theme';

type Props = {
  done: number;
  total: number;
  /** 記録なしの日はすべて空区画で描く */
  voided?: boolean;
  height?: number;
  gap?: number;
};

export default function SegmentBar({ done, total, voided = false, height = 6, gap = 3 }: Props) {
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
