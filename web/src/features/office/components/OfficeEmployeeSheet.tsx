import Link from 'next/link';
import {
  reviewLabelOf,
  rosterOf,
  shiftStateOf,
  workLabelOf,
  type OfficeEmployee,
  type OfficeRun,
} from '../lib/office';
import { OfficeMiniLine } from './OfficeMiniLine';

export type OfficeEmployeeSheetProps = {
  employee: OfficeEmployee | undefined;
  run: OfficeRun | undefined;
  requestedId: string;
  today: string;
  returnHref: string;
  /** 報告シートへの導線（直近 run が無ければ null） */
  reportHref: string | null;
  /** ミニラインのノード解決に使う在籍全員（停止中も含む） */
  employees: OfficeEmployee[];
  /** 現在のフロア（`/office?room=x`・`/office?line=y`・`/office`） */
  scopeHref: string;
};

/**
 * 社員名簿（docs/specs/21-web-office-roster.md §3.1・§3.2）。
 *
 * 席タップで開く「この社員は何者か」の面。読み順は
 * 何をする人か → いつ動くか → どう呼ぶか → 出たら何を見るか → 出典（§3.1-2）。
 *
 * **欠損は欠損として出す**（§3.2-3）。名簿の値を画面側で補わない——正本は
 * second-brain の `SKILL.md` frontmatter で、埋めた時点で 20 §1 の手書きHTMLと同じ末路になる。
 * `command` にコピーボタンを付けない（tailnet の http では clipboard API が使えない・§3.2-5）。
 */
export function OfficeEmployeeSheet({
  employee,
  run,
  requestedId,
  today,
  returnHref,
  reportHref,
  employees,
  scopeHref,
}: OfficeEmployeeSheetProps) {
  if (!employee) {
    return (
      <div className="of2__sheet-layer" role="presentation">
        <Link className="of2__sheet-backdrop" href={returnHref} scroll={false} aria-label="名簿を閉じる" />
        <section className="of2__sheet of__card" role="dialog" aria-modal="true" aria-label="その社員は見つかりません">
          <div className="of2__sheet-grip" aria-hidden="true" />
          <div className="of2__sheet-head">
            <div>
              <p className="mono of2__sheet-state">NOT FOUND</p>
              <h2 className="of2__sheet-title">その社員は見つかりません</h2>
            </div>
            <Link className="mono of2__sheet-close" href={returnHref} scroll={false}>閉じる</Link>
          </div>
          <p className="of2__sheet-copy">automation_id: {requestedId}</p>
        </section>
      </div>
    );
  }

  const stopped = employee.enabled === false;
  const roster = rosterOf(employee);
  // 停止中でも名簿は読める（§3.1-6）。状態だけ「停止中」に差し替える
  const state = stopped ? null : shiftStateOf(employee, run, today);

  return (
    <div className="of2__sheet-layer" role="presentation">
      <Link className="of2__sheet-backdrop" href={returnHref} scroll={false} aria-label="名簿を閉じる" />
      <section
        className="of2__sheet of__card"
        role="dialog"
        aria-modal="true"
        aria-label={`${employee.name}の名簿`}
      >
        <div className="of2__sheet-grip" aria-hidden="true" />
        <div className="of2__sheet-head">
          <div>
            <p className="mono of2__sheet-state">社員名簿</p>
            <h2 className="of2__sheet-title">{employee.name}</h2>
          </div>
          <Link className="mono of2__sheet-close" href={returnHref} scroll={false}>閉じる</Link>
        </div>

        {/* できる仕事内容（1行）。無い社員は「名簿 未記載」＋直す場所（§3.2-3） */}
        {roster.missing ? (
          <p className="of2__sheet-copy of__card-job of__card-job--missing">
            名簿 未記載
            {roster.doc && <span className="mono of__card-doc">{roster.doc}</span>}
          </p>
        ) : (
          <p className="of2__sheet-copy of__card-job">{roster.job}</p>
        )}

        <dl className="mono of2__meta of__card-meta">
          <div>
            <dt>勤務</dt>
            <dd>{workLabelOf(employee)}</dd>
          </div>
          <div>
            <dt>起動</dt>
            <dd>{roster.command ?? '起動コマンドなし'}</dd>
          </div>
          <div>
            {/* 誰が動かすか。skill（何の手順で動くか）とは別物（21 §2） */}
            <dt>AGENT</dt>
            <dd>{roster.agent ?? 'エージェント 未記載'}</dd>
          </div>
          <div>
            <dt>SKILL</dt>
            <dd>{employee.skill ?? 'skill なし（素の実行）'}</dd>
          </div>
          <div className="of__card-meta-wide">
            {/* 組織図の所属（26 §3.1）。値域を検査も翻訳もしない——id をそのまま等幅で出す（26 §4） */}
            <dt>部署</dt>
            <dd>
              {roster.dept === null ? (
                // 未記載はリンクにしない（行き先が無い・26 §3.1-3）
                '部署 未記載'
              ) : (
                // 部署絞り込みの入口はここと会社案内シートだけ。全景には足さない（26 §3.3-6）
                <Link className="of__card-dept" href={`/office?dept=${encodeURIComponent(roster.dept)}`}>
                  {roster.dept}
                </Link>
              )}
            </dd>
          </div>
        </dl>

        {/*
          人間確認（26 §3.1-1）。`review` から機械的に組む1行で、`kinds` は翻訳しない。
          `null` は「なし」＝正常な状態なので「未記載」様式（muted の欠損表示）に寄せない。
        */}
        <p className="mono of__card-review">{reviewLabelOf(roster.review)}</p>

        {/* 名簿が無い社員はミニラインを出さず「名簿 未記載」に畳む（21 §3.6-8） */}
        {!roster.missing && (
          <OfficeMiniLine roster={roster} employees={employees} self={employee} scopeHref={scopeHref} />
        )}

        <div className="of__card-checks">
          <p className="mono of__card-label">実行後に確認すべきこと</p>
          {roster.checks.length === 0 ? (
            <p className="of__card-empty">確認事項の記載なし</p>
          ) : (
            <ul>
              {roster.checks.map((check) => (
                <li key={check}>{check}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="of__card-state">
          <p className="mono of__card-label">直近の状態</p>
          <p className={`of__card-status of__card-status--${stopped ? 'neutral' : state?.tone}`}>
            {stopped ? '停止中' : state?.label || (run ? '実行済み' : 'まだ実行なし')}
            {!stopped && state?.lastDate && <span className="mono of__card-when">直近 {state.lastDate}</span>}
            {!stopped && state?.note && <span className="mono of__card-when">{state.note}</span>}
          </p>
          {/* 停止中は停止前の headline を出さない（20 §3.1-4） */}
          {!stopped && run && <p className="of__card-headline">{run.headline ?? '報告の要約はありません'}</p>}
        </div>

        {reportHref !== null && !stopped && (
          <Link className="mono of2__report-button of__card-report" href={reportHref} scroll={false}>
            報告を見る
          </Link>
        )}
        {roster.doc && !roster.missing && <p className="mono of__card-doc of__card-doc--foot">{roster.doc}</p>}
      </section>
    </div>
  );
}
