import { glowShadow } from '@/shared/lib';

/** チェックリング。見た目の正本は `docs/design/02-today.md`（`.ring` in globals.css）。 */
export function CheckRing({ done }: { done: boolean }) {
  return (
    <span
      className={'ring' + (done ? ' ring--done' : '')}
      style={done ? { boxShadow: glowShadow(8, 0.4) + ', inset 0 0 6px rgba(56, 229, 255, .25)' } : undefined}
      aria-hidden
    >
      <span className="ring__dot" />
    </span>
  );
}
