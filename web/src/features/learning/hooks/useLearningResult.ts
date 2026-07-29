'use client';

import { useCallback, useState } from 'react';
import useSWR from 'swr';
import {
  ApiError,
  apiPost,
  fetcher,
  type LearningResultInput,
  type LearningResultResponse,
} from '@/shared/api';
import { LEARNING_SWR, learningSetKey } from './useLearningSet';

/** `GET|POST /api/learning/sets/{date}/result` */
export function learningResultKey(date: string) {
  return learningSetKey(date) + '/result';
}

/**
 * その日の記録済み成績（docs/specs/15-web-learning.md §4 の「result 送信済みの日に再訪」）。
 * 未記録は 404 なので、`result === undefined && !isLoading` が「まだ記録していない」。
 */
export function useLearningResult(date: string) {
  const { data, error, isLoading, mutate } = useSWR<LearningResultResponse, ApiError>(
    learningResultKey(date),
    fetcher,
    LEARNING_SWR,
  );
  return { result: data, resultError: error, resultLoading: isLoading, mutateResult: mutate };
}

/**
 * 成績の記録（docs/specs/15-web-learning.md §3.4）。
 *
 * 成功したかどうかを真偽値で返す——**呼び出し側は真のときだけ消し込みへ進む**
 * （記録なしにタスクが消えるのが最悪ケース。同 §4）。失敗はトーストで再試行させるため
 * 例外を投げずに保持する。
 */
export function useSaveLearningResult(
  date: string,
  onSaved: (saved: LearningResultResponse) => void,
) {
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<ApiError | null>(null);

  const save = useCallback(
    async (input: LearningResultInput): Promise<boolean> => {
      setSaving(true);
      setSaveError(null);
      try {
        const saved = await apiPost<LearningResultResponse>(learningResultKey(date), input);
        onSaved(saved);
        return true;
      } catch (cause) {
        setSaveError(cause instanceof ApiError ? cause : new ApiError(0, null, String(cause)));
        return false;
      } finally {
        setSaving(false);
      }
    },
    [date, onSaved],
  );

  return { save, saving, saveError, clearSaveError: () => setSaveError(null) };
}
