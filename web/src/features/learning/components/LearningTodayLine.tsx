'use client';

import Link from 'next/link';
import type { LearningLane } from '@/shared/api';
import { useLearningResult } from '../hooks/useLearningResult';
import { useLearningSet } from '../hooks/useLearningSet';
import { LEARNING_LANE_ROWS, learningLanePath } from '../lib/lane';
import { learningTodayState, learningTodayText } from '../lib/today';

export type LearningTodayLineProps = {
  /** `GET /api/learning/sets/{date}` の `{date}`。「今日」画面は既定の `today` で使う */
  date?: string;
};

/**
 * 「今日」の LEARNING 段（docs/specs/25-web-inbox.md §3.1・docs/specs/31-learning-lanes.md §3.5）。
 *
 * **レーンごとに1行**（`本線` → `英語` の固定順・最大2行）。学習が1日1セットから
 * 1日1レーン1セットに広がったので（31 §1）、段の行が2本になる。**段そのもの**
 * （枠・見出し・並びの位置・タップ先の作り）は変えない——変わるのは行の本数だけ。
 *
 * **状態1行と導線だけ**を持つのは従来どおり。学習セッション本体
 * （docs/specs/15-web-learning.md）は変えないし、レーンごとに別の画面・別の体験も作らない
 * （31 §3.4）。段の位置（計器盤 → WAITING → LEARNING → TASKS）は
 * docs/specs/30-web-today-order.md §3.1 のまま。
 */
export function LearningTodayLine({ date = 'today' }: LearningTodayLineProps) {
  return (
    <section className="panel lx__today">
      <div className="mono list__head">
        <span>LEARNING</span>
        <span>今日の学習</span>
      </div>

      {LEARNING_LANE_ROWS.map((row) => (
        <LearningLaneRow
          key={row.lane}
          date={date}
          lane={row.lane}
          name={row.name}
          region={row.region}
        />
      ))}
    </section>
  );
}

type LearningLaneRowProps = {
  date: string;
  lane: LearningLane;
  /** 行の頭に出すレーン名（`本線` / `英語`）。**表示名は画面が持つ**（31 §3.5） */
  name: string;
  /** 行を囲む枠の読み上げ名（`LEARNING` を名乗るのは本線行だけ・`lib/lane.ts` の注記） */
  region: string;
};

/**
 * 1レーンぶんの状態1行。
 *
 * 状態判定・文言・異常様式は**据え置き**（docs/specs/25-web-inbox.md §3.1。`未着` /
 * `未回答` / `済 ○x △y ×z` と「セットの 404 を先に見る」規則は `lib/today.ts` のまま）。
 * 取得も 404 の意味もレーンごとに独立する（31 §3.3）——本線が届いて英語が届いていない日は、
 * 英語の行だけが `未着` になる。
 *
 * 未着は異常様式（左辺 error 色）。届いていないのは night-study 側の失敗か休みで、画面から
 * 出来ることは無いが、**気づけないと復習の連鎖が黙って止まる**（docs/specs/14-learning.md §3.4）。
 * ただし**この未着を計器盤の赤点に含めない**（25 §3.1。赤点は `app/page.tsx` が WAITING の
 * 異常だけから計算する）——2行になっても変えない。常時点灯すると合図が死ぬ。
 */
function LearningLaneRow({ date, lane, name, region }: LearningLaneRowProps) {
  const { set, error: setError } = useLearningSet(date, lane);
  const { result, resultError } = useLearningResult(date, lane);

  const state = learningTodayState({ set, setError, result, resultError });
  const text = learningTodayText(state);

  return (
    <section className="lx__lane" aria-label={region}>
      <Link
        className={
          'row row--tap lx__todayrow' + (state.kind === 'missing' ? ' lx__todayrow--bad' : '')
        }
        href={learningLanePath(lane)}
      >
        <span className="row__body lx__todaybody">
          <span className="mono lx__todaylane">{name}</span>
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
