'use client';

import { useCallback, useState } from 'react';
import type { KeyedMutator } from 'swr';
import {
  ApiError,
  apiDelete,
  apiPost,
  apiPut,
  type RoutineInput,
  type RoutineResponse,
  type RoutinesResponse,
} from '@/shared/api';
import { ROUTINES_KEY } from './useRoutines';

function routineKey(id: number) {
  return ROUTINES_KEY + '/' + id;
}

/**
 * マスタの追加・更新・削除（docs/specs/10-web-routines.md §3.2・§3.3）。
 *
 * 一覧はサーバーが正なので optimistic update はしない（「今日」画面のトグルと違い、
 * 連打で体感が変わる操作ではなく、409/400 の差し戻しを正しく見せるほうが重要）。
 * 成功したら一覧を再検証する。
 */
export function useRoutineMutations(mutate: KeyedMutator<RoutinesResponse>) {
  const [pending, setPending] = useState(false);

  const run = useCallback(
    async (action: () => Promise<RoutineResponse>) => {
      setPending(true);
      try {
        await action();
        await mutate();
        return null;
      } catch (cause) {
        // 呼び出し側がフォーム内表示（400/409/404）とバナー（その他）を出し分ける
        return cause instanceof ApiError ? cause : new ApiError(0, null, String(cause));
      } finally {
        setPending(false);
      }
    },
    [mutate],
  );

  const create = useCallback(
    (input: RoutineInput) => run(() => apiPost<RoutineResponse>(ROUTINES_KEY, input)),
    [run],
  );

  const update = useCallback(
    (id: number, input: RoutineInput) => run(() => apiPut<RoutineResponse>(routineKey(id), input)),
    [run],
  );

  const remove = useCallback(
    (id: number) => run(() => apiDelete<RoutineResponse>(routineKey(id))),
    [run],
  );

  return { create, update, remove, pending };
}
