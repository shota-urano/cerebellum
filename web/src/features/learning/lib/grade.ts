import type { LearningGrade } from '@/shared/api';

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
