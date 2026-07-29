import Link from 'next/link';
import type { TaskDto } from '@/shared/api';
import { GLOW } from '@/shared/lib';
import { metaOf } from '../lib/meta';
import { CheckRing } from './CheckRing';

type Props = {
  task: TaskDto;
  /** 渡すとタップでトグルする。省略時は読み取り専用の静的表示。 */
  onToggle?: (id: string) => void;
  /** 詳細リンクの遷移先が指す日付（`today` または `YYYY-MM-DD`）。 */
  date: string;
};

/** タスク1行。見た目の正本は `docs/design/02-today.md`（`.row` in globals.css）。 */
export function TaskRow({ task, onToggle, date }: Props) {
  const meta = metaOf(task);
  const background = task.done ? 'rgba(56, 229, 255, ' + (0.018 + 0.02 * GLOW) + ')' : undefined;

  const body = (
    <>
      <span className="row__body">
        <span className={'row__text' + (task.done ? ' row__text--done' : '')} style={{ display: 'block' }}>
          {task.content}
        </span>
        {meta && <span className="mono row__meta" style={{ display: 'block' }}>{meta}</span>}
      </span>
      <span className="mono row__chev" aria-hidden="true">›</span>
    </>
  );

  /*
   * 詳細リンクを持つ行（docs/specs/12-web-digest.md §3.1）:
   * **チェックリングだけがトグル、それ以外の面はすべて詳細へ遷移**する。
   * リングは 22px だが、タップ領域は 44px 以上を確保する（同 §3.1）。
   * `nightshift.report` は夜勤詳細（/nightshift・docs/specs/13-web-nightshift.md）、
   * `digest.*` はダイジェスト詳細（/digest）へ。どちらもアプリ内ビュー。
   */
  if (task.detailRef) {
    const href =
      task.detailRef === 'nightshift.report'
        ? '/nightshift?date=' +
          encodeURIComponent(date) +
          '&taskId=' +
          encodeURIComponent(task.id)
        : '/digest?date=' +
          encodeURIComponent(date) +
          '&section=' +
          encodeURIComponent(task.detailRef) +
          '&taskId=' +
          encodeURIComponent(task.id);

    return (
      <div className="row row--split" style={{ background }}>
        {onToggle ? (
          <button
            type="button"
            className="row__ring"
            aria-label={task.content + ' のチェックを切り替える'}
            aria-pressed={task.done}
            onClick={() => onToggle(task.id)}
          >
            <CheckRing done={task.done} />
          </button>
        ) : (
          <span className="row__ring">
            <CheckRing done={task.done} />
          </span>
        )}
        <Link className="row__link" href={href} aria-label={task.content + ' の詳細を開く'}>
          {body}
        </Link>
      </div>
    );
  }

  // 詳細を持たない行は従来どおり（行全体がトグル）
  const plainBody = (
    <>
      <CheckRing done={task.done} />
      <span className="row__body">
        <span className={'row__text' + (task.done ? ' row__text--done' : '')} style={{ display: 'block' }}>
          {task.content}
        </span>
        {meta && <span className="mono row__meta" style={{ display: 'block' }}>{meta}</span>}
      </span>
    </>
  );

  if (!onToggle) {
    return <div className="row" style={{ background }}>{plainBody}</div>;
  }

  return (
    <button
      type="button"
      className="row row--tap"
      style={{ background }}
      aria-pressed={task.done}
      onClick={() => onToggle(task.id)}
    >
      {plainBody}
    </button>
  );
}
