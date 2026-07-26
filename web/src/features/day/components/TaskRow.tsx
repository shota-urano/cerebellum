import type { TaskDto } from '@/shared/api';
import { GLOW } from '@/shared/lib';
import { metaOf } from '../lib/meta';
import { CheckRing } from './CheckRing';

type Props = {
  task: TaskDto;
  /** 渡すとタップでトグルする。省略時は読み取り専用の静的表示。 */
  onToggle?: (id: string) => void;
};

/** タスク1行。見た目の正本は `docs/design/02-today.md`（`.row` in globals.css）。 */
export function TaskRow({ task, onToggle }: Props) {
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

  if (!onToggle) {
    return <div className="row" style={{ background }}>{body}</div>;
  }

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
