'use client';

import type { DetailRef } from '@/shared/api';
import { ErrorBanner } from '@/shared/ui';
import { useDigest } from '../hooks/useDigest';
import { DigestSection } from './DigestSection';

export type DigestViewProps = {
  /** `GET /api/digests/{date}` の `{date}`。`today` または `YYYY-MM-DD` */
  date: string;
  /** 先頭に出すセクション（`digest.connection` の後半）。無指定なら返却順のまま */
  section?: string;
};

function Skeleton() {
  return (
    <div aria-busy="true" aria-live="polite">
      {[0, 1].map((index) => (
        <section className="panel dg" key={index}>
          <h2 className="mono dg__head"><span className="skel" style={{ width: 120 }}>&nbsp;</span></h2>
          <p className="dg__text"><span className="skel" style={{ width: '82%' }}>&nbsp;</span></p>
          <p className="dg__text"><span className="skel" style={{ width: '64%' }}>&nbsp;</span></p>
        </section>
      ))}
    </div>
  );
}

/** 詳細ビュー本体（docs/specs/12-web-digest.md §3.2）。 */
export function DigestView({ date, section }: DigestViewProps) {
  const { digest, error, isLoading } = useDigest(date);

  if (error) {
    // 不正な日付は履歴画面と同じ扱い（docs/specs/12-web-digest.md §6）
    if (error.code === 'bad_request') {
      return (
        <div className="empty">
          不正な日付です。<a className="dg__note" href="/digest">今日のダイジェスト</a>へ
        </div>
      );
    }
    return <ErrorBanner message={error.message} />;
  }

  if (!digest) return isLoading ? <Skeleton /> : null;

  if (digest.sections.length === 0) {
    return (
      <div className="empty">
        {date === 'today' ? '今朝のダイジェストはまだ届いていません' : 'この日のダイジェストはありません'}
      </div>
    );
  }

  // 指定セクションを先頭へ。他も切り捨てない（ついでに読めるほうが良い。同 §3.2）
  const wanted = section ? section.replace(/^digest\./, '') : null;
  const ordered = wanted
    ? [
        ...digest.sections.filter((item) => item.kind === wanted),
        ...digest.sections.filter((item) => item.kind !== wanted),
      ]
    : digest.sections;

  return (
    <>
      <div className="mono dg__meta">
        {digest.date}
        {digest.receivedAt && ' / 受信 ' + digest.receivedAt.slice(11, 16)}
      </div>
      {ordered.map((item, index) => (
        <DigestSection
          section={item}
          highlighted={wanted !== null && item.kind === wanted}
          key={item.kind + index}
        />
      ))}
    </>
  );
}

/** `detailRef`（`digest.connection` 等）からセクション名を取り出す。 */
export function sectionOf(detailRef: DetailRef) {
  return detailRef.replace(/^digest\./, '');
}
