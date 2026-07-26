import { glowShadow } from '@/lib/theme';

export default function CheckRing({ done }: { done: boolean }) {
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
