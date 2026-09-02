'use client';

import { openTotal, useInboxSummary } from '@/features/inbox';
import { HudStatus } from '@/shared/ui';

/**
 * 全画面共通シェルの HUD 行（＝ハンバーガー＋ドロワー）に、ドロワーの未決バッジの件数を
 * 与えるだけの app 層の合成部品（docs/specs/25-web-inbox.md §3.5）。
 *
 * ドロワーは `shared/ui` にありナビゲーションだけを持つ（docs/specs/16-web-navigation.md §5）。
 * feature を import させないために、**件数の取得はここ（app 層）で行って数値だけを渡す**
 * ——「今日」画面が3段を合成しているのと同じ形（同 §5・AGENTS.md ルール5）。
 *
 * バッジは全画面のドロワーに出るので、取得もシェル（`layout.tsx`）の側で1回だけ行う。
 * 「今日」画面も同じ `useInboxSummary` を引くが、SWR のキーが同じなので通信は共有される。
 */
export function AppHud() {
  const { summary } = useInboxSummary();
  // 取得前・取得失敗は `undefined`（0 と書かない・§3.5）。バッジはそのとき出ない
  return <HudStatus waitingCount={openTotal(summary?.sources)} />;
}
