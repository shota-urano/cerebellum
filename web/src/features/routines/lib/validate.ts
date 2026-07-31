import type { DetailRef, RoutineInput } from '@/shared/api';

/**
 * 入力検証。規則の正本は `docs/specs/03-api.md` §3（サーバーと同一規則）。
 * ここでの検証はサーバーの検証を置き換えるものではなく、往復を1回減らすためのもの。
 */

/** 時刻は空文字、または `H:MM` / `HH:MM`（docs/specs/03-api.md §3） */
const TIME_PATTERN = /^\d{1,2}:\d{2}$/;

/** 間隔の候補（判定は部分一致なので自由入力も許す。docs/specs/04-routine-parse.md §3.2） */
export const INTERVAL_SUGGESTIONS = [
  '毎日',
  '平日',
  '週末',
  '月曜',
  '火曜',
  '水曜',
  '木曜',
  '金曜',
  '土曜',
  '日曜',
];

export type FieldName = keyof RoutineInput;
export type FieldErrors = Partial<Record<FieldName, string>>;

/** 各値を trim する（サーバーも trim して保存する。docs/specs/03-api.md §3） */
export function trimInput(input: RoutineInput): RoutineInput {
  return {
    interval: input.interval.trim(),
    time: input.time.trim(),
    effort: input.effort.trim(),
    tool: input.tool.trim(),
    content: input.content.trim(),
    detailRef: input.detailRef,
  };
}

/**
 * 詳細リンクの選択肢（docs/specs/02-data-model.md §6 の語彙）。
 * 空文字は「結び付けなし」——サーバー側で null に正規化される（docs/specs/03-api.md §3）。
 */
export const DETAIL_REF_OPTIONS: { value: DetailRef | ''; label: string }[] = [
  { value: '', label: 'なし' },
  { value: 'digest.connection', label: 'ダイジェスト: つながり' },
  { value: 'digest.derive', label: 'ダイジェスト: 導出' },
  { value: 'digest.idea', label: 'ダイジェスト: アイデア' },
  { value: 'digest.consolidate', label: 'ダイジェスト: consolidate' },
  { value: 'nightshift.report', label: '夜勤レポ（PR・検証動画）' },
  { value: 'learning.session', label: '学習セッション（レッスン・問題）' },
  // ハーネス承認の行は人間がこの画面から追加する（docs/specs/17-harness-approval.md §5）。
  // 選択肢が無いと「今日」→ /harness の導線を作る手段が UI に存在しなくなる
  { value: 'harness.proposals', label: 'ハーネス承認（取り込み提案）' },
];

/** trim 済みの入力を検証する。返り値が空オブジェクトなら送信してよい。 */
export function validate(input: RoutineInput): FieldErrors {
  const errors: FieldErrors = {};
  if (!input.interval) errors.interval = '間隔は必須です（例: 毎日）';
  if (!input.content) errors.content = '内容は必須です';
  if (input.time && !TIME_PATTERN.test(input.time)) errors.time = '時刻は H:MM 形式で入力してください（空でも可）';
  return errors;
}

export const EMPTY_INPUT: RoutineInput = {
  interval: '',
  time: '',
  effort: '',
  tool: '',
  content: '',
  detailRef: '',
};
