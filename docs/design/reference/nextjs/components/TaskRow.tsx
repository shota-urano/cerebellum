import CheckRing from './CheckRing';
import { metaOf, type Task } from '@/lib/data';
import { GLOW } from '@/lib/theme';

type Props = {
  task: Task;
  /** 渡すとタップでトグルする。省略時は読み取り専用の静的表示。 */
  onToggle?: (id: string) => void;
};

export default function TaskRow({ task, onToggle }: Props) {
  const meta = metaOf(task);
  const background = task.done ? 'rgba(56, 229, 255, ' + (0.018 + 0.02 * GLOW) + ')' : undefined;

  const body = (
    <>
      <CheckRing done={task.done} />
      <span className="row__body">
        <span className={'row__text' + (task.done ? ' row__text--done' : '')} style={{ display: 'block' }}>
          {task.text}
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
