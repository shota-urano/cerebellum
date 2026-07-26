import Link from 'next/link';

/**
 * 不正な `?date=` クエリの表示（docs/specs/09 §6）。
 * 素材に無い状態なので `docs/design/03-history.md`「未定事項」に従い EmptyState の様式（`.empty`）を流用する。
 */
export function InvalidDate() {
  return (
    <div className="empty" style={{ marginTop: 14 }}>
      不正な日付
      <div style={{ marginTop: 10, fontSize: 12.5 }}>
        <Link href="/history">今日へ</Link>
      </div>
    </div>
  );
}
