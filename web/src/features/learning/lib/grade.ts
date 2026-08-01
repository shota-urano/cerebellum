import type { LearningGrade, LearningProblemDto } from '@/shared/api';

/**
 * 自己採点の3択（docs/specs/03-api.md §3 の `o` | `d` | `x`）。
 * 並び順が画面のボタン順。記号は Vault の学習ログと同じ ○ △ ×。
 */
export const GRADE_CHOICES: { value: LearningGrade; mark: string; caption: string }[] = [
  { value: 'o', mark: '○', caption: 'できた' },
  { value: 'd', mark: '△', caption: '曖昧' },
  { value: 'x', mark: '×', caption: 'できず' },
];

export function gradeMark(grade: LearningGrade): string {
  return GRADE_CHOICES.find((choice) => choice.value === grade)?.mark ?? grade;
}

/** ボタンのアクセシブル名。E2E もこの名前で掴む（`問題1 の自己採点 ○（できた）`）。 */
export function gradeLabel(no: number, mark: string, caption: string): string {
  return '問題' + no + ' の自己採点 ' + mark + '（' + caption + '）';
}

/** 回答フォームのアクセシブル名（`問題1 の回答`）。E2E もこの名前で掴む。 */
export function answerLabel(no: number): string {
  return '問題' + no + ' の回答';
}

/** 自動採点の判定（docs/specs/15-web-learning.md §3.3）。未回答は × に「未回答」を添える */
export type AutoVerdict = { grade: LearningGrade; unanswered: boolean };

/**
 * 比較の共通前処理（同 §3.3）: NFKC 正規化（全角/半角）＋前後空白トリム＋大文字小文字無視。
 * NFKC を先に通すのは、全角空白（U+3000）を半角へ畳んでからトリムするため。
 */
function normalize(value: string): string {
  return value.normalize('NFKC').trim().toLowerCase();
}

/**
 * `number` の語彙は「整数・小数」だけ（docs/specs/03-api.md §3）。
 * `Number()` に素で渡すと `0x10`・`0b10`・`1e5`・`Infinity` といった JavaScript の
 * 数値リテラルまで通ってしまうので、受理範囲を先にこの形で絞る。
 */
const DECIMAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;

/** `number` 用。整数・小数として解釈できなければ null（同 §3.3 の「解釈不能は×」） */
function asNumber(value: string): number | null {
  const text = normalize(value);
  if (!DECIMAL.test(text)) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * 自動採点の対象か（同 §3.3）。`answerType` と `expected` が揃っている問題だけが対象で、
 * 無い問題（旧形式）は自己採点にフォールバックする。
 * `kind = "code"` も同じくフォールバックする——解く場所がターミナルで、画面は workdir を
 * 見せるだけなので回答フォームを持たない（docs/specs/14-learning.md §3.1・同 §3.2）。
 */
export function isAutoGraded(problem: LearningProblemDto): boolean {
  return problem.kind !== 'code' && problem.answerType !== null && problem.expected !== null;
}

/**
 * ユーザー入力と `expected` の比較（同 §3.3）。
 * `choice` は選択値と `expected` の完全一致、`number` は双方を数値として解釈して比較、
 * `text` は共通の正規化のうえで一致。未回答は ×。
 */
export function autoGrade(problem: LearningProblemDto, answer: string): AutoVerdict {
  if (answer.trim() === '') return { grade: 'x', unanswered: true };

  const expected = problem.expected ?? '';
  let correct: boolean;
  switch (problem.answerType) {
    case 'choice':
      correct = answer === expected;
      break;
    case 'number': {
      const given = asNumber(answer);
      const want = asNumber(expected);
      correct = given !== null && want !== null && given === want;
      break;
    }
    default:
      correct = normalize(answer) === normalize(expected);
  }
  return { grade: correct ? 'o' : 'x', unanswered: false };
}
