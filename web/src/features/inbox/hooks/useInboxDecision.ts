'use client';

import { useCallback, useRef, useState } from 'react';
import type { KeyedMutator } from 'swr';
import {
  ApiError,
  apiPost,
  type InboxDecisionInput,
  type InboxItemResponse,
  type InboxItemsResponse,
} from '@/shared/api';
import { withDecision, withItem } from '../lib/item';

/** `POST /api/inbox/items/{id}/decision`（docs/specs/03-api.md §3） */
function decisionKey(id: number) {
  return '/api/inbox/items/' + id + '/decision';
}

/** 失敗した decision。**同じ内容をそのまま再送する**ためにパラメータごと保持する。 */
type Failure = {
  id: number;
  decision: InboxDecisionInput;
  message: string;
};

/**
 * 決定の記録（docs/specs/25-web-inbox.md §3.2・§6）。
 *
 * optimistic update で即時反映し、POST が失敗したらロールバックして再検証する
 * （既存 `useToggleCheck`・ハーネス承認と同じ作法）。POST 自体は直列化する——同じ SWR キーへ
 * 複数の mutation を並行実行すると、後発開始後に完了した先発応答を SWR が破棄するため。
 *
 * 失敗は握りつぶさず `failure` として返し、画面はトーストで**再試行**を出す（§6）。
 * 巻き戻しただけで終わると、✅したつもりの行が次の勤務で適用されない事故になる。
 * 400（適用済み行への取り消し等）・404（他端末で置換された）も同じ経路で理由を出す。
 */
export function useInboxDecision(
  list: InboxItemsResponse | undefined,
  mutate: KeyedMutator<InboxItemsResponse>,
) {
  const [failure, setFailure] = useState<Failure | null>(null);
  const requestQueue = useRef<Promise<void>>(Promise.resolve());

  const decide = useCallback(
    async (id: number, decision: InboxDecisionInput) => {
      if (!list) return;
      setFailure(null);

      const send = () => apiPost<InboxItemResponse>(decisionKey(id), decision);
      const request = requestQueue.current.then(send, send);
      requestQueue.current = request.then(
        () => undefined,
        () => undefined,
      );

      try {
        await mutate(
          async (current) => {
            const { item } = await request;
            return withItem(current ?? list, item);
          },
          {
            // 連続タップ時は、前の optimistic 表示を含む最新表示へ次の変更を重ねる
            optimisticData: (committed, displayed) =>
              withDecision(displayed ?? committed ?? list, id, decision),
            rollbackOnError: true,
            populateCache: true,
            // POST が更新後の1件を返すので、成功時は追加の GET を投げない
            // （再取得すると `?status=open` から決着行が落ち、取り消し路が消える）
            revalidate: false,
          },
        );
      } catch (cause) {
        const error = cause instanceof ApiError ? cause : new ApiError(0, null, String(cause));
        setFailure({ id, decision, message: error.message });
        // 巻き戻した表示をサーバーの実状態に合わせ直す（404 の再検証もここ）
        void mutate();
      }
    },
    [list, mutate],
  );

  /** トーストの「再試行」。失敗した decision をそのまま再送する。 */
  const retry = useCallback(async () => {
    if (!failure) return;
    await decide(failure.id, failure.decision);
  }, [decide, failure]);

  const dismiss = useCallback(() => setFailure(null), []);

  return { decide, failure, retry, dismiss };
}
