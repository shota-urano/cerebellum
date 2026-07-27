import type { RoutineDto } from '@/shared/api';

/**
 * 行のメタ表示（`{time}  [{tool}]  {effort}`）。
 *
 * 「今日」画面の `metaOf`（docs/design/02-today.md）と同じ規則に、マスタ編集で必要な
 * `effort` を足したもの。day feature の実装を import しない（feature 間 import 禁止・
 * docs/specs/07-web-foundation.md §3）ため、規則をこちらにも書く。
 */
export function metaOf(routine: RoutineDto) {
  const tool = routine.tool && routine.tool !== '-' ? '[' + routine.tool + ']' : '';
  return [routine.time, tool, routine.effort].filter(Boolean).join('  ');
}
