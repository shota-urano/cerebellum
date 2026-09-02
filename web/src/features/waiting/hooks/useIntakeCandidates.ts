'use client';

import useSWR from 'swr';
import { SWR_OPTIONS, fetcher, type ApiError, type IntakeCandidatesResponse } from '@/shared/api';

/**
 * `GET /api/intake/candidates?status=proposed`（docs/specs/22-daily-intake.md §3.4）。
 *
 * **日付では引かない**。候補の `date` は元ノートの日付（＝実行日の前日）なので `date=today`
 * では常に空になる（同 §3.5）。「あなた待ち」は未決だけを日付問わず新しい順で出す画面。
 */
export const INTAKE_PROPOSED_KEY = '/api/intake/candidates?status=proposed';

/** `GET /api/intake/candidates?applyState=failed`（日付問わず新しい順・同 §3.4） */
export const INTAKE_FAILED_KEY = '/api/intake/candidates?applyState=failed';

/**
 * 未決の候補（docs/specs/23-web-waiting.md §2）。
 *
 * 受信が1件も無くても 404 にならず `items: []`・`latestReceivedAt: null` が返る
 * （docs/specs/22-daily-intake.md §3.5）。**空配列だけでは異常かどうか決まらない**ので、
 * 画面は `latest*` と併せて描き分ける（同 §3.5 の3状態）。
 */
export function useIntakeCandidates() {
  const { data, error, isLoading, mutate } = useSWR<IntakeCandidatesResponse, ApiError>(
    INTAKE_PROPOSED_KEY,
    fetcher,
    SWR_OPTIONS,
  );
  return { list: data, error, isLoading, mutate };
}

/**
 * 反映に失敗した候補（docs/specs/23-web-waiting.md §3.4）。
 *
 * 未決一覧とは**別に**引く。失敗行は `status = approved` なので `?status=proposed` には
 * 決して現れず、日をまたいでも人間が気づくまで出し続ける必要があるため。
 * `failed → applied` へ書き戻されればこの一覧から消え、画面の枠も自然に消える。
 *
 * **取得に失敗したら必ず画面へ知らせる**（`failedError` を返す）。この枠の存在理由は
 * 「失敗が埋もれると気づけない」ことへの対策なので、取得自体が黙って落ちると
 * 見落としがそのまま起きる（docs/specs/22-daily-intake.md §3.5 の「沈黙させない」原則）。
 */
export function useFailedCandidates() {
  const { data, error } = useSWR<IntakeCandidatesResponse, ApiError>(
    INTAKE_FAILED_KEY,
    fetcher,
    SWR_OPTIONS,
  );
  return { failed: data?.items ?? [], failedError: error };
}
