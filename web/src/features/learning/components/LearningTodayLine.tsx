'use client';

import Link from 'next/link';
import { useLearningResult } from '../hooks/useLearningResult';
import { useLearningSet } from '../hooks/useLearningSet';
import { learningTodayState, learningTodayText } from '../lib/today';

export type LearningTodayLineProps = {
  /** `GET /api/learning/sets/{date}` の `{date}`。「今日」画面は既定の `today` で使う */
  date?: string;
};

/**
 * 「今日」第2段（LEARNING・docs/specs/25-web-inbox.md §3.1）。
 *
 * **状態1行と導線だけ**を持つ。学習セッション本体（docs/specs/15-web-learning.md）は
 * 変えない——第2段は「今日の学習が届いているか・解いたか」を毎朝ひと目で分かるようにする
 * だけで、解く場所は `/learning` のまま（同 §7 スコープ外）。
 *
 * 未着は異常様式（左辺 error 色）。届いていないのは night-study 側の失敗か休みで、
 * 画面から出来ることは無いが、**気づけないと復習の連鎖が黙って止まる**
 * （docs/specs/14-learning.md §3.4）。
 */
export function LearningTodayLine({ date = 'today' }: LearningTodayLineProps) {
  const { set, error: setError } = useLearningSet(date);
  const { result, resultError } = useLearningResult(date);

  const state = learningTodayState({ set, setError, result, resultError });
  const text = learningTodayText(state);

  return (
    <section className="panel lx__today" aria-label="LEARNING">
      <div className="mono list__head">
        <span>LEARNING</span>
        <span>今日の学習</span>
      </div>

      <Link
        className={'row row--tap lx__todayrow' + (state.kind === 'missing' ? ' lx__todayrow--bad' : '')}
        href="/learning"
      >
        <span className="row__body">
          {state.kind === 'loading' ? (
            <span className="skel" style={{ width: '38%' }} aria-busy="true">
              &nbsp;
            </span>
          ) : (
            <span className="mono row__text lx__todaystate">
              {state.kind === 'missing' && <span aria-hidden="true">⚠️ </span>}
              {text}
            </span>
          )}
        </span>
        <span className="row__chev" aria-hidden="true">
          ›
        </span>
      </Link>
    </section>
  );
}
