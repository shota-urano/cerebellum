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
  | 'nightshift.report';

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
