import type { LearningLane } from '@/shared/api';

/**
 * レーンの既定値（docs/specs/31-learning-lanes.md §3.1）。
 * クエリ省略＝本線。送信側の現行 `study-set` も lane なしで本線に書き続ける。
 */
export const DEFAULT_LEARNING_LANE: LearningLane = 'main';

const LEARNING_LANES: readonly LearningLane[] = ['main', 'en'];

/**
 * `?lane=` の読み取り（同 §3.4）。語彙は `main` | `en` の2値固定なので、
 * 未知の値・省略はどちらも本線に倒す——サーバへ語彙外を投げても `bad_request` に
 * なるだけで、画面から出来ることは無い（在庫＝レーン一覧を出さないため選び直させない）。
 */
export function parseLearningLane(value: string | null | undefined): LearningLane {
  return LEARNING_LANES.find((lane) => lane === value) ?? DEFAULT_LEARNING_LANE;
}
