'use client';

import { ErrorBanner } from '@/shared/ui';
import { useDay } from '../hooks/useDay';
import { useToggleCheck } from '../hooks/useToggleCheck';
import { AllClear } from './AllClear';
import { DaySkeleton } from './DaySkeleton';
import { EmptyState } from './EmptyState';
import { HeaderPanel } from './HeaderPanel';
import { ReadonlyHead } from './ReadonlyHead';
import { TaskList } from './TaskList';

export type DayViewProps = {
  /** `GET /api/days/{date}` の `{date}`。`today` または `YYYY-MM-DD`（docs/specs/03 §2） */
  date: string;
  /**
   * 読み取り専用モード（docs/specs/09 §3）。トグルを無効化し、計器盤ヘッダの代わりに
   * 「読み取り専用」バッジを出す。サーバーが `readonly: true` を返した日も同じ扱いになる。
   */
  readonly?: boolean;
};

/**
 * その日のタスク一覧＋消し込み（docs/specs/08）。
 * 組み立て順は `docs/design/02-today.md`「レイアウト構造」に従う。
 */
export function DayView({ date, readonly = false }: DayViewProps) {
  const { day, error, isLoading, mutate } = useDay(date);
  const { toggle, toggleError } = useToggleCheck(day, mutate);

  const banner = error ?? toggleError;
  const isReadonly = readonly || day?.readonly === true;
  const done = day?.progress.done ?? 0;
  const total = day?.progress.total ?? 0;

  return (
    <>
      {/* 文言はサーバーの message をそのまま出す（docs/specs/07 §6）。fetch 失敗時は client.ts の汎用文言 */}
      {banner && <ErrorBanner message={banner.message} />}

      {!day ? (
        // 取得前。エラーで一度も取れていないときはバナーだけ出す（永久スケルトンにしない）
        isLoading || !error ? <DaySkeleton readonly={readonly} /> : null
      ) : (
        <>
          {isReadonly ? <ReadonlyHead done={done} total={total} /> : <HeaderPanel iso={day.date} done={done} total={total} />}

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
