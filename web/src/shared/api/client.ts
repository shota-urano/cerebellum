import type { SWRConfiguration } from 'swr';
import type { ApiErrorBody, ApiErrorCode } from './types';

/**
 * API 呼び出しの失敗。SWR の `error` としてそのまま渡る。
 *
 * - `code`: `docs/specs/03-api.md` §4 のエラーコード。
 *   サーバー由来のエラー本体を読めなかった場合（ネットワーク断・非 JSON 応答など）は `null`。
 * - `status`: HTTP ステータス。fetch 自体が失敗した場合は `0`。
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode | null;

  constructor(status: number, code: ApiErrorCode | null, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== 'object' || value === null) return false;
  const error = (value as { error?: unknown }).error;
  if (typeof error !== 'object' || error === null) return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  return typeof code === 'string' && typeof message === 'string';
}

/** ネットワーク断・オフラインなど、レスポンスを得られなかったときの表示用メッセージ。 */
const NETWORK_ERROR_MESSAGE = '通信できません。接続を確認してください';

async function toApiError(res: Response): Promise<ApiError> {
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = undefined;
  }
  if (isApiErrorBody(body)) {
    return new ApiError(res.status, body.error.code, body.error.message);
  }
  return new ApiError(res.status, null, `HTTP ${res.status}`);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { cache: 'no-store', ...init });
  } catch {
    // クラッシュさせず ErrorBanner で扱えるように、同じ型へ寄せる（07 §6）
    throw new ApiError(0, null, NETWORK_ERROR_MESSAGE);
  }
  if (!res.ok) throw await toApiError(res);
  return (await res.json()) as T;
}

/** SWR の fetcher。キーはそのまま同一オリジンのパス（例: `/api/days/today`）。 */
export function fetcher<T>(path: string): Promise<T> {
  return request<T>(path);
}

/**
 * 更新系の共通部。`body` を渡したときだけ JSON として送る
 * （チェックのトグルはボディを持たないため、Content-Type も付けない）。
 */
function mutateRequest<T>(path: string, method: string, body?: unknown): Promise<T> {
  const init: RequestInit =
    body === undefined
      ? { method }
      : { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
  return request<T>(path, init);
}

/** 更新系の POST（チェックのトグルはボディなし・ルーティン追加はボディあり）。 */
export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return mutateRequest<T>(path, 'POST', body);
}

/** 更新系の PUT（ルーティン更新。全項目を送る＝部分更新はしない。docs/specs/03 §3）。 */
export function apiPut<T>(path: string, body: unknown): Promise<T> {
  return mutateRequest<T>(path, 'PUT', body);
}

/** 更新系の DELETE（ルーティンの論理削除。200 で単体を返す。docs/specs/03 §3）。 */
export function apiDelete<T>(path: string): Promise<T> {
  return mutateRequest<T>(path, 'DELETE');
}

/**
 * SWR の共通オプション（docs/specs/07 §4）。
 * スマホでアプリに戻った瞬間に最新化するため `revalidateOnFocus` を明示する。
 */
export const SWR_OPTIONS: SWRConfiguration = {
  revalidateOnFocus: true,
};
