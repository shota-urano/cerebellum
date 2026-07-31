/**
 * API DTO（camelCase）。
 *
 * 正本は `docs/specs/03-api.md` §3・§4。このファイルはそこからの**手動同期**であり、
 * 型の追加・変更は 03-api.md の更新とセットで行う（コード生成は導入しない）。
 * 意味・制約は 03-api.md を参照すること（ここでは再定義しない）。
 */

/** 03-api.md §3: `tasks[]` の要素 */
export interface TaskDto {
  id: string;
  time: string;
  effort: string;
  tool: string;
  content: string;
  done: boolean;
  checkedAt: string | null;
  /** 詳細ビューへの結び付け（02-data-model.md §6 の語彙）。無ければ null */
  detailRef: DetailRef | null;
}

/** 02-data-model.md §6: detail_ref の語彙。増やすときは 02・11・12 を同時に更新する */
export type DetailRef =
  | 'digest.connection'
  | 'digest.derive'
  | 'digest.idea'
  | 'digest.consolidate'
  | 'nightshift.report'
  | 'learning.session';

/** 03-api.md §3: `progress` */
export interface ProgressDto {
  done: number;
  total: number;
}

/**
 * 03-api.md §3: `GET /api/days/{date}` と
 * `POST /api/days/today/checks/{taskId}` のレスポンス
 */
export interface DayResponse {
  date: string;
  weekday: string;
  readonly: boolean;
  progress: ProgressDto;
  tasks: TaskDto[];
}

/** 03-api.md §3: `days[]` の要素 */
export interface SummaryDayDto {
  date: string;
  done: number;
  total: number;
}

/** 03-api.md §3: `GET /api/summary?days=7` */
export interface SummaryResponse {
  days: SummaryDayDto[];
}

/** 03-api.md §3: `routines[]` の要素（マスタ。`id` は数値で `TaskDto.id` とは別物） */
export interface RoutineDto {
  id: number;
  interval: string;
  time: string;
  effort: string;
  tool: string;
  content: string;
  active: boolean;
  detailRef: DetailRef | null;
  updatedAt: string;
}

/** 03-api.md §3: `GET /api/routines` */
export interface RoutinesResponse {
  routines: RoutineDto[];
}

/**
 * 03-api.md §3: `POST /api/routines`・`PUT /api/routines/{id}`・
 * `DELETE /api/routines/{id}` のレスポンス
 */
export interface RoutineResponse {
  routine: RoutineDto;
}

/** 03-api.md §3: `POST /api/routines`・`PUT /api/routines/{id}` のリクエストボディ */
export interface RoutineInput {
  interval: string;
  time: string;
  effort: string;
  tool: string;
  content: string;
  /** 空文字を送るとサーバー側で「結び付けなし」に正規化される */
  detailRef: DetailRef | '' | null;
}

/** 03-api.md §3: `GET /api/digests/{date}` の `blocks[]` の要素（11-digest.md §3.2） */
export interface DigestBlockDto {
  kind: 'lead' | 'chain' | 'bullet' | 'saved' | 'warning' | 'text';
  text: string;
  notePath: string | null;
}

/** 03-api.md §3: `sections[]` の要素 */
export interface DigestSectionDto {
  kind: 'connection' | 'derive' | 'idea' | 'consolidate' | 'preamble' | 'other';
  /** 見出し行の原文（preamble は null） */
  title: string | null;
  blocks: DigestBlockDto[];
}

/** 03-api.md §3: `GET /api/digests/{date}`。未受信の日は sections が空配列 */
export interface DigestResponse {
  date: string;
  receivedAt: string | null;
  sections: DigestSectionDto[];
}

/** 03-api.md §3: `problems[]` の要素（14-learning.md §3.1） */
export interface LearningProblemDto {
  no: number;
  kind: 'quiz' | 'code';
  questionMd: string;
  answerMd: string;
  /** code 問題の作業ディレクトリ。quiz は null */
  workdir: string | null;
}

/** 03-api.md §3: `GET /api/learning/sets/{date}`。未取り込みの日は 404 `not_found` */
export interface LearningSetResponse {
  date: string;
  receivedAt: string;
  theme: string;
  source: 'theme' | 'memo';
  lessonMd: string;
  problems: LearningProblemDto[];
  closingMd: string | null;
}

/** 03-api.md §3: 自己採点の値（`o`=○ / `d`=△ / `x`=×） */
export type LearningGrade = 'o' | 'd' | 'x';

/** 03-api.md §3: `grades[]` の要素 */
export interface LearningGradeDto {
  no: number;
  grade: LearningGrade;
}

/** 03-api.md §3: `POST /api/learning/sets/{date}/result` のリクエストボディ */
export interface LearningResultInput {
  grades: LearningGradeDto[];
  feeling: string;
}

/**
 * 03-api.md §3: `POST /api/learning/sets/{date}/result` と
 * `GET /api/learning/sets/{date}/result` のレスポンス。未記録の日は 404 `not_found`
 */
export interface LearningResultResponse {
  date: string;
  grades: LearningGradeDto[];
  feeling: string;
  completedAt: string;
}

/** 03-api.md §3: ハーネス提案の `kind`（毎朝の取り込み／月次の資産剪定／モデル乗り換え） */
export type HarnessKind = 'daily' | 'prune' | 'model_switch';

/** 03-api.md §3: ハーネス提案の `verdict` */
export type HarnessVerdict = 'adopt' | 'experiment' | 'killed';

/** 03-api.md §3: 敵対レビューの結論 `challengeVerdict` */
export type HarnessChallengeVerdict = 'hold' | 'weaken' | 'refute';

/** 03-api.md §3: ハーネス提案の `status`（人間の意思。`killed` は取り込み時に確定） */
export type HarnessStatus = 'proposed' | 'approved' | 'rejected' | 'killed';

/** 03-api.md §3: ハーネス提案の `applyState`（機械の結果） */
export type HarnessApplyState = 'pending' | 'applied' | 'failed';

/** 03-api.md §3: `proposals[]` の要素（GET / decision / apply-result で同じ形） */
export interface HarnessProposalDto {
  id: number;
  date: string;
  kind: HarnessKind;
  slug: string;
  insightName: string;
  verdict: HarnessVerdict;
  category: string | null;
  summary: string;
  challengeVerdict: HarnessChallengeVerdict | null;
  challengeNote: string | null;
  detailPath: string | null;
  detailMd: string;
  status: HarnessStatus;
  decidedAt: string | null;
  applyState: HarnessApplyState;
  appliedAt: string | null;
  error: string | null;
  snapshotPath: string | null;
}

/**
 * 03-api.md §3: `GET /api/harness/proposals?date={date}`。
 * 未着の日も 404 にならず `receivedAt: null`・`proposals: []` が返る（17 §3.5）
 */
export interface HarnessProposalsResponse {
  date: string;
  receivedAt: string | null;
  proposals: HarnessProposalDto[];
}

/**
 * 03-api.md §3: 日付で絞らない一覧の形（`?status=approved&applyState=pending` と
 * `?applyState=failed`）。`date`・`receivedAt` を持たない
 */
export interface HarnessFilteredProposalsResponse {
  proposals: HarnessProposalDto[];
}

/** 03-api.md §3: `POST /api/harness/proposals/{id}/decision` のレスポンス */
export interface HarnessProposalResponse {
  proposal: HarnessProposalDto;
}

/** 03-api.md §3: `POST /api/harness/proposals/{id}/decision` のリクエストボディ */
export interface HarnessDecisionInput {
  status: 'proposed' | 'approved' | 'rejected';
}

/** 03-api.md §3: health の各フィールド */
export type HealthStatus = 'ok' | 'ng';

/** 03-api.md §3: `GET /api/health` */
export interface HealthResponse {
  db: HealthStatus;
  routines: number;
  version: string;
}

/** 03-api.md §4: エラーレスポンスの `code` */
export type ApiErrorCode =
  | 'bad_request'
  | 'readonly_day'
  | 'not_found'
  | 'conflict'
  | 'internal';

/** 03-api.md §4: エラーレスポンスの本体 */
export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
  };
}
