'use client';

import useSWR from 'swr';
import { SWR_OPTIONS, fetcher, type ApiError, type SummaryResponse } from '@/shared/api';
import { WEEK_DAYS } from '../lib/week';

/** `GET /api/summary?days=N` のキー（docs/specs/03 §2） */
export function summaryKey(days: number) {
  return '/api/summary?days=' + days;
}

/** 直近N日の消化率サマリ（docs/specs/09 §3）。返るのはスナップショットがある日だけ。 */
export function useSummary(days: number = WEEK_DAYS) {
  const { data, error, isLoading } = useSWR<SummaryResponse, ApiError>(summaryKey(days), fetcher, SWR_OPTIONS);
  return { summary: data?.days, error, isLoading };
}
