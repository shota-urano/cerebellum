'use client';

import { useState } from 'react';

/**
 * 候補ファイルのパスを可視のまま出し、横のボタンでコピーできるようにする
 * （docs/specs/23-web-waiting.md §3.2）。**元ノートへのリンクは作らない**——cerebellum は
 * Vault を参照しないので、開くのはターミナル／Obsidian の仕事。パスを渡すところまでが役目。
 *
 * **黙って何もしない経路を作らない**（docs/specs/22-daily-intake.md §3.5 の
 * 「沈黙させない」原則）。Tailscale 越しの http は secure context ではなく
 * `navigator.clipboard` が無い場合があるので、その場合も「コピーできなかった」ことを出し、
 * 手で選択する導線を案内する。パス文字列自体は常に画面に出したままにする。
 */
type CopyState = 'idle' | 'done' | 'error';

export function CopyPath({ label, path }: { label: string; path: string }) {
  const [state, setState] = useState<CopyState>('idle');

  const copy = async () => {
    try {
      // clipboard API が無い環境（非 secure context）はここで error へ倒す
      if (!navigator.clipboard) throw new Error('clipboard API がありません');
      await navigator.clipboard.writeText(path);
      setState('done');
    } catch {
      setState('error');
    }
  };

  return (
    <div className="wt__path">
      <span className="mono wt__pathtext">{path}</span>
      <button
        type="button"
        className="mono wt__copy"
        aria-label={label + 'をコピー'}
        onClick={() => void copy()}
      >
        {state === 'done' ? 'コピー済' : 'コピー'}
      </button>
      {state === 'error' && (
        <span className="mono wt__copyerr" role="alert">
          コピーできませんでした。パスを選択して手でコピーしてください
        </span>
      )}
    </div>
  );
}
