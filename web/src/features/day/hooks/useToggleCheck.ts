'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import useSWR, { useSWRConfig, type KeyedMutator } from 'swr';
import { ApiError, apiPost, type DayResponse } from '@/shared/api';
import { toggleTaskDone } from '../lib/toggle';

/** `POST /api/days/today/checks/{taskId}`（当日のみ。docs/specs/03 §2） */
function checkKey(taskId: string) {
  return '/api/days/today/checks/' + encodeURIComponent(taskId);
}

/**
 * トグル失敗の置き場所（`scope` ごとに1つ）。**API のパスではなく feature 内のローカルキー**
 * （`/` 始まりにしないことで fetcher を持つキーと混ざらない）。
 *
 * これを置く理由: docs/specs/30-web-today-order.md §5 の分割で、トグルを撃つ `DayTasks` と
 * バナーを出す `DayHeader`（最上部）が兄弟になった。表示位置は割る前（`error ?? toggleError` を
 * 最上部に1枚）から変えないので、失敗の合図を兄弟へ渡す必要がある。
 *
 * `scope` は `DayHeader` / `DayTasks` の組が見ている日付（`today` または `YYYY-MM-DD`）。
 * **スロットを全画面共有にしない**——`digest` / `learning` / `nightshift` の `useToggleCheck` は
 * `scope` を渡さず hook 内の state に閉じるので、この値はこの組の外から読めない。
 */
function toggleErrorKey(scope: string) {
  return 'day:toggle-error:' + scope;
}

/**
 * 直近のトグル失敗（`DayHeader` が最上部のバナーに使う）。`scope` は `DayTasks` へ渡すものと
 * 同じ日付にする。
 *
 * fetcher を渡さない `useSWR` は取得を一切行わず、キャッシュを購読するだけの共有状態になる
 * （SWR は既存の依存・docs/specs/00-overview.md §4。context provider を app 層へ足さずに
 * feature の内側で解決できる）。書き込みは同じ `scope` の `useToggleCheck` だけが行う。
 */
export function useToggleError(scope: string) {
  const { data } = useSWR<ApiError | null>(toggleErrorKey(scope), null);
  return data ?? undefined;
}

/**
 * チェックのトグル（docs/specs/08 §3）。
 *
 * `mutate` の optimistic update で即時反映し、POST が失敗したらロールバックしたうえで
 * 再検証する（404 でサーバーと ID がずれていた場合に実状態へ戻すため。同 §6）。
 */
export function useToggleCheck(
  day: DayResponse | undefined,
  mutate: KeyedMutator<DayResponse>,
  /**
   * 合図を兄弟コンポーネントへ渡すためのスロット名（`DayTasks` が自分の `date` を渡す）。
   * **省略時は hook 内の state に閉じる**——1つのコンポーネントがトグルとバナーの両方を持つ
   * 画面（`digest` / `learning` / `nightshift`）は共有スロットを要らないので作らない。
   */
  scope?: string,
) {
  const { mutate: mutateCache } = useSWRConfig();
  const [localError, setLocalError] = useState<ApiError | null>(null);
  // scope 無しのときは falsy キーになるので購読も起きない（SWR の仕様）
  const sharedError = useToggleError(scope ?? '');
  const error = scope ? sharedError : localError;
  const requestQueue = useRef<Promise<void>>(Promise.resolve());

  /**
   * マウント中かどうか。**アンマウント後の書き込みを止めるため**に持つ
   * ——POST の応答は画面を離れた後に届きうる（`catch` は cleanup の後に走る）。
   * 共有スロットは画面をまたいで生き残るので、ここで止めないと離脱後に書いた失敗が
   * 次に同じ日を開いたとき最上部へ出る（割る前の component state には無かった挙動）。
   */
  const mounted = useRef(true);

  /** 合図の書き込み。`revalidate: false` なので取得は起きない（fetcher の無いキー） */
  const setError = useCallback(
    (next: ApiError | null) => {
      if (!mounted.current) return;
      if (scope) void mutateCache(toggleErrorKey(scope), next, { revalidate: false });
      else setLocalError(next);
    },
    [mutateCache, scope],
  );

  // 画面を離れたら「もう書かない」印を立て、共有スロットも空にする
  // （割る前は component state だったので離脱で消えていた。その寿命を保つ）
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (scope) void mutateCache(toggleErrorKey(scope), null, { revalidate: false });
    };
  }, [mutateCache, scope]);

  const toggle = useCallback(
    async (taskId: string) => {
      if (!day) return;
      setError(null);

      // 同じ SWR キーへ複数の mutation を並行実行すると、後発開始後に完了した先発応答は
      // SWR が競合として破棄する。POST 自体を直列化し、最後の応答が必ずサーバーの最終状態にする。
      const request = requestQueue.current.then(
        () => apiPost<DayResponse>(checkKey(taskId)),
        () => apiPost<DayResponse>(checkKey(taskId)),
      );
      requestQueue.current = request.then(
        () => undefined,
        () => undefined,
      );

      try {
        await mutate(request, {
          // 連続タップ時は、前の optimistic 表示を含む最新表示へ次の反転を重ねる。
          optimisticData: (committed, displayed) =>
            toggleTaskDone(displayed ?? committed ?? day, taskId),
          rollbackOnError: true,
          populateCache: true,
          // POST がその日の最新状態を返すので、成功時は追加の GET を投げない
          revalidate: false,
        });
      } catch (cause) {
        setError(cause instanceof ApiError ? cause : new ApiError(0, null, String(cause)));
        void mutate();
      }
    },
    [day, mutate, setError],
  );

  return { toggle, toggleError: error ?? null };
}
