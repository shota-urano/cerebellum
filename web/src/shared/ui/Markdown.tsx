/**
 * 最小の Markdown 描画（見出し・箇条書き・引用・コードブロック・テーブル・段落／
 * インラインは `` `code` ``・`**強調**`・`[text](url)` のみ）。対応記法の正本は
 * docs/specs/07-web-foundation.md §4。
 *
 * 学習セットの `lessonMd` / `questionMd` / `answerMd`（docs/specs/14-learning.md §3.1）を
 * 出すためのもの。外部ライブラリは入れない（依存を増やさない・確定済み技術選定は
 * docs/specs/00-overview.md §4）。`dangerouslySetInnerHTML` は使わないので、
 * 未知の記法はそのまま素のテキストとして見える＝壊れても読める側に倒す。
 */

import { Fragment } from 'react';

type Block =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'quote'; text: string }
  | { kind: 'table'; header: string[]; rows: string[][] }
  | { kind: 'para'; text: string };

const FENCE = /^\s*```/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const ORDERED = /^\s*\d+[.)]\s+(.*)$/;
const QUOTE = /^\s*>\s?(.*)$/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;
/** 区切り行 `|---|:--:|`。`:` の整列指定は読み飛ばす（整列は付けない） */
const TABLE_RULE = /^\s*\|(?:\s*:?-+:?\s*\|)+\s*$/;

/**
 * `| a | b |` の1行をセルへ割る。`\|` はセル内のパイプとして扱うため、
 * 正規表現 split ではなく1文字ずつ走査する（lookbehind を避ける＝古い WebView でも動く）。
 */
function splitCells(line: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let escaped = false;

  for (const char of line.trim()) {
    if (escaped) {
      cell += char === '|' ? '|' : '\\' + char;
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '|') {
      cells.push(cell.trim());
      cell = '';
      continue;
    }
    cell += char;
  }
  if (escaped) cell += '\\';
  cells.push(cell.trim());

  // 先頭・末尾の `|` が生む空セルだけを落とす（内側の空セルは列として残す）
  cells.pop();
  cells.shift();
  return cells;
}

/** 行の配列をブロックへ畳む。閉じていないコードフェンスは最後まで取り込む。 */
export function parseMarkdown(md: string): Block[] {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === '') {
      i += 1;
      continue;
    }

    if (FENCE.test(line)) {
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !FENCE.test(lines[i])) {
        body.push(lines[i]);
        i += 1;
      }
      i += 1; // 閉じフェンス
      blocks.push({ kind: 'code', text: body.join('\n') });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({ kind: 'heading', level: heading[1].length, text: heading[2] });
      i += 1;
      continue;
    }

    const ordered = ORDERED.test(line);
    if (ordered || BULLET.test(line)) {
      const pattern = ordered ? ORDERED : BULLET;
      const items: string[] = [];
      while (i < lines.length) {
        const match = pattern.exec(lines[i]);
        if (!match) break;
        items.push(match[1]);
        i += 1;
      }
      blocks.push({ kind: 'list', ordered, items });
      continue;
    }

    // ヘッダ行の直後に区切り行がある形だけをテーブルとして扱う（GFM）
    if (TABLE_ROW.test(line) && i + 1 < lines.length && TABLE_RULE.test(lines[i + 1])) {
      const header = splitCells(line);
      const rows: string[][] = [];
      i += 2; // ヘッダ行＋区切り行
      while (i < lines.length && TABLE_ROW.test(lines[i])) {
        const cells = splitCells(lines[i]);
        // 不足は空セルで埋め、超過は捨てる（列の対応を崩さない）
        rows.push(header.map((_, column) => cells[column] ?? ''));
        i += 1;
      }
      blocks.push({ kind: 'table', header, rows });
      continue;
    }

    if (QUOTE.test(line)) {
      const body: string[] = [];
      while (i < lines.length) {
        const match = QUOTE.exec(lines[i]);
        if (!match) break;
        body.push(match[1]);
        i += 1;
      }
      blocks.push({ kind: 'quote', text: body.join('\n') });
      continue;
    }

    const body: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !FENCE.test(lines[i]) &&
      !HEADING.test(lines[i]) &&
      !BULLET.test(lines[i]) &&
      !ORDERED.test(lines[i]) &&
      !QUOTE.test(lines[i]) &&
      !(TABLE_ROW.test(lines[i]) && i + 1 < lines.length && TABLE_RULE.test(lines[i + 1]))
    ) {
      body.push(lines[i]);
      i += 1;
    }
    blocks.push({ kind: 'para', text: body.join('\n') });
  }

  return blocks;
}

/** `javascript:` などを踏まないよう、リンクは http(s) と相対パスだけ通す。 */
function safeHref(href: string): string | null {
  const value = href.trim();
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith('/') || value.startsWith('#')) return value;
  return null;
}

const INLINE = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)\s]+\))/g;
const LINK = /^\[([^\]]+)\]\(([^)\s]+)\)$/;

/** インライン記法。改行はそのまま改行として出す（md の soft break は詰めない）。 */
function Inline({ text }: { text: string }) {
  return (
    <>
      {text.split(INLINE).map((part, index) => {
        if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
          return <code className="mono dg__code" key={index}>{part.slice(1, -1)}</code>;
        }
        if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
          return <strong className="dg__em" key={index}>{part.slice(2, -2)}</strong>;
        }
        const link = LINK.exec(part);
        if (link) {
          const href = safeHref(link[2]);
          if (href) {
            return <a className="dg__note md__link" href={href} key={index}>{link[1]}</a>;
          }
        }
        // 素のテキストは要素で包まない（DOM を余計に深くしない）
        return <Fragment key={index}>{part}</Fragment>;
      })}
    </>
  );
}

function BlockView({ block }: { block: Block }) {
  switch (block.kind) {
    case 'heading': {
      // ページの h1/h2 の下に入るので h3 以降へ寄せる（見出し階層を飛ばさない）
      const Tag = ('h' + Math.min(block.level + 2, 6)) as 'h3';
      return <Tag className="mono md__h"><Inline text={block.text} /></Tag>;
    }
    case 'code':
      return <pre className="mono md__pre"><code>{block.text}</code></pre>;
    case 'list': {
      const items = block.items.map((item, index) => (
        <li className="dg__text md__li" key={index}><Inline text={item} /></li>
      ));
      return block.ordered ? <ol className="md__ol">{items}</ol> : <ul className="md__ul">{items}</ul>;
    }
    case 'quote':
      return <blockquote className="md__quote"><p className="dg__text"><Inline text={block.text} /></p></blockquote>;
    case 'table': {
      // 2列だけ狭幅で縦積みへ落とす（3列以上は畳むと対応関係が壊れる →
      // 横スクロールのまま。docs/specs/07-web-foundation.md §4）
      const stack = block.header.length === 2;
      return (
        <div className="md__tablewrap">
          {/* 縦積みは display:block なので、明示 role が無いと表の構造が支援技術から消える */}
          <table className={'md__table' + (stack ? ' md__table--stack' : '')} role="table">
            <thead>
              <tr role="row">
                {block.header.map((cell, index) => (
                  <th className="md__th" key={index} role="columnheader" scope="col">
                    <Inline text={cell} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex} role="row">
                  {row.map((cell, index) => (
                    // 縦積み時に列名を出すための控え（CSS の ::before が読む）
                    <td className="md__td" data-label={block.header[index]} key={index} role="cell">
                      <Inline text={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    default:
      return <p className="dg__text md__p"><Inline text={block.text} /></p>;
  }
}

/** Markdown 本文。パネル内の本文様式（`.dg__text`）に揃える。 */
export function Markdown({ md }: { md: string }) {
  return (
    <div className="md">
      {parseMarkdown(md).map((block, index) => (
        <BlockView block={block} key={index} />
      ))}
    </div>
  );
}
