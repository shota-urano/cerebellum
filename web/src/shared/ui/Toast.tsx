/**
 * 画面下部に出す通知。再試行のような「その場でやり直せる操作」を1つだけ添えられる。
 * 自動では消さない（消えると再試行の機会が失われる。docs/specs/15-web-learning.md §4）。
 * 見た目は `.toast` in globals.css。
 */
export type ToastProps = {
  message: string;
  /** 添えるボタンの文言（省略時はボタンを出さない） */
  actionLabel?: string;
  onAction?: () => void;
  /** 実行中はボタンを押せなくする（二重送信の防止） */
  busy?: boolean;
  onDismiss?: () => void;
};

export function Toast({ message, actionLabel, onAction, busy, onDismiss }: ToastProps) {
  return (
    // aria-label は Next の route announcer（同じ role="alert"）と区別するための名前でもある
    <div className="toast" role="alert" aria-label="通知">
      <span className="toast__text">{message}</span>
      {actionLabel && onAction && (
        <button type="button" className="mono btn toast__btn" onClick={onAction} disabled={busy}>
          {actionLabel}
        </button>
      )}
      {onDismiss && (
        <button type="button" className="mono toast__close" aria-label="通知を閉じる" onClick={onDismiss}>
          ×
        </button>
      )}
    </div>
  );
}
