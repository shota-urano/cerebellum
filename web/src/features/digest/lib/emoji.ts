/**
 * Slack ショートコード → 絵文字（docs/specs/12-web-digest.md §3.3）。
 *
 * 変換は**表示側の責務**。サーバーは原文を保持する方針なので、ここで対応表を持つ。
 * 対応表に無いショートコードは元の文字列のまま残す（消さない）。
 */
const EMOJI: Record<string, string> = {
  ':brain:': '🧠',
  ':jigsaw:': '🧩',
  ':bulb:': '💡',
  ':bar_chart:': '📊',
  ':warning:': '⚠️',
  ':chart_with_upwards_trend:': '📈',
};

export function replaceShortcodes(text: string) {
  return text.replace(/:[a-z0-9_+-]+:/g, (match) => EMOJI[match] ?? match);
}

/** セクション見出しの日本語ラベル（title が無い preamble 用のフォールバックを含む）。 */
export function sectionLabel(kind: string, title: string | null) {
  if (title) return replaceShortcodes(title.replace(/\*/g, ''));
  return kind === 'preamble' ? 'その他' : kind;
}
