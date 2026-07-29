# cerebellum デザイン仕様 Overview

生成: 2026-07-26（design-writer） ｜ 素材: 系統B（Claude design → Next.js プロトタイプ）全画面採用
素材の正本: [`reference/nextjs/`](./reference/nextjs/)（対応表 [`reference/SCREENS.md`](./reference/SCREENS.md)）

## 画面一覧表（唯一の有効リスト。下流はこの表に載る画面だけを使う）

| # | 画面名 | 詳細仕様 | ソース種別 | 素材パス（ルート基準） | 対応spec | 未定の状態 |
|---|---|---|---|---|---|---|
| 01 | 共通シェル（HUD 行＋ドロワー） | [`01-shell.md`](./01-shell.md) | コード | docs/design/reference/nextjs/app/layout.tsx ・ docs/design/reference/nextjs/app/globals.css ・ docs/design/reference/nextjs/components/HudStatus.tsx （ナビは素材なし・実装が正: web/src/shared/ui/NavDrawer.tsx） | docs/specs/07-web-foundation.md ・ docs/specs/16-web-navigation.md | HUD 右の画面タグが digest / nightshift 未対応 |
| 02 | 今日（消し込み） | [`02-today.md`](./02-today.md) | コード | docs/design/reference/nextjs/app/page.tsx ・ docs/design/reference/nextjs/components/HeaderPanel.tsx ・ docs/design/reference/nextjs/components/SegmentBar.tsx ・ docs/design/reference/nextjs/components/TaskList.tsx ・ docs/design/reference/nextjs/components/TaskRow.tsx ・ docs/design/reference/nextjs/components/CheckRing.tsx ・ docs/design/reference/nextjs/components/AllClear.tsx ・ docs/design/reference/nextjs/components/EmptyState.tsx ・ docs/design/reference/nextjs/components/ErrorBanner.tsx ・ docs/design/reference/nextjs/lib/data.ts ・ docs/design/reference/nextjs/lib/theme.ts | docs/specs/08-web-today.md | ロード中スケルトン（素材に無し） |
| 03 | 履歴（読み取り専用＋サマリ） | [`03-history.md`](./03-history.md) | コード | docs/design/reference/nextjs/app/history/page.tsx ・ docs/design/reference/nextjs/components/DateNav.tsx ・ docs/design/reference/nextjs/components/WeekSummary.tsx ・ docs/design/reference/nextjs/components/TaskList.tsx ・ docs/design/reference/nextjs/components/TaskRow.tsx ・ docs/design/reference/nextjs/components/CheckRing.tsx ・ docs/design/reference/nextjs/components/EmptyState.tsx ・ docs/design/reference/nextjs/lib/data.ts ・ docs/design/reference/nextjs/lib/theme.ts | docs/specs/09-web-history.md | ロード中スケルトン（素材に無し） |
| 04 | ルーティン（マスタ編集） | 専用の詳細仕様なし（実装が正。docs/specs/10-web-routines.md が画面仕様） | 素材なし（新規画面） | 流用元: web/src/features/day/components/ ・ web/src/features/history/components/ ・ docs/design/system/01-tokens.md | docs/specs/10-web-routines.md | なし |

- 系統Bの扱い（全画面共通）: 参照コードは**移植元**。**依存とアーキテクチャは本体スタックへ置き換え**（フラット components/ → specs 07 の feature-based 構成、localStorage → API+SWR、`TODAY` 定数 → サーバー日付、履歴の useState → `/history?date=` クエリ）。ただし**レイアウト構造・スタイル値・文言は忠実に転写**する（見た目を再解釈・再構成しない。見た目の JSX・CSS はほぼそのまま持ち込んでよい）
- 不採用案（gpt-image 2枚）は `docs/design/candidates/a-image/` に残置（下流は読まない）

## デザイントークン（正本: [`system/01-tokens.md`](./system/01-tokens.md)）

トークン値は system/ が正本。プロトタイプ `app/globals.css` の `:root` は system と**完全一致**を確認済み（bg `#050B1A` / surface `#0D1B36` / border `#16305E` / text `#D7E9FF` / muted `#5F7AA6` / accent `#38E5FF` / error=danger `#FF5C7A` / radius 6px・4px）。実装は globals.css の CSS 変数名（`--bg` 等）をそのまま使ってよい。

プロトタイプが追加した補助値（globals.css / theme.ts 由来・事実）:

- リンク hover 色 `#8FF2FF`、ナビ無効文字色 `#2C4470`
- セグメント角丸 2px・高さ 6px（ヘッダ）/ 4px（サマリ）、チェックリング 22px（内点 9px）
- グロー一括係数 `GLOW`（`lib/theme.ts`。0〜2・既定1、`glowShadow(px, alpha)`）
- パルスアニメーション `pulse` 2.4s（HUD ドット）

**フォント（確定 2026-07-26）**: プロトタイプ採用で **JetBrains Mono（等幅）＋ Noto Sans JP（本文）**・`next/font/google` セルフホスト（system/01-tokens.md 更新済み）。コンテンツ幅は **1024px 上限・それ以下は画面幅追従**（2026-07-26 改訂。当初 440px 固定だったが実機 iPad で狭く、画面幅追従に変更。specs 07・system・デザイン素材 更新済み）。

## specs との対応・差分

- 今日画面 = specs 08、履歴画面 = specs 09、シェル = specs 07、ルーティン画面 = specs 10 に対応。**specs に無い画面は無い**
- ルーティン画面（04）だけはプロトタイプが無く、**既存2画面の実装とトークンから起こした**（2026-07-27 判断。docs/specs/10-web-routines.md §8）。判定の正はプロトタイプではなく既存実装との一貫性
- プロトタイプが specs に無い要素を追加している（採用として仕様化済み）: HUD ステータス行・~~下部タブバー~~（01。タブバーは 2026-07-29 に廃止し、ヘッダーのハンバーガー＋ドロワーへ移行。docs/specs/16-web-navigation.md）、ALL CLEAR バナー・TASKS リストヘッダ・PROGRESS/REMAINING 行（02）、サマリ行タップでその日へ移動（03）。specs 側への追記は要確認リスト参照
- ~~エラーバナー文言は「Vault が読み取れません。同期完了後に自動で再試行します」~~ → **廃止**（2026-07-27。マスタ SQLite 移管で 503 `vault_unavailable` が無くなったため。現在はサーバーの `message` をそのまま表示する。docs/specs/07-web-foundation.md §6）
