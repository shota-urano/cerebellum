import { glowShadow } from '@/shared/lib';

/**
 * チェックリング。見た目の正本は `docs/design/02-today.md`（`.ring` in globals.css）。
 *
 * 「今日」画面の消し込みとハーネス承認（docs/specs/18-web-harness.md §3.2「shared の
 * 消し込み様式を流用」）の2 feature が使うので shared に置く（feature 間 import 禁止・
 * docs/specs/07-web-foundation.md §3）。
 */
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
