import type { LearningLane } from '@/shared/api';

/**
 * レーンの既定値（docs/specs/31-learning-lanes.md §3.1）。
 * クエリ省略＝本線。送信側の現行 `study-set` も lane なしで本線に書き続ける。
 */
export const DEFAULT_LEARNING_LANE: LearningLane = 'main';

const LEARNING_LANES: readonly LearningLane[] = ['main', 'en', 'liberal'];

/**
 * `?lane=` の読み取り（同 §3.4）。語彙は `main` | `en` | `liberal` の3値固定なので、
 * 未知の値・省略はどちらも本線に倒す——サーバへ語彙外を投げても `bad_request` に
 * なるだけで、画面から出来ることは無い（在庫＝レーン一覧を出さないため選び直させない）。
 */
export function parseLearningLane(value: string | null | undefined): LearningLane {
  return LEARNING_LANES.find((lane) => lane === value) ?? DEFAULT_LEARNING_LANE;
}

/**
 * 「今日」画面の LEARNING 段に出す行（docs/specs/31-learning-lanes.md §3.5）。
 *
 * **並びは `main` → `en` → `liberal` の固定順**（データの到着順・件数で並べ替えない。毎朝同じ位置に
 * 同じレーンがある状態にする）。**表示名は画面が持つ**——サーバが知っているのは
 * `main` / `en` / `liberal` だけで、`本線` / `英語` / `教養` はここにしか無い（同 §3.5）。
 *
 * `region` は行を囲む枠の読み上げ名。**`LEARNING` を名乗るのは本線行の1つだけ**にする
 * ——`LEARNING` の枠（docs/specs/25-web-inbox.md §3.1・docs/specs/30-web-today-order.md §3.1 が
 * 並びの基準に使う識別子）が2つに割れると、段そのものを掴む経路（支援技術・既存 E2E）から
 * 見て「LEARNING という段が複数ある」ことになる。段は1つ・行がレーンの数だけ、が本仕様の姿。
 */
export const LEARNING_LANE_ROWS: readonly { lane: LearningLane; name: string; region: string }[] = [
  { lane: 'main', name: '本線', region: 'LEARNING 本線' },
  { lane: 'en', name: '英語', region: '英語' },
  { lane: 'liberal', name: '教養', region: '教養' },
];

/**
 * LEARNING 段のタップ先（同 §3.5）。**本線はクエリを付けない**——`/learning` の
 * lane 省略時が `main` なので送っても同義で、付けないほうが既存の導線
 * （`detailRef = learning.session` のタスク行・docs/specs/15-web-learning.md §2）と URL が一致する。
 */
export function learningLanePath(lane: LearningLane): string {
  return lane === DEFAULT_LEARNING_LANE ? '/learning' : '/learning?lane=' + encodeURIComponent(lane);
}
