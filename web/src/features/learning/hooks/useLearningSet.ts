'use client';

import useSWR from 'swr';
import {
  SWR_OPTIONS,
  fetcher,
  type ApiError,
  type LearningLane,
  type LearningSetResponse,
} from '@/shared/api';
import { DEFAULT_LEARNING_LANE } from '../lib/lane';

/** `/api/learning/sets/{date}`（`{date}` は `today` または `YYYY-MM-DD`）。 */
export function learningSetPath(date: string) {
  return '/api/learning/sets/' + encodeURIComponent(date);
}

/**
 * `?lane=`（docs/specs/31-learning-lanes.md §3.3）。
 * **本線はクエリを付けない**——省略時が `main` なので送っても同義で、
 * 付けないほうが sharpen ほかの既存経路と URL が一致する。
 */
export function learningLaneQuery(lane: LearningLane) {
  return lane === DEFAULT_LEARNING_LANE ? '' : '?lane=' + encodeURIComponent(lane);
}

/** `GET /api/learning/sets/{date}?lane={lane}`（lane 省略時は本線）。 */
export function learningSetKey(date: string, lane: LearningLane = DEFAULT_LEARNING_LANE) {
  return learningSetPath(date) + learningLaneQuery(lane);
}

/**
 * 学習 API は「未取り込み＝404」が正常な答え（docs/specs/14-learning.md §6）。
 * 再試行しても 404 のままなので、リトライを切って画面へすぐ返す。
 */
export const LEARNING_SWR = { ...SWR_OPTIONS, shouldRetryOnError: false };

/**
 * その日・そのレーンの学習セット（docs/specs/15-web-learning.md §2）。
 * 404 はレーンごとに独立（docs/specs/31-learning-lanes.md §3.3）。
 */
export function useLearningSet(date: string, lane: LearningLane = DEFAULT_LEARNING_LANE) {
  const { data, error, isLoading } = useSWR<LearningSetResponse, ApiError>(
    learningSetKey(date, lane),
    fetcher,
    LEARNING_SWR,
  );
  return { set: data, error, isLoading };
}
