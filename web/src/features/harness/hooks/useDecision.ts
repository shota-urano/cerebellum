'use client';

import { useCallback, useRef, useState } from 'react';
import type { KeyedMutator } from 'swr';
import {
  ApiError,
  apiPost,
  type HarnessDecisionInput,
  type HarnessProposalResponse,
  type HarnessProposalsResponse,
} from '@/shared/api';
import { withProposal, withStatus } from '../lib/proposal';

/** `POST /api/harness/proposals/{id}/decision`（docs/specs/03-api.md §3） */
function decisionKey(id: number) {
  return '/api/harness/proposals/' + id + '/decision';
}

/** 失敗した decision。**同じ内容をそのまま再送する**ためにパラメータごと保持する。 */
type Failure = {
  id: number;
  status: HarnessDecisionInput['status'];
  message: string;
};

/**
 * 承認の記録（docs/specs/18-web-harness.md §3.2）。
 *
 * optimistic update で即時反映し、POST が失敗したらロールバックして再検証する
 * （既存 `useToggleCheck` と同じ作法。同 §3.2）。POST 自体は直列化する——同じ SWR キーへ
 * 複数の mutation を並行実行すると、後発開始後に完了した先発応答を SWR が破棄するため。
 *
 * 失敗は握りつぶさず `failure` として返し、画面はトーストで**再試行**を出す（同 §4）。
 * 巻き戻しただけで終わると、承認したつもりの提案が翌朝適用されない事故になる。
 */
export function useDecision(
  list: HarnessProposalsResponse | undefined,
  mutate: KeyedMutator<HarnessProposalsResponse>,
) {
  const [failure, setFailure] = useState<Failure | null>(null);
  const requestQueue = useRef<Promise<void>>(Promise.resolve());

  const decide = useCallback(
    async (id: number, status: HarnessDecisionInput['status']) => {
      if (!list) return;
      setFailure(null);

      const send = () => apiPost<HarnessProposalResponse>(decisionKey(id), { status });
      const request = requestQueue.current.then(send, send);
      requestQueue.current = request.then(
        () => undefined,
        () => undefined,
      );

      try {
        await mutate(
          async (current) => {
            const { proposal } = await request;
            return withProposal(current ?? list, proposal);
          },
          {
            // 連続タップ時は、前の optimistic 表示を含む最新表示へ次の変更を重ねる
            optimisticData: (committed, displayed) =>
              withStatus(displayed ?? committed ?? list, id, status),
            rollbackOnError: true,
            populateCache: true,
            // POST が更新後の1件を返すので、成功時は追加の GET を投げない
            revalidate: false,
          },
        );
      } catch (cause) {
        const error = cause instanceof ApiError ? cause : new ApiError(0, null, String(cause));
        setFailure({ id, status, message: error.message });
        // 巻き戻した表示をサーバーの実状態に合わせ直す
        void mutate();
      }
    },
    [list, mutate],
  );

  /** トーストの「再試行」。失敗した decision をそのまま再送し、成功したら実状態を取り直す。 */
  const retry = useCallback(async () => {
    if (!failure) return;
    await decide(failure.id, failure.status);
    await mutate();
  }, [decide, failure, mutate]);

  const dismiss = useCallback(() => setFailure(null), []);

  return { decide, failure, retry, dismiss };
}
