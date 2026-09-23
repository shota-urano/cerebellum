'use client';

import { useCallback, useState } from 'react';
import useSWR from 'swr';
import {
  ApiError,
  apiPost,
  fetcher,
  type LearningLane,
  type LearningResultInput,
  type LearningResultResponse,
} from '@/shared/api';
import { DEFAULT_LEARNING_LANE } from '../lib/lane';
import { LEARNING_SWR, learningLaneQuery, learningSetPath } from './useLearningSet';

/** `GET|POST /api/learning/sets/{date}/result?lane={lane}`（lane 省略時は本線）。 */
export function learningResultKey(date: string, lane: LearningLane = DEFAULT_LEARNING_LANE) {
  return learningSetPath(date) + '/result' + learningLaneQuery(lane);
}

/**
 * その日・そのレーンの記録済み成績（docs/specs/15-web-learning.md §4 の「result 送信済みの日に再訪」）。
 * 未記録は 404 なので、`result === undefined && !isLoading` が「まだ記録していない」。
 */
export function useLearningResult(date: string, lane: LearningLane = DEFAULT_LEARNING_LANE) {
  const { data, error, isLoading, mutate } = useSWR<LearningResultResponse, ApiError>(
    learningResultKey(date, lane),
    fetcher,
    LEARNING_SWR,
  );
  return { result: data, resultError: error, resultLoading: isLoading, mutateResult: mutate };
}

/**
 * 成績の記録（docs/specs/15-web-learning.md §3.4）。**開いているレーンへ送る**
 * （docs/specs/31-learning-lanes.md §3.4）。
 *
 * 成功したかどうかを真偽値で返す——**呼び出し側は真のときだけ消し込みへ進む**
 * （記録なしにタスクが消えるのが最悪ケース。同 §4）。失敗はトーストで再試行させるため
 * 例外を投げずに保持する。
 */
export function useSaveLearningResult(
  date: string,
  onSaved: (saved: LearningResultResponse) => void,
  lane: LearningLane = DEFAULT_LEARNING_LANE,
) {
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<ApiError | null>(null);

  const save = useCallback(
    async (input: LearningResultInput): Promise<boolean> => {
      setSaving(true);
      setSaveError(null);
      try {
        const saved = await apiPost<LearningResultResponse>(learningResultKey(date, lane), input);
        onSaved(saved);
        return true;
      } catch (cause) {
        setSaveError(cause instanceof ApiError ? cause : new ApiError(0, null, String(cause)));
        return false;
      } finally {
        setSaving(false);
      }
    },
    [date, lane, onSaved],
  );

  return { save, saving, saveError, clearSaveError: () => setSaveError(null) };
}
