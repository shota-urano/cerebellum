import type { CSSProperties } from 'react';
import type { TaskDto } from '@/shared/api';
import { TaskRow } from './TaskRow';

type Props = {
  /** 表示順はサーバー返却順のまま（クライアントで再ソートしない。docs/specs/08 §4） */
  tasks: TaskDto[];
  onToggle?: (id: string) => void;
  heading?: boolean;
  style?: CSSProperties;
  /** 詳細シェブロンのリンク先が指す日付（docs/specs/12-web-digest.md §3.1） */
  date: string;
};

/** タスク一覧パネル。見た目の正本は `docs/design/02-today.md`（`.list__head` / `.row` in globals.css）。 */
export function TaskList({ tasks, onToggle, heading = false, style, date }: Props) {
  return (
    <div className="panel stack" style={{ overflow: 'hidden', ...style }}>
      {heading && (
        <div className="mono list__head">
          <span>TASKS</span>
          <span>{tasks.length} ITEMS</span>
        </div>
      )}
      {tasks.map((task) => (
        <TaskRow key={task.id} task={task} onToggle={onToggle} date={date} />
      ))}
    </div>
  );
}
