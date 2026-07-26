# 日次ルーティン消し込みダッシュボード（Next.js 版）

HTML プロトタイプ `Daily Routine HUD.dc.html` を Next.js (App Router / TypeScript) で再生成したもの。
依存は Next.js + React のみ。フォントは `next/font/google`（JetBrains Mono / Noto Sans JP）でセルフホストされる。

```bash
cd nextjs
npm install
npm run dev   # http://localhost:3000
```

## デザイントークン

`app/globals.css` の `:root` に集約。背景 `#050B1A` / 面 `#0D1B36` / 境界 `#16305E` / 本文 `#D7E9FF` /
補助 `#5F7AA6` / アクセント `#38E5FF` / エラー `#FF5C7A`、角丸 6px・4px、影なし（発光のみ）。
数字・時刻・進捗・日付は `.mono`（JetBrains Mono + `tabular-nums`）。
発光の強さは `lib/theme.ts` の `GLOW`（0〜2、既定 1）で一括調整。

## 画面 → コンポーネント/ファイル対応表

| 画面 | ファイル | 対応する要素／ロジック |
| --- | --- | --- |
| 共通シェル（中央寄せ・上部 HUD 行・下部タブ） | `app/layout.tsx`, `components/HudStatus.tsx`, `components/TabBar.tsx`, `app/globals.css` | max-width 440px の中央寄せ、`ROUTINE / DAILY` ステータス行、今日⇄履歴の固定タブ（`next/link` + `usePathname`） |
| 1. 今日（`/`） | `app/page.tsx` | 画面組み立て・完了数集計・エラー/空/全完了の出し分け（`VAULT_ERROR` フラグ） |
| 1. 今日 — ヘッダ計器盤 | `components/HeaderPanel.tsx`, `components/SegmentBar.tsx` | 日付「2026-07-26（日）」／進捗「4 / 13」／13区画セグメントバー／PROGRESS・REMAINING、コーナーブラケット |
| 1. 今日 — タスクリスト | `components/TaskList.tsx`, `components/TaskRow.tsx`, `components/CheckRing.tsx` | 1列・行高44px以上、行全体タップでトグル、完了はリング発光＋打ち消し線、時刻/ツール名は等幅・補助色（空や `-` は非表示） |
| 1. 今日 — 状態管理・永続化 | `lib/useTodayTasks.ts` | 即時トグル、当日分の完了 ID を localStorage に保存・復元 |
| 1. 今日 — 全完了表示 | `components/AllClear.tsx` | `ALL CLEAR` バナー（発光） |
| 1. 今日 — 空状態 | `components/EmptyState.tsx` | 「今日のタスクはありません」 |
| 1. 今日 — エラーバナー | `components/ErrorBanner.tsx` | エラー色の左ボーダー＋「Vault が読み取れません。同期完了後に自動で再試行します」 |
| 2. 履歴（`/history`） | `app/history/page.tsx` | 表示日 state、スナップショット取得、読み取り専用バッジ |
| 2. 履歴 — 日付ナビ | `components/DateNav.tsx`, `lib/date.ts` | 「◀ 前日」「翌日 ▶」＋中央に日付。`iso < TODAY` でのみ翌日を活性化（未来へ進めない） |
| 2. 履歴 — 読み取り専用リスト | `components/TaskList.tsx`（`onToggle` なし） | 今日画面と同形式の静的表示 |
| 2. 履歴 — 記録なし | `components/EmptyState.tsx` | 2026-07-22 は「記録なし」 |
| 2. 履歴 — 直近7日サマリ | `components/WeekSummary.tsx`, `components/SegmentBar.tsx` | 日付昇順に 日付・done/total・ミニセグメントバー。行タップでその日へ移動 |
| データ定義 | `lib/data.ts` | 今日の13件（完了4/未完了9）、直近7日サマリ、`snapshotFor()`、`metaOf()` |
| 日付ユーティリティ | `lib/date.ts` | `TODAY` 定数、`formatDate()`（曜日付き）、`shiftDate()`。すべて UTC 基準で TZ 非依存 |

## 実運用に差し替えるポイント

- `lib/date.ts` の `TODAY` を実日付に。
- `lib/data.ts` の `BASE_TASKS` / `WEEK` / `snapshotFor()` を Vault などの実データ取得に置換。
- `app/page.tsx` の `VAULT_ERROR` を取得結果のエラー状態に接続。
