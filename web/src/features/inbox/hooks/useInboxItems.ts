'use client';

import useSWR from 'swr';
import { SWR_OPTIONS, fetcher, type ApiError, type InboxItemsResponse } from '@/shared/api';

/**
 * `GET /api/inbox/items?status=open`（docs/specs/24-inbox.md §3.4・日付問わず新しい順）。
 *
 * **日付では引かない**。未決は業務日をまたいで残る（承認した翌回に適用されるのが正常動作）
 * ので、「あなた待ち」は状態だけで引く画面（docs/specs/25-web-inbox.md §3.2）。
 * `expiresAt` 超過はサーバー側で既定表示から外れる（同 §4）。
 */
export const INBOX_OPEN_KEY = '/api/inbox/items?status=open';

/** `GET /api/inbox/items?applyState=failed`（日付問わず新しい順・同 §3.4） */
export const INBOX_FAILED_KEY = '/api/inbox/items?applyState=failed';

/**
 * `GET /api/inbox/items?date=YYYY-MM-DD`（docs/specs/28-inbox-history.md §3.1）。
 * その業務日の項目を **`status` を問わず全件**・id 降順で返す（`expiresAt` 超過も含む）。
 * 他パラメータとの併用は 400 なので、この1本だけで組む（同 §3.1-4）。
 */
export function inboxDateKey(date: string) {
  return '/api/inbox/items?date=' + date;
}

/** 未決の人間待ち項目（受信ゼロでも 404 にならず `items: []` が返る・24 §6）。 */
export function useInboxItems() {
  const { data, error, isLoading, mutate } = useSWR<InboxItemsResponse, ApiError>(
    INBOX_OPEN_KEY,
    fetcher,
    SWR_OPTIONS,
  );
  return { list: data, error, isLoading, mutate };
}

/**
 * 適用に失敗した項目（docs/specs/25-web-inbox.md §3.2「失敗枠」）。
 *
 * 未決一覧とは**別に**引く。失敗行は `status = approved` / `chosen` なので
 * `?status=open` には決して現れず、日をまたいでも人間が気づくまで出し続ける必要がある。
 * `failed → applied` へ書き戻されればこの一覧から消え、画面の枠も自然に消える。
 *
 * **取得に失敗したら必ず画面へ知らせる**（`failedError` を返す）。この枠の存在理由は
 * 「失敗が埋もれると気づけない」ことへの対策なので、取得自体が黙って落ちると
 * 見落としがそのまま起きる（docs/specs/24-inbox.md §9 の「沈黙＝成功ではない」）。
 */
export function useFailedInboxItems() {
  const { data, error } = useSWR<InboxItemsResponse, ApiError>(
    INBOX_FAILED_KEY,
    fetcher,
    SWR_OPTIONS,
  );
  return { failed: data?.items ?? [], failedError: error };
}

/**
 * その業務日の項目（docs/specs/29-web-inbox-history.md §3.1-1・§5）。
 *
 * 「今日決めたもの」の出どころは **この取得結果**であって、決定 POST の応答を
 * `?status=open` のキャッシュへ差し込んだ残骸ではない（同 §1）。キャッシュ残骸で描くと
 * リロード・タブ復帰（`revalidateOnFocus`）のどちらでも決着行が落ち、
 * 「読んだ印を付けるだけ」のボタンが本文ごと視界から消す操作になる。
 *
 * `data` は `undefined` のままにして返す（`items: []` に丸めない）——取得できていない状態と
 * 「その日は0件」を画面が区別できないと、§6 の「下段だけ `取得できません`」を出せない。
 */
export function useInboxByDate(date: string) {
  const { data, error, isLoading, mutate } = useSWR<InboxItemsResponse, ApiError>(
    inboxDateKey(date),
    fetcher,
    SWR_OPTIONS,
  );
  return { dated: data, datedError: error, datedLoading: isLoading, mutateDated: mutate };
}
