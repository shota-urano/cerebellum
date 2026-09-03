'use client';

import { useDay } from '../hooks/useDay';
import { useToggleCheck } from '../hooks/useToggleCheck';
import { AllClear } from './AllClear';
import { DayTasksSkeleton } from './DaySkeleton';
import { EmptyState } from './EmptyState';
import { TaskList } from './TaskList';

export type DayTasksProps = {
  /** `GET /api/days/{date}` の `{date}`。`today` または `YYYY-MM-DD`（docs/specs/03 §2） */
  date: string;
  /** 読み取り専用モード（docs/specs/09 §3）。トグルを無効化し、ヘッダ行と ALL CLEAR を出さない */
  readonly?: boolean;
};

/**
 * その日の日課一覧＋消し込み（docs/specs/08 §3）。
 *
 * docs/specs/30-web-today-order.md §5 で `DayView` から割り出した下半分。**ALL CLEAR と
 * EmptyState は TASKS の直上**——どちらも日課の一覧に対する状態表示なので一覧と離さない
 * （同 §3.1）。上半分（エラーバナー・計器盤ヘッダ）は `DayHeader`。
 *
 * `useDay` は `DayHeader` と同じキーを引く。SWR が同一キーの取得を束ねるので**取得回数は増えない**
 * （同 §4・docs/specs/07 §5）。
 */
export function DayTasks({ date, readonly = false }: DayTasksProps) {
  const { day, error, isLoading, mutate } = useDay(date);
  // 失敗のバナーは `DayHeader` が最上部に出す（30 §5・§6。合図は feature 内の共有スロット経由）
  const { toggle } = useToggleCheck(day, mutate);

  const isReadonly = readonly || day?.readonly === true;
  const done = day?.progress.done ?? 0;
  const total = day?.progress.total ?? 0;

  return (
    <>
      {!day ? (
        // 取得前。エラーで一度も取れていないときはスケルトンを出さない（永久スケルトンにしない・08 §6）
        isLoading || !error ? <DayTasksSkeleton readonly={readonly} /> : null
      ) : (
        <>
          {!isReadonly && total > 0 && done === total && <AllClear />}
          {total === 0 && (
            <EmptyState
              message={isReadonly ? '記録なし' : '今日のタスクはありません'}
              style={{ marginTop: isReadonly ? 14 : 12 }}
            />
          )}

          {total > 0 && (
            <TaskList
              date={date}
              tasks={day.tasks}
              onToggle={isReadonly ? undefined : toggle}
              heading={!isReadonly}
              style={{ marginTop: isReadonly ? 14 : 18 }}
            />
          )}
        </>
      )}
    </>
  );
}
