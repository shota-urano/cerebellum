/**
 * 共通エラーバナー。クラッシュ画面は出さず、これを出して SWR の再検証に任せる。
 * 見た目の正本は `docs/design/system/02-components.md`（`.banner` in globals.css）。
 */
export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="banner" role="alert" style={{ marginBottom: 12 }}>
      <span className="mono banner__tag">ERR</span>
      <span className="banner__text">{message}</span>
    </div>
  );
}
