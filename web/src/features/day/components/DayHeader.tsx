'use client';

import { ErrorBanner } from '@/shared/ui';
import { useDay } from '../hooks/useDay';
import { DayHeaderSkeleton } from './DaySkeleton';
import { HeaderPanel } from './HeaderPanel';
import { ReadonlyHead } from './ReadonlyHead';

export type DayHeaderProps = {
  /** `GET /api/days/{date}` の `{date}`。`today` または `YYYY-MM-DD`（docs/specs/03 §2） */
  date: string;
  /**
   * 読み取り専用モード（docs/specs/09 §3）。計器盤ヘッダの代わりに「読み取り専用」バッジを
   * 出す。サーバーが `readonly: true` を返した日も同じ扱いになる。
   */
  readonly?: boolean;
  /**
   * WAITING（AI からの確認待ち）に異常があるか（docs/specs/25-web-inbox.md §3.1）。
   * 計器盤の右端に赤点を出すだけで、**進捗・ALL CLEAR の判定には入らない**
   * （日課の完了と AI 側の異常は別の話・同 §3.1）。判定は inbox feature が持ち、
   * ここへ渡すのは `app/page.tsx`（features 間 import を作らないため・同 §5）。
   */
  alert?: boolean;
};

/**
 * その日の計器盤ヘッダ（docs/specs/08 §3）＋最上部のエラーバナー。
 *
 * docs/specs/30-web-today-order.md §5 で `DayView` から割り出した上半分。**計器盤は常に最上部**
 * ——赤点は WAITING の異常の合図なので、TASKS と一緒に最下段へ下げると合図がスクロールの先に
 * 隠れて機能を失う（同 §1）。下半分（ALL CLEAR・EmptyState・TASKS）は `DayTasks`。
 *
 * `useDay` は `DayTasks` と同じキーを引く。SWR が同一キーの取得を束ねるので**取得回数は増えない**
 * （同 §4・docs/specs/07 §5）。
 */
export function DayHeader({ date, readonly = false, alert = false }: DayHeaderProps) {
  const { day, error, isLoading } = useDay(date);

  const isReadonly = readonly || day?.readonly === true;
  const done = day?.progress.done ?? 0;
  const total = day?.progress.total ?? 0;

  return (
    <>
      {/* 文言はサーバーの message をそのまま出す（docs/specs/07 §6）。fetch 失敗時は client.ts の汎用文言。
          最上部に置く（30 §6）——並び替えでも「まず異常が目に入る」位置は変えない */}
      {error && <ErrorBanner message={error.message} />}

      {!day ? (
        // 取得前。エラーで一度も取れていないときはバナーだけ出す（永久スケルトンにしない・08 §6）
        isLoading || !error ? <DayHeaderSkeleton readonly={readonly} /> : null
      ) : isReadonly ? (
        <ReadonlyHead done={done} total={total} />
      ) : (
        <HeaderPanel iso={day.date} done={done} total={total} alert={alert} />
      )}
    </>
  );
}
