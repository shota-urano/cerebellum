'use client';

import useSWR from 'swr';
import { SWR_OPTIONS, fetcher, type ApiError, type DayResponse } from '@/shared/api';

/**
 * 「今日」の日付。端末時計ではなくサーバー由来（`GET /api/days/today` の `date`。
 * docs/specs/03 §3・`shared/lib/date.ts` の注記）。
 *
 * キーは day feature の `useDay('today')` と同一なので、date 省略時（=今日を表示）は
 * SWR が重複リクエストをまとめる。
 */
export function useToday() {
  const { data, error, isLoading } = useSWR<DayResponse, ApiError>('/api/days/today', fetcher, SWR_OPTIONS);
  return { today: data?.date, error, isLoading };
}
