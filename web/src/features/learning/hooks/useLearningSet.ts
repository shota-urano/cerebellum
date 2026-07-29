'use client';

import useSWR from 'swr';
import { SWR_OPTIONS, fetcher, type ApiError, type LearningSetResponse } from '@/shared/api';

/** `GET /api/learning/sets/{date}`（`{date}` は `today` または `YYYY-MM-DD`）。 */
export function learningSetKey(date: string) {
  return '/api/learning/sets/' + encodeURIComponent(date);
}

/**
 * 学習 API は「未取り込み＝404」が正常な答え（docs/specs/14-learning.md §6）。
 * 再試行しても 404 のままなので、リトライを切って画面へすぐ返す。
 */
export const LEARNING_SWR = { ...SWR_OPTIONS, shouldRetryOnError: false };

/** その日の学習セット（docs/specs/15-web-learning.md §2）。未取り込みの日は 404。 */
export function useLearningSet(date: string) {
  const { data, error, isLoading } = useSWR<LearningSetResponse, ApiError>(
    learningSetKey(date),
    fetcher,
    LEARNING_SWR,
  );
  return { set: data, error, isLoading };
}
