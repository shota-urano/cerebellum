import Link from 'next/link';
import type { InboxSourceSummaryDto } from '@/shared/api';
import { ErrorBanner } from '@/shared/ui';
import { KIND_ORDER } from '../lib/item';
import type { InboxMissingSource } from '../lib/missing';
import { openCounts, stripKindLabel } from '../lib/summary';
import { InboxMissing } from './InboxMissing';

export type InboxSummaryStripProps = {
  /**
   * `GET /api/inbox/summary` の `sources`（docs/specs/24-inbox.md §3.5）。
   * **取得は app 層が `useInboxSummary` で行う**——第1段の赤点（§3.1）も同じ集計を読むので、
   * ここで引くと同じ問いを2回することになる（合成は app 層・§5）。
   * `undefined` は「まだ取れていない」＝件数を 0 と書かない。
   */
  sources?: InboxSourceSummaryDto[];
  /** 未着の送信元（名簿 × 勤務帯 × 受信の突合結果・§3.3）。判定も app 層が行う */
  missing: InboxMissingSource[];
  /** office.json が取れなかった＝未着判定を諦めた（§3.3 末尾・§6） */
  rosterUnavailable?: boolean;
  /** `/api/inbox/summary` の取得失敗（§6）。件数を黙って 0 にしない */
  error?: Error;
};

/** 取得前の件数。0 と見分けが付く形にする（レイアウトシフトさせない・docs/design/02-today.md） */
function CountSkeleton() {
  return (
    <span className="skel wt__chip__n" style={{ width: 12 }}>
      &nbsp;
    </span>
  );
}

/**
 * 「今日」第3段（WAITING・docs/specs/25-web-inbox.md §3.1）。
 *
 * 中身は**件数4つと未着行だけ**で、項目そのものは出さない。第3段の役目は
 * 「確認待ちがあるか」を毎朝ひと目で分かるようにすることで、片付けは「あなた待ち」1枚で行う
 * （画面を増やさないための分界・docs/specs/24-inbox.md §1）。
 *
 * 4つは `kind` でフィルタした「あなた待ち」へ入る導線（§3.1 のタップ先）。
 * **0 も薄く出す**——消すと「今日はその種類が無い」ことが分からず、
 * 件数が出ていないのか 0 なのかを人間が判別できない（§3.1）。
 */
export function InboxSummaryStrip({
  sources,
  missing,
  rosterUnavailable,
  error,
}: InboxSummaryStripProps) {
  const counts = openCounts(sources);

  return (
    <section className="panel wt__strip" aria-label="WAITING">
      <div className="mono list__head">
        <span>WAITING</span>
        <span>確認待ち</span>
      </div>

      {/* 件数が取れないことを黙らせない（§6）。未着行は名簿側の話なので下にそのまま出す */}
      {error && (
        <div className="wt__strip__banner">
          <ErrorBanner message={'確認待ちの件数を取得できませんでした: ' + error.message} />
        </div>
      )}

      <div className="wt__counts">
        {KIND_ORDER.map((kind) => {
          const count = counts?.[kind];
          return (
            <Link
              className={'wt__chip' + (count === 0 ? ' wt__chip--zero' : '')}
              href={'/waiting?kind=' + kind}
              key={kind}
            >
              <span className="wt__chip__label">{stripKindLabel(kind)}</span>
              {count === undefined ? (
                <CountSkeleton />
              ) : (
                <span className="mono wt__chip__n">{count}</span>
              )}
            </Link>
          );
        })}
      </div>

      {/* 未着（§3.3）。件数の下に1行ずつ異常様式で出す——0件の受信と未着は別物で、
          件数だけを見ていると「送信元が黙っていること」に永久に気づけない（24 §9）。
          出す/出さないの判定は `InboxMissing` が持つので、ここで条件を二重に書かない */}
      <InboxMissing entries={missing} unavailable={rosterUnavailable} />
    </section>
  );
}
