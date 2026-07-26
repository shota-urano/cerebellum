'use client';

import { useCallback, useState } from 'react';
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

  const toggle = useCallback(
    async (taskId: string) => {
      if (!day) return;
      setError(null);
      try {
        await mutate(apiPost<DayResponse>(checkKey(taskId)), {
          optimisticData: toggleTaskDone(day, taskId),
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
