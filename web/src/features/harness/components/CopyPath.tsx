'use client';

import { useState } from 'react';

/**
 * パスを可視のまま出し、横のボタンでコピーできるようにする
 * （docs/specs/18-web-harness.md §3.1 の `detailPath`・§3.3 の `snapshotPath`。
 * ターミナルで開く／スナップショットから戻すときの入口）。
 *
 * Tailscale 越しの http は secure context ではなく `navigator.clipboard` が無い場合がある。
 * 失敗しても画面は壊さず、パス文字列は常に選択してコピーできる状態で残す。
 */
export function CopyPath({ label, path }: { label: string; path: string }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    void navigator.clipboard?.writeText(path).then(
      () => setCopied(true),
      () => setCopied(false),
    );
  };

  return (
    <div className="hn__path">
      <span className="mono hn__pathtext">{path}</span>
      <button type="button" className="mono hn__copy" aria-label={label + 'をコピー'} onClick={copy}>
        {copied ? 'コピー済' : 'コピー'}
      </button>
    </div>
  );
}
