'use client';

import { viewerBase, type Run } from '@/shared/api';

export type RunCardProps = {
  /** 表示する run（夜勤ビューアの runs.json の1件） */
  run: Run;
  /** カード見出し（夜勤ビューは「夜勤レポ — {pj}」。呼び出し側が決める） */
  title: string;
};

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
 * run 詳細カード（見出し・メタ行・PR ボタン・検証動画・フル確認リンク）。
 * 夜勤ビュー（docs/specs/13-web-nightshift.md §3）と「開発」画面（docs/specs/19-web-dev-history.md §3.2）の
 * 2箇所で使うため shared に置く（19 §3.3。feature 間 import 禁止のため）。
 * 「確認した」チェック等のタスク動線は含めない——呼び出し側の責務。
 */
export function RunCard({ run, title }: RunCardProps) {
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
      <h2 className="mono dg__head">{title}</h2>
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
