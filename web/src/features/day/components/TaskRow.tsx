import Link from 'next/link';
import type { TaskDto } from '@/shared/api';
import { GLOW } from '@/shared/lib';
import { metaOf } from '../lib/meta';
import { CheckRing } from './CheckRing';

type Props = {
  task: TaskDto;
  /** 渡すとタップでトグルする。省略時は読み取り専用の静的表示。 */
  onToggle?: (id: string) => void;
  /** 詳細シェブロンのリンク先が指す日付（`today` または `YYYY-MM-DD`）。 */
  date: string;
};

/** タスク1行。見た目の正本は `docs/design/02-today.md`（`.row` in globals.css）。 */
export function TaskRow({ task, onToggle, date }: Props) {
  const meta = metaOf(task);
  const background = task.done ? 'rgba(56, 229, 255, ' + (0.018 + 0.02 * GLOW) + ')' : undefined;

  const body = (
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

  /*
   * 詳細シェブロン（docs/specs/12-web-digest.md §3.1）。
   * 行本体のタップは従来どおりトグルのまま、シェブロンだけが詳細へ遷移する。
   * 入れ子にすると button の中に a が入って不正な DOM になるので、行を分割して並べる。
   */
  const chevron = task.detailRef ? (
    <Link
      className="mono row__chev"
      href={
        '/digest?date=' +
        encodeURIComponent(date) +
        '&section=' +
        encodeURIComponent(task.detailRef) +
        '&taskId=' +
        encodeURIComponent(task.id)
      }
      aria-label={task.content + ' の詳細を開く'}
      // 親が button でなくとも、行全体のタップ判定に巻き込まれないようにする
      onClick={(event) => event.stopPropagation()}
    >
      ›
    </Link>
  ) : null;

  if (!onToggle) {
    return (
      <div className="row" style={{ background }}>
        {body}
        {chevron}
      </div>
    );
  }

  if (!chevron) {
    return (
      <button
        type="button"
        className="row row--tap"
        style={{ background }}
        aria-pressed={task.done}
        onClick={() => onToggle(task.id)}
      >
        {body}
      </button>
    );
  }

  return (
    <div className="row row--split" style={{ background }}>
      <button
        type="button"
        className="row__tap"
        aria-pressed={task.done}
        onClick={() => onToggle(task.id)}
      >
        {body}
      </button>
      {chevron}
    </div>
  );
}
