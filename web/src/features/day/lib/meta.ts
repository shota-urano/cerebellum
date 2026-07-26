import type { TaskDto } from '@/shared/api';

/**
 * 行のメタ表示（`{time}  [{tool}]`）。
 *
 * 表示規則の正本は `docs/design/02-today.md`（素材 `lib/data.ts` の `metaOf`）:
 * ツールが空文字 / `-` のときは出さない。区切りは半角空白2つ。
 */
export function metaOf(task: TaskDto) {
  const tool = task.tool && task.tool !== '-' ? '[' + task.tool + ']' : '';
  return [task.time, tool].filter(Boolean).join('  ');
}
