'use client';

import useSWR from 'swr';
import { SWR_OPTIONS, viewerBase } from '@/shared/api';
import type { OfficeData } from '../lib/office';

/**
 * office.json の取得（docs/specs/20-web-office.md §2）。
 *
 * 配信元は夜勤ビューアと同じ :48310 の静的サーバなので、**接続規則（https のときは
 * 同一オリジンの path マウント `/loop-reports`）は `shared/api` の `viewerBase()` を流用する**
 * ——混在コンテンツで死ぬため独自実装しない（docs/specs/13-web-nightshift.md §4）。
 * cerebellum のサーバーは経由しない（API 追加ゼロ・§4）。
 */
const ERROR_MESSAGE = 'オフィスのデータに接続できません';

const fetchOffice = async (url: string): Promise<OfficeData> => {
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    // サーバ停止・非 tailnet。ErrorBanner で扱える形に寄せる（§6）
    throw new Error(ERROR_MESSAGE);
  }
  if (!res.ok) throw new Error(ERROR_MESSAGE + '（HTTP ' + res.status + '）');
  return (await res.json()) as OfficeData;
};

/**
 * `enabled=false` のあいだは取得しない（マウント前）。呼び出し側が
 * 「ビルド時の描画＝クライアント初回描画」を保つために使う（`OfficeView` のコメント参照）。
 */
export function useOffice(enabled = true) {
  // 静的 export のプリレンダリング時は取得しない（base の解決に window が必要）
  const key = !enabled || typeof window === 'undefined' ? null : viewerBase() + '/office.json';
  const { data, error, isLoading } = useSWR<OfficeData, Error>(key, fetchOffice, SWR_OPTIONS);
  return { office: data, ready: data !== undefined, error, isLoading };
}
