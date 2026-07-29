'use client';

import { ErrorBanner } from '@/shared/ui';
import { useNightShiftRun, viewerBase } from '../hooks/useNightShiftRun';

export type NightShiftViewProps = {
  /** 対象の夜（`YYYY-MM-DD`）。`today` の解決は呼び出し側が day API で済ませて渡す */
  date?: string;
};

function Skeleton() {
  return (
    <div aria-busy="true" aria-live="polite">
      <section className="panel dg">
        <h2 className="mono dg__head"><span className="skel" style={{ width: 140 }}>&nbsp;</span></h2>
        <p className="dg__text"><span className="skel" style={{ width: '70%' }}>&nbsp;</span></p>
        <p className="dg__text"><span className="skel" style={{ width: '52%' }}>&nbsp;</span></p>
      </section>
    </div>
  );
}

/** 成果物の欠落警告。ダイジェストの warning 行と同じ様式（docs/specs/12-web-digest.md §3.2） */
function Warn({ text }: { text: string }) {
  return (
    <div className="dg__warn">
      <span className="mono banner__tag">!</span>
      <p className="dg__text">{text}</p>
    </div>
  );
}

/**
 * 録画ファイル名「<タスクID>-<スペック名>-<検証内容>.mp4」から表示名を作る。
 * 先頭の ASCII トークン（機械の紐づけキー）を落とし、検証内容だけを人間に見せる
 * （docs/specs/13 §3。全部 ASCII のファイル名なら元の名前のまま）
 */
function videoLabel(name: string): string {
  const stem = name.replace(/\.(mp4|webm)$/i, '');
  const label = stem.replace(/^[A-Za-z0-9.-]+-/, '');
  return label || stem;
}

/**
 * 夜勤詳細ビュー本体（docs/specs/13-web-nightshift.md）。
 * その夜に回した1プロジェクトの「PR リンク」と「検証動画」だけを出す。
 * 全 PJ・全実行の一覧は出さない（それは夜勤ビューア :48310 の役割）。
 */
export function NightShiftView({ date }: NightShiftViewProps) {
  const { run, ready, error, isLoading } = useNightShiftRun(date);

  if (error) return <ErrorBanner message={error.message} />;
  if (!date || !ready) return !date || isLoading ? <Skeleton /> : null;

  if (!run) {
    return <div className="empty">この夜の夜勤レポはありません（シフトなし、またはレポ未生成）</div>;
  }

  const base = viewerBase() + '/' + run.href;
  const seen = new Set<string>();
  const videos = (run.videos ?? []).flatMap((name) => {
    const label = videoLabel(name);
    if (seen.has(label)) return [];
    seen.add(label);
    return [{ name, label }];
  });

  return (
    <section className="panel dg">
      <h2 className="mono dg__head">夜勤レポ — {run.pj}</h2>
      <div className="mono dg__meta">
        {run.run_id} ／ 完了 {run.passed} · 失敗 {run.failed} · blocked {run.blocked}
      </div>

      <div className="ns__pr">
        {run.pr_url ? (
          <a className="mono btn btn--primary" href={run.pr_url}>
            PR を開く（マージはここから）
          </a>
        ) : (
          <Warn
            text={
              run.passed > 0
                ? 'PR が出ていない（リモート未設定 or dev-loop 手順8未達）'
                : 'PR なし（close したタスクが0件）'
            }
          />
        )}
      </div>

      {videos.length > 0 ? (
        <div className="ns__videos">
          {videos.map(({ name, label }) => (
            <figure className="ns__video" key={name}>
              {/* #t=0.1: 再生前でも先頭フレームをサムネイル表示させる */}
              <video controls playsInline preload="metadata" src={base + 'media/' + name + '#t=0.1'} />
              <figcaption className="mono dg__note">{label}</figcaption>
            </figure>
          ))}
        </div>
      ) : (
        run.passed > 0 && <Warn text="検証動画なし（docs/loop-artifacts に録画が無い）" />
      )}

      <a className="mono dg__note" href={base}>
        フル確認ページ（受け入れ基準・スクショ）を開く
      </a>
    </section>
  );
}
