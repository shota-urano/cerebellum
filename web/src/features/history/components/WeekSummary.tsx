'use client';

import { useSummary } from '../hooks/useSummary';
import { useToday } from '../hooks/useToday';
import { WEEK_DAYS, buildWeek } from '../lib/week';
import { SegmentBar } from './SegmentBar';

type Props = {
  /** ハイライトする行 */
  selected: string | null;
  onSelect: (iso: string) => void;
};

/** 記録なし日のバーは全区画 void。区画数は素材と同じ既定値を使う。 */
const VOID_SEGMENTS = 11;

/** 取得前のプレースホルダ行（素材に無し。`docs/design/03-history.md`「未定事項」） */
function SkeletonRows() {
  return (
    <div aria-busy="true">
      {Array.from({ length: WEEK_DAYS }, (_, i) => (
        <div className="week__row" key={i}>
          <span className="mono week__date"><span className="skel" style={{ width: 40 }}>&nbsp;</span></span>
          <span className="mono week__ratio"><span className="skel" style={{ width: 34 }}>&nbsp;</span></span>
          <span className="week__bar">
            <SegmentBar done={0} total={VOID_SEGMENTS} voided height={4} gap={2} />
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * 直近7日サマリ（docs/specs/09 §3）。行タップでその日の表示へ移動する。
 * 様式の正本は `docs/design/03-history.md`（`.week` in globals.css）。
 *
 * エラー表示は持たない。`useSummary` / `useToday` の失敗は画面側（`app/history/HistoryScreen.tsx`）が
 * 1枚の ErrorBanner に集約する（同じ Vault 断で何枚も並べないため。docs/specs/09 §6）。
 */
export function WeekSummary({ selected, onSelect }: Props) {
  // 7日分の日付は「今日」起点で組む（サーバー由来。docs/specs/09 §3）
  const { today, error: todayError } = useToday();
  const { summary, error: summaryError } = useSummary();

  /*
   * 「取得できていない」と「記録が無い」を混同しない（履歴は過去記録の正を見せる画面）。
   *
   * - `summary === undefined`（未取得＝ loading でもエラーでも）のときは行を作らない。
   *   `summary ?? []` で埋めると、取得できていないだけの7日が実在する「記録なし」に化ける。
   * - `days: []` は正常な空レスポンス（期間内の記録がゼロ）なので、7日すべて「記録なし」で正しい
   *   （docs/specs/03 §3「存在する日のみ返す」＋ docs/specs/09 §3「レスポンスに無い日は記録なし」）。
   * - `today` も未取得なら行を作らない（日付列の起点が決まらない）。
   * - SWR は再検証が失敗しても直前の data を保持するので、エラーでも一度取れていれば行は残す
   *   （バナーだけ出す。docs/specs/07 §6 の「描画済みを消さない」と同じ扱い）。
   */
  const rows = today !== undefined && summary !== undefined ? buildWeek(today, summary) : null;
  /** 行を作れない理由がまだ取得中か（エラー確定なら取得済みデータも無いので何も出さない） */
  const fetching = todayError === undefined && summaryError === undefined;

  return (
    <section className="panel week">
      <div className="mono label" style={{ marginBottom: 12 }}>LAST 7 DAYS</div>

      {rows === null ? (
        // 一度も取れていないままエラーになったら行は出さない（永久スケルトンにしない。docs/specs/08 §6 と同じ扱い）。
        // 理由は画面側のバナーが示す。
        fetching ? <SkeletonRows /> : null
      ) : (
        rows.map((row) => (
          <button
            type="button"
            key={row.iso}
            className={'week__row' + (row.iso === selected ? ' week__row--sel' : '')}
            onClick={() => onSelect(row.iso)}
          >
            <span className="mono week__date">{row.date}</span>
            <span className="mono week__ratio">{row.done === null ? '記録なし' : row.done + '/' + row.total}</span>
            <span className="week__bar">
              {/* done === null（記録なし）のときだけ ?? が効き、その場合は voided で全区画 void になる
                  ＝ 件数を偽らない（素材 WeekSummary.tsx の `day.total ?? 11` と同じ扱い） */}
              <SegmentBar
                done={row.done ?? 0}
                total={row.total ?? VOID_SEGMENTS}
                voided={row.done === null}
                height={4}
                gap={2}
              />
            </span>
          </button>
        ))
      )}
    </section>
  );
}
