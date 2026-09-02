import Link from 'next/link';
import { lineLabelOf, lineNodesOf, type LineNode, type OfficeEmployee, type RosterEntry } from '../lib/office';

export type OfficeMiniLineProps = {
  roster: RosterEntry;
  employees: OfficeEmployee[];
  /** 本人（中央の段） */
  self: OfficeEmployee;
  /** 現在のフロア（`/office?room=x` など）。ノードのリンクはこの文脈を保つ */
  scopeHref: string;
};

/**
 * ミニライン（docs/specs/21-web-office-roster.md §3.6）。
 *
 * **全ラインを俯瞰する専用グラフ画面は作らない**（§7）。ここで出すのは
 * upstream → 本人 → downstream の 1-hop だけで、2-hop 先へ広げない。
 * 社員ノードをタップすると相手のカードへ移るので、流れは「一望」ではなく「辿る」で担保する。
 *
 * 図形描画ライブラリ・SVG は使わない（§5。使った時点で一望させない境界が実装から崩れる）。
 */
export function OfficeMiniLine({ roster, employees, self, scopeHref }: OfficeMiniLineProps) {
  const join = (id: string) => `${scopeHref}${scopeHref.includes('?') ? '&' : '?'}employee=${encodeURIComponent(id)}`;
  const upstream = lineNodesOf(roster.upstream, employees);
  const downstream = lineNodesOf(roster.downstream, employees);
  const line = roster.line;

  const node = (item: LineNode, downstreamSide: boolean) => {
    const className = `mono of__ml-node of__ml-node--${item.kind}`;
    const body = (
      <>
        <span className="of__ml-text">{item.label}</span>
        {/* 「どこを確認するか」の答え。checks（何を見るか）と対になる（§3.6-5） */}
        {downstreamSide && item.kind === 'place' && <span className="of__ml-tag">見る場所</span>}
      </>
    );
    return item.employeeId === null ? (
      <span className={className} key={item.raw}>{body}</span>
    ) : (
      <Link className={className} key={item.raw} href={join(item.employeeId)} scroll={false}>
        {body}
      </Link>
    );
  };

  return (
    <div className="of__ml">
      <p className="mono of__card-label of__ml-head">
        {line === null ? (
          'ライン 未記載'
        ) : line === 'none' ? (
          '独立（ラインなし）'
        ) : (
          <Link className="of__ml-line" href={`/office?line=${encodeURIComponent(line)}`}>
            LINE: {lineLabelOf(line)}
          </Link>
        )}
      </p>

      {upstream.length > 0 && (
        <div className="of__ml-row" aria-label="上流">
          {upstream.map((item) => node(item, false))}
        </div>
      )}
      {upstream.length > 0 && <p className="of__ml-arrow" aria-hidden="true">↓</p>}

      <p className="of__ml-self">{self.name}</p>

      {downstream.length > 0 && <p className="of__ml-arrow" aria-hidden="true">↓</p>}
      {downstream.length > 0 && (
        <div className="of__ml-row" aria-label="下流">
          {downstream.map((item) => node(item, true))}
        </div>
      )}
    </div>
  );
}
