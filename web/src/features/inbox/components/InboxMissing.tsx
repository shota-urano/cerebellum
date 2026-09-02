import type { InboxMissingSource } from '../lib/missing';

type Props = {
  /** 名簿と `summary` の突合結果（docs/specs/25-web-inbox.md §3.3） */
  entries: InboxMissingSource[];
  /** 名簿（office.json）が取れなかった＝突合を諦めた（§3.3 末尾・§6） */
  unavailable?: boolean;
};

/**
 * 未着の送信元（docs/specs/25-web-inbox.md §3.3-3）。
 *
 * **押す操作を持たない**——直す先は second-brain 側の automation で、画面から出来ることは無い。
 * 受信が来れば消える（`summary` の再検証で自然に落ちる）。
 *
 * 異常様式（`dg__warn`）で、失敗枠（§3.2）より上に置く。1行ずつなので失敗枠を
 * 押し下げない一方、**監視の監視はここしか無い**——watchdog 自身の沈黙は
 * この経路でしか人間に届かない（docs/specs/24-inbox.md §9）。
 */
export function InboxMissing({ entries, unavailable }: Props) {
  if (unavailable) {
    // エラーバナーにしない（§3.3 末尾）。受信済みの項目は下に普通に出るので、
    // 諦めたのは「未着判定だけ」だと分かる1行にとどめる
    return <p className="wt__nomatch">名簿が取得できないため、未着は判定していません。</p>;
  }

  if (entries.length === 0) return null;

  return (
    <section className="wt__missing" aria-label="未着">
      {entries.map((entry) => (
        <p className="dg__warn" key={entry.source}>
          <span aria-hidden="true">⚠️</span>
          <span className="dg__text">
            {'未着: ' + entry.name + '（' + entry.label + ' 予定）'}
          </span>
        </p>
      ))}
    </section>
  );
}
