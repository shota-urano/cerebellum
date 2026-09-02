import type { ApiError, LearningGrade, LearningResultResponse, LearningSetResponse } from '@/shared/api';

/**
 * 「今日」第2段（LEARNING）の状態1行（docs/specs/25-web-inbox.md §3.1）。
 *
 * 状態は3つ——`未着` / `未回答` / `済 ○x △y ×z`。**判定は既存の取得経路だけで行う**
 * （`GET /api/learning/sets/{date}` と `.../result`・docs/specs/15-web-learning.md §2）。
 * 第2段のために API を足さない・学習セッション本体を変えない（同 §7 スコープ外）。
 *
 * I/O は持たない（取得は `hooks/`）。
 */

export type LearningTodayState =
  /** どちらかの取得がまだ終わっていない（0 や未着と混同させない） */
  | { kind: 'loading' }
  /** 404 以外の失敗。第2段だけ `取得できません` を出し、他段は描く（§6） */
  | { kind: 'error' }
  /** セットが届いていない（`GET /api/learning/sets/today` が 404）。異常様式で出す */
  | { kind: 'missing' }
  /** セットはあるが result 未記録（`.../result` が 404） */
  | { kind: 'unanswered' }
  /** result 記録済み。○△× の内訳を添える */
  | { kind: 'done'; o: number; d: number; x: number };

/** 404 は「まだ無い」という正常な答え（docs/specs/14-learning.md §6）。失敗として扱わない */
function isAbsent(error: ApiError | undefined): boolean {
  return error?.status === 404;
}

function isFailure(error: ApiError | undefined): boolean {
  return error !== undefined && !isAbsent(error);
}

function countGrades(result: LearningResultResponse): { o: number; d: number; x: number } {
  const count = (grade: LearningGrade) =>
    result.grades.filter((entry) => entry.grade === grade).length;
  return { o: count('o'), d: count('d'), x: count('x') };
}

/**
 * 3状態のどれかを決める（§3.1）。
 *
 * **セットの未着を最優先で見る**——セットが無い日は result も 404 になるので、
 * 後段の 404 を「未回答」と読むと未着が未回答に化ける（night-study が落ちた日に
 * 「解いていないだけ」に見えると、生成の失敗に永久に気づけない）。
 */
export function learningTodayState(input: {
  set?: LearningSetResponse;
  setError?: ApiError;
  result?: LearningResultResponse;
  resultError?: ApiError;
}): LearningTodayState {
  if (isAbsent(input.setError)) return { kind: 'missing' };
  if (isFailure(input.setError) || isFailure(input.resultError)) return { kind: 'error' };
  if (!input.set) return { kind: 'loading' };
  if (input.result) return { kind: 'done', ...countGrades(input.result) };
  if (isAbsent(input.resultError)) return { kind: 'unanswered' };
  return { kind: 'loading' };
}

/** 1行に出す文言（§3.1 の確定文言。`済` だけ ○△× の内訳を添える） */
export function learningTodayText(state: LearningTodayState): string {
  switch (state.kind) {
    case 'missing':
      return '未着';
    case 'unanswered':
      return '未回答';
    case 'done':
      return '済 ○' + state.o + ' △' + state.d + ' ×' + state.x;
    case 'error':
      return '取得できません';
    default:
      return '';
  }
}
