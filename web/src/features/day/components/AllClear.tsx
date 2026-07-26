/** 全完了バナー。文言・様式の正本は `docs/design/02-today.md`（`.allclear` in globals.css）。 */
export function AllClear() {
  return (
    <div className="allclear" style={{ marginTop: 12 }}>
      <div className="mono allclear__tag">ALL CLEAR</div>
      <div className="allclear__text">本日のタスクはすべて消し込み済みです</div>
    </div>
  );
}
