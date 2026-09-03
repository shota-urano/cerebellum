import { formatDate } from '@/shared/lib';

export type DateNavProps = {
  /** 表示日。まだサーバーから「今日」を取得できていない間は null */
  iso: string | null;
  onPrev: () => void;
  onNext: () => void;
  /** 未来方向へ進めるか（今日より先へは進めない。docs/specs/09 §3） */
  canNext: boolean;
};

/**
 * 前日/翌日ナビ（docs/specs/09 §3）。カレンダー UI は作らない（同 §4）。
 * 様式の正本は `docs/design/03-history.md`（`.nav` in globals.css）。
 *
 * 「履歴」と「あなた待ち」の2画面が使うので shared に置く（feature 間 import 禁止・
 * docs/specs/07-web-foundation.md §3。移設は docs/specs/29-web-inbox-history.md §3.3）。
 */
export function DateNav({ iso, onPrev, onNext, canNext }: DateNavProps) {
  return (
    <div className="panel nav">
      <button type="button" className="mono nav__btn" onClick={onPrev} disabled={iso === null}>◀ 前日</button>
      <div className="mono nav__date">
        {iso === null ? <span className="skel" style={{ width: 132 }}>&nbsp;</span> : formatDate(iso)}
      </div>
      <button type="button" className="mono nav__btn" onClick={onNext} disabled={!canNext}>翌日 ▶</button>
    </div>
  );
}
