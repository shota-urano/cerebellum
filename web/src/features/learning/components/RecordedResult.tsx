'use client';

import type { LearningResultResponse } from '@/shared/api';
import { gradeMark } from '../lib/grade';

/**
 * result 送信済みの日に再訪したときの表示（docs/specs/15-web-learning.md §4）。
 * 記録済みの採点・感想を出し、「やり直す」で再度一本道へ入る（result は UPSERT＝上書き）。
 */
export function RecordedResult({
  theme,
  result,
  onRestart,
}: {
  theme: string;
  result: LearningResultResponse;
  onRestart: () => void;
}) {
  return (
    <section className="panel dg">
      <h2 className="mono dg__head">記録済み — {theme}</h2>
      <div className="mono dg__meta">記録 {result.completedAt.slice(11, 16)}</div>

      <ul className="lx__record">
        {result.grades.map((grade) => (
          <li className="lx__recrow" key={grade.no}>
            <span className="mono lx__recno">問題{grade.no}</span>
            <span className="mono lx__recmark">{gradeMark(grade.grade)}</span>
          </li>
        ))}
      </ul>

      <p className="dg__text lx__feeling">{result.feeling.trim() || '（感想なし）'}</p>

      <div className="dg__bar dg__bar--end">
        <button type="button" className="mono btn" onClick={onRestart}>
          やり直す
        </button>
      </div>
    </section>
  );
}
