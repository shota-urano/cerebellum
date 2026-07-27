import type { DigestBlockDto, DigestSectionDto } from '@/shared/api';
import { replaceShortcodes, sectionLabel } from '../lib/emoji';
import { obsidianHref } from '../lib/note';

/**
 * `*強調*`（Slack mrkdwn の1アスタリスク）を accent 色で、`` `code` `` を等幅で出す。
 * `**` は規約上使われない。
 */
function Inline({ text }: { text: string }) {
  const parts = replaceShortcodes(text).split(/(\*[^*]+\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
          return <strong className="dg__em" key={index}>{part.slice(1, -1)}</strong>;
        }
        if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
          return <code className="mono dg__code" key={index}>{part.slice(1, -1)}</code>;
        }
        return part;
      })}
    </>
  );
}

/** ノートリンク。パスは可視のまま残し、Obsidian で開けるようにする（docs/specs/12-web-digest.md §3.3）。 */
function NoteLink({ notePath }: { notePath: string }) {
  return (
    <a className="mono dg__note" href={obsidianHref(notePath)}>
      {notePath}
    </a>
  );
}

/**
 * ノートパスは NoteLink で別に出すので、本文側からは取り除く。
 * 行末の ` — \`パス\`` だけでなく、文中の `` `パス` ``（「⇒ `…` に保存済み」）も対象。
 */
function stripNotePath(text: string, notePath: string | null) {
  if (!notePath) return text;
  const quoted = '`' + notePath + '`';
  return text
    .split(quoted)
    .join('')
    .replace(/\s*[—-]\s*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trimEnd();
}

function Block({ block }: { block: DigestBlockDto }) {
  const body = <Inline text={stripNotePath(block.text, block.notePath)} />;

  switch (block.kind) {
    case 'lead':
      return (
        <div className="dg__lead">
          <span className="mono label">起点</span>
          <p className="dg__text">{body}</p>
        </div>
      );
    case 'chain':
      return (
        <div className="dg__chain">
          <span className="mono dg__arrow">→</span>
          <div>
            <p className="dg__text">{body}</p>
            {block.notePath && <NoteLink notePath={block.notePath} />}
          </div>
        </div>
      );
    case 'bullet':
      return (
        <div className="dg__bullet">
          <span className="dg__dot">•</span>
          <div>
            {block.text.split('\n').map((line, index) => (
              <p className="dg__text" key={index}>
                <Inline text={stripNotePath(line, block.notePath)} />
              </p>
            ))}
            {block.notePath && <NoteLink notePath={block.notePath} />}
          </div>
        </div>
      );
    case 'saved':
      return (
        <div className="dg__saved">
          <p className="dg__text">{body}</p>
          {block.notePath && <NoteLink notePath={block.notePath} />}
        </div>
      );
    case 'warning':
      return (
        <div className="dg__warn">
          <span className="mono banner__tag">!</span>
          <p className="dg__text">{body}</p>
        </div>
      );
    default:
      return <p className="dg__text">{body}</p>;
  }
}

/** 1セクション（docs/specs/12-web-digest.md §3.2）。表示順はサーバー返却順のまま。 */
export function DigestSection({
  section,
  highlighted,
}: {
  section: DigestSectionDto;
  highlighted: boolean;
}) {
  return (
    <section className={'panel dg' + (highlighted ? ' dg--on' : '')}>
      <h2 className="mono dg__head">{sectionLabel(section.kind, section.title)}</h2>
      {section.blocks.map((block, index) => (
        <Block block={block} key={index} />
      ))}
    </section>
  );
}
