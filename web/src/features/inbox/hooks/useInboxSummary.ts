'use client';

import useSWR from 'swr';
import { SWR_OPTIONS, fetcher, type ApiError, type InboxSummaryResponse } from '@/shared/api';

/** `GET /api/inbox/summary`（docs/specs/24-inbox.md §3.5・docs/specs/03-api.md §3） */
export const INBOX_SUMMARY_KEY = '/api/inbox/summary';

/**
 * 送信元ごとの最終受信と未決件数（docs/specs/24-inbox.md §3.5）。
 *
 * **未着判定の受信側の根拠**（docs/specs/25-web-inbox.md §3.3-2）。0件の受信も
 * `latestDate` として返るので、「項目が0件」と「今日は送られてこなかった」を
 * ここで区別できる。受信が1件も無い送信元は行ごと出ない（`sources: []`）。
 */
export function useInboxSummary() {
  const { data, error } = useSWR<InboxSummaryResponse, ApiError>(
    INBOX_SUMMARY_KEY,
    fetcher,
    SWR_OPTIONS,
  );
  return { summary: data, summaryError: error };
}
