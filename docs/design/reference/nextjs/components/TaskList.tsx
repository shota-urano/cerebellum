import TaskRow from './TaskRow';
import type { Task } from '@/lib/data';

type Props = {
  tasks: Task[];
  onToggle?: (id: string) => void;
  heading?: boolean;
  style?: React.CSSProperties;
};

export default function TaskList({ tasks, onToggle, heading = false, style }: Props) {
  return (
    <div className="panel stack" style={{ overflow: 'hidden', ...style }}>
      {heading && (
        <div className="mono list__head">
          <span>TASKS</span>
          <span>{tasks.length} ITEMS</span>
        </div>
      )}
      {tasks.map((task) => (
        <TaskRow key={task.id} task={task} onToggle={onToggle} />
      ))}
    </div>
  );
}
