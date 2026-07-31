'use client';

import useSWR from 'swr';
import {
  SWR_OPTIONS,
  fetcher,
  type ApiError,
  type HarnessFilteredProposalsResponse,
  type HarnessProposalsResponse,
} from '@/shared/api';

/**
 * `GET /api/harness/proposals?date={date}`（`{date}` は `today` または `YYYY-MM-DD`）。
 * 同一オリジンのこのアプリ自身の API を叩く（夜勤ビューアの外部オリジンとは別・docs/specs/18 §2）。
 */
export function harnessKey(date: string) {
  return '/api/harness/proposals?date=' + encodeURIComponent(date);
}

/** `GET /api/harness/proposals?applyState=failed`（docs/specs/03-api.md §3・日付問わず新しい順） */
export const HARNESS_FAILED_KEY = '/api/harness/proposals?applyState=failed';

/**
 * その日のハーネス取り込み提案（docs/specs/18-web-harness.md §2）。
 * 未着の日もエラーではなく `receivedAt: null`・`proposals: []` が返る
 * （docs/specs/17-harness-approval.md §3.5）。**空配列＝異常**なので画面側で描き分ける。
 */
export function useHarnessProposals(date: string) {
  const { data, error, isLoading, mutate } = useSWR<HarnessProposalsResponse, ApiError>(
    harnessKey(date),
    fetcher,
    SWR_OPTIONS,
  );
  return { list: data, error, isLoading, mutate };
}

/**
 * 未処理の適用失敗（docs/specs/18-web-harness.md §3.3・docs/specs/17 §3.4）。
 *
 * 当日一覧とは**別に**引く。失敗は日をまたいでも人間が気づくまで出し続ける必要があり、
 * `?date=` の一覧では前日以前の失敗が拾えないため。`failed → applied` へ書き戻されれば
 * この一覧から消え、画面の枠も自然に消える。
 *
 * **取得に失敗したら必ず画面へ知らせる**（`failedError` を返す）。この枠の存在理由は
 * 「Slack 廃止後、失敗が下に埋もれると気づけない」ことへの対策なので、取得自体が黙って
 * 落ちると見落としがそのまま起きる（同 §3.3・docs/specs/17-harness-approval.md §3.5 の
 * 「沈黙させない」原則）。ただし**当日分の表示は止めない**——同日分の失敗は当日一覧側から
 * 拾い直す（`splitByFailure`）ので、当日の承認作業は続けられる。
 */
export function useFailedProposals() {
  const { data, error } = useSWR<HarnessFilteredProposalsResponse, ApiError>(
    HARNESS_FAILED_KEY,
    fetcher,
    SWR_OPTIONS,
  );
  return { failed: data?.proposals ?? [], failedError: error };
}
