/**
 * 取得中のプレースホルダ（docs/specs/07-web-foundation.md §5 の読み込み表現）。
 *
 * 今日のビュー（`InboxView`）と過去日のビュー（`InboxDateView`・
 * docs/specs/29-web-inbox-history.md §3.2）が同じ形を出すので、components 内で共有する。
 */
export function InboxSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite">
      {[0, 1, 2].map((index) => (
        <section className="panel dg wt__card" key={index}>
          <p className="wt__from">
            <span className="skel" style={{ width: '32%' }}>&nbsp;</span>
          </p>
          <p className="wt__title wt__title--flat">
            <span className="skel" style={{ width: '84%' }}>&nbsp;</span>
          </p>
        </section>
      ))}
    </div>
  );
}
