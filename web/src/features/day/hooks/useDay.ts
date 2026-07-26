'use client';

import useSWR from 'swr';
import { SWR_OPTIONS, fetcher, type ApiError, type DayResponse } from '@/shared/api';

/** `GET /api/days/{date}` のキー（`{date}` は `today` または `YYYY-MM-DD`）。 */
export function dayKey(date: string) {
  return '/api/days/' + encodeURIComponent(date);
}

/**
 * その日のタスク＋チェック状態（docs/specs/08 §2）。
 * 再検証中も直前の `day` を保持するので、503 のときも描画済みタスクは消えない（同 §6）。
 */
export function useDay(date: string) {
  const { data, error, isLoading, mutate } = useSWR<DayResponse, ApiError>(dayKey(date), fetcher, SWR_OPTIONS);
  return { day: data, error, isLoading, mutate };
}
