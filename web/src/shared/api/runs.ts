'use client';

import useSWR from 'swr';
import { SWR_OPTIONS } from './client';

/**
 * 夜勤ビューア（night-shift build-viewer.py が生成・launchd 常駐サーバが配信）のポート。
 * cerebellum と同じホストで動くので、ホスト名は window.location から借りる
 * （PC=localhost / スマホ=MagicDNS 名のどちらで開いても同じコードで届く）。
 */
const VIEWER_PORT = '48310';

/** Tailscale Serve の path マウント（`tailscale serve --set-path /loop-reports`） */
const VIEWER_HTTPS_PATH = '/loop-reports';

/**
 * 夜勤ビューアのベース URL（docs/specs/13-web-nightshift.md §4）。
 * runs.json も動画 src も同じ base を使うので、ここ1箇所で解決する。
 */
export function viewerBase(): string {
  if (typeof window === 'undefined') return '';
  // https（Tailscale Serve 経由）のとき http://…:48310 を読むと混在コンテンツで
  // ブロックされ「Failed to fetch」になる（2026-07-28 実測）。同一オリジンの
  // path マウント経由で読む（CORS も不要になる）。
  if (window.location.protocol === 'https:') return VIEWER_HTTPS_PATH;
  return 'http://' + window.location.hostname + ':' + VIEWER_PORT;
}

/**
 * 夜勤ビューアの runs.json の1件（meta.json と同形。正本は build-viewer.py）。
 * cerebellum のサーバー API ではないので `types.ts`（03-api.md の手動同期先）には置かない。
 */
export interface Run {
  pj: string;
  run_id: string;
  /** `night-shift` | `manual`。**無記載の旧データは `night-shift` 扱い**（13 §2 / 19 §2） */
  source?: 'night-shift' | 'manual';
  passed: number;
  failed: number;
  blocked: number;
  human: number;
  pr_url: string | null;
  /** 検証動画のファイル名（`{href}media/` 配下）。旧形式の meta には無い */
  videos?: string[];
  artifact_missing?: number;
  href: string;
}

interface RunsResponse {
  runs: Run[];
}

const fetchRuns = async (url: string): Promise<RunsResponse> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error('夜勤ビューアに接続できません（HTTP ' + res.status + '）');
  return (await res.json()) as RunsResponse;
};

/**
 * 夜勤ビューアの run 一覧（新しい順。サーバー返却順のまま。docs/specs/19 §3.1）。
 * `enabled=false` のあいだは取得しない（対象日付が未解決のときなど）。
 */
export function useRuns(enabled = true) {
  const key = enabled && typeof window !== 'undefined' ? viewerBase() + '/runs.json' : null;
  const { data, error, isLoading } = useSWR<RunsResponse, Error>(key, fetchRuns, SWR_OPTIONS);
  return { runs: data?.runs, ready: data !== undefined, error, isLoading };
}

/** run の実効 source（無記載は `night-shift` 扱い。13 §2 / 19 §4） */
export function runSource(run: Run): 'night-shift' | 'manual' {
  return run.source ?? 'night-shift';
}
