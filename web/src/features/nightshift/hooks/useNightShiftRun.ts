'use client';

import useSWR from 'swr';
import { SWR_OPTIONS } from '@/shared/api';

/**
 * 夜勤ビューア（night-shift build-viewer.py が生成・launchd 常駐サーバが配信）のポート。
 * cerebellum と同じホストで動くので、ホスト名は window.location から借りる
 * （PC=localhost / スマホ=MagicDNS 名のどちらで開いても同じコードで届く）。
 */
const VIEWER_PORT = '48310';

/** Tailscale Serve の path マウント（`tailscale serve --set-path /loop-reports`） */
const VIEWER_HTTPS_PATH = '/loop-reports';

export function viewerBase(): string {
  if (typeof window === 'undefined') return '';
  // https（Tailscale Serve 経由）のとき http://…:48310 を読むと混在コンテンツで
  // ブロックされ「Failed to fetch」になる（2026-07-28 実測）。同一オリジンの
  // path マウント経由で読む（CORS も不要になる）。
  if (window.location.protocol === 'https:') return VIEWER_HTTPS_PATH;
  return 'http://' + window.location.hostname + ':' + VIEWER_PORT;
}

/** 夜勤ビューアの runs.json の1件（meta.json と同形。正本は build-viewer.py） */
export interface NightShiftRun {
  pj: string;
  run_id: string;
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
  runs: NightShiftRun[];
}

const fetchRuns = async (url: string): Promise<RunsResponse> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error('夜勤ビューアに接続できません（HTTP ' + res.status + '）');
  return (await res.json()) as RunsResponse;
};

/**
 * その夜（date = `YYYY-MM-DD`）の run を1件返す。night-shift は毎晩1プロジェクトなので、
 * run_id（`YYYY-MM-DD-n`）が date で始まる最初の1件＝その夜の実行（一覧は新しい順）。
 * 他の夜・他プロジェクトは出さない（やってもいない PJ の情報はノイズ）。
 */
export function useNightShiftRun(date: string | undefined) {
  const key = date && typeof window !== 'undefined' ? viewerBase() + '/runs.json' : null;
  const { data, error, isLoading } = useSWR<RunsResponse, Error>(key, fetchRuns, SWR_OPTIONS);
  const run = date ? data?.runs.find((item) => item.run_id.startsWith(date)) : undefined;
  return { run, ready: data !== undefined, error, isLoading };
}
