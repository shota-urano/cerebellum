import type { CSSProperties } from 'react';

/** 空状態。様式の正本は `docs/design/02-today.md`（`.empty` in globals.css）。 */
export function EmptyState({ message, style }: { message: string; style?: CSSProperties }) {
  return <div className="empty" style={style}>{message}</div>;
}
