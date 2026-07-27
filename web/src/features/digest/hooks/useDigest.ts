'use client';

import useSWR from 'swr';
import { SWR_OPTIONS, fetcher, type ApiError, type DigestResponse } from '@/shared/api';

/** `GET /api/digests/{date}`（`{date}` は `today` または `YYYY-MM-DD`）。 */
export function digestKey(date: string) {
  return '/api/digests/' + encodeURIComponent(date);
}

/**
 * その日のダイジェスト（docs/specs/12-web-digest.md §3.2）。
 * 未受信の日もエラーではなく `sections: []` が返る（docs/specs/11-digest.md §3.3）。
 */
export function useDigest(date: string) {
  const { data, error, isLoading } = useSWR<DigestResponse, ApiError>(
    digestKey(date),
    fetcher,
    SWR_OPTIONS,
  );
  return { digest: data, error, isLoading };
}
