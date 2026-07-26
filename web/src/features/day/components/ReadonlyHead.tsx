/**
 * 読み取り専用バッジ＋件数（docs/specs/09 §3）。履歴画面が DayView を readonly で使うとき、
 * 計器盤ヘッダの代わりに出す。様式の正本は `docs/design/03-history.md`（`.ro` in globals.css）。
 */
export function ReadonlyHead({ done, total }: { done: number; total: number }) {
  return (
    <div className="ro">
      <span className="mono ro__badge">読み取り専用</span>
      <span className="ro__rule" />
      <span className="mono ro__count">{total > 0 ? done + ' / ' + total : '— / —'}</span>
    </div>
  );
}
