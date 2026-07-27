'use client';

import useSWR from 'swr';
import { SWR_OPTIONS, fetcher, type ApiError, type RoutinesResponse } from '@/shared/api';

/** `GET /api/routines`（既定は active のみ・id 昇順。docs/specs/03-api.md §2） */
export const ROUTINES_KEY = '/api/routines';

/** ルーティンマスタの一覧（docs/specs/10-web-routines.md §3.1）。 */
export function useRoutines() {
  const { data, error, isLoading, mutate } = useSWR<RoutinesResponse, ApiError>(
    ROUTINES_KEY,
    fetcher,
    SWR_OPTIONS,
  );
  return { routines: data?.routines, error, isLoading, mutate };
}
