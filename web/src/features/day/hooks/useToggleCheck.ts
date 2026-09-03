'use client';

import { useCallback, useEffect, useRef } from 'react';
import useSWR, { useSWRConfig, type KeyedMutator } from 'swr';
import { ApiError, apiPost, type DayResponse } from '@/shared/api';
import { toggleTaskDone } from '../lib/toggle';

/** `POST /api/days/today/checks/{taskId}`（当日のみ。docs/specs/03 §2） */
function checkKey(taskId: string) {
  return '/api/days/today/checks/' + encodeURIComponent(taskId);
}

/**
 * トグル失敗の置き場所。**API のパスではなく feature 内のローカルキー**（`/` 始まりにしない
 * ことで fetcher を持つキーと混ざらない）。トグルは当日にしか撃てない
 * （`checkKey` が `today` 固定・docs/specs/03 §2）ので日付で分けない。
 *
 * これを置く理由: docs/specs/30-web-today-order.md §5 の分割で、トグルを撃つ `DayTasks` と
 * バナーを出す `DayHeader`（最上部）が兄弟になった。表示位置は割る前（`error ?? toggleError` を
 * 最上部に1枚）から変えないので、失敗の合図を兄弟へ渡す必要がある。
 */
const TOGGLE_ERROR_KEY = 'day:toggle-error';

/**
 * 直近のトグル失敗（`DayHeader` が最上部のバナーに使う）。
 *
 * fetcher を渡さない `useSWR` は取得を一切行わず、キャッシュを購読するだけの共有状態になる
 * （SWR は既存の依存・docs/specs/00-overview.md §4。context provider を app 層へ足さずに
 * feature の内側で解決できる）。書き込みは `useToggleCheck` だけが行う。
 */
export function useToggleError() {
  const { data } = useSWR<ApiError | null>(TOGGLE_ERROR_KEY, null);
  return data ?? undefined;
}

/**
 * チェックのトグル（docs/specs/08 §3）。
 *
 * `mutate` の optimistic update で即時反映し、POST が失敗したらロールバックしたうえで
 * 再検証する（404 でサーバーと ID がずれていた場合に実状態へ戻すため。同 §6）。
 */
export function useToggleCheck(day: DayResponse | undefined, mutate: KeyedMutator<DayResponse>) {
  const { mutate: mutateCache } = useSWRConfig();
  const error = useToggleError();
  const requestQueue = useRef<Promise<void>>(Promise.resolve());

  /** 合図の書き込み。`revalidate: false` なので取得は起きない（fetcher の無いキー） */
  const setError = useCallback(
    (next: ApiError | null) => {
      void mutateCache(TOGGLE_ERROR_KEY, next, { revalidate: false });
    },
    [mutateCache],
  );

  // 画面を離れたら消す。持ち越すと、別画面の失敗が「今日」の最上部に残る
  // （割る前は component state だったので離脱で消えていた。その寿命を保つ）
  useEffect(() => () => setError(null), [setError]);

  const toggle = useCallback(
    async (taskId: string) => {
      if (!day) return;
      setError(null);

      // 同じ SWR キーへ複数の mutation を並行実行すると、後発開始後に完了した先発応答は
      // SWR が競合として破棄する。POST 自体を直列化し、最後の応答が必ずサーバーの最終状態にする。
      const request = requestQueue.current.then(
        () => apiPost<DayResponse>(checkKey(taskId)),
        () => apiPost<DayResponse>(checkKey(taskId)),
      );
      requestQueue.current = request.then(
        () => undefined,
        () => undefined,
      );

      try {
        await mutate(request, {
          // 連続タップ時は、前の optimistic 表示を含む最新表示へ次の反転を重ねる。
          optimisticData: (committed, displayed) =>
            toggleTaskDone(displayed ?? committed ?? day, taskId),
          rollbackOnError: true,
          populateCache: true,
          // POST がその日の最新状態を返すので、成功時は追加の GET を投げない
          revalidate: false,
        });
      } catch (cause) {
        setError(cause instanceof ApiError ? cause : new ApiError(0, null, String(cause)));
        void mutate();
      }
    },
    [day, mutate, setError],
  );

  return { toggle, toggleError: error };
}
