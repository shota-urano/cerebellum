'use client';

import { useCallback, useRef, useState } from 'react';
import type { KeyedMutator } from 'swr';
import { ApiError, apiPost, type DayResponse } from '@/shared/api';
import { toggleTaskDone } from '../lib/toggle';

/** `POST /api/days/today/checks/{taskId}`（当日のみ。docs/specs/03 §2） */
function checkKey(taskId: string) {
  return '/api/days/today/checks/' + encodeURIComponent(taskId);
}

/**
 * チェックのトグル（docs/specs/08 §3）。
 *
 * `mutate` の optimistic update で即時反映し、POST が失敗したらロールバックしたうえで
 * 再検証する（404 でサーバーと ID がずれていた場合に実状態へ戻すため。同 §6）。
 */
export function useToggleCheck(day: DayResponse | undefined, mutate: KeyedMutator<DayResponse>) {
  const [error, setError] = useState<ApiError | null>(null);
  const requestQueue = useRef<Promise<void>>(Promise.resolve());

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
    [day, mutate],
  );

  return { toggle, toggleError: error };
}
