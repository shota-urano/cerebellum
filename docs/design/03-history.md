# 03. 「履歴」画面 デザイン仕様

**対応機能**: [`../specs/09-web-history.md`](../specs/09-web-history.md) ｜ **ソース種別**: コード（系統B）

## 素材

- `docs/design/reference/nextjs/app/history/page.tsx`（画面組み立て・日付 state）
- `docs/design/reference/nextjs/components/DateNav.tsx`（日付ナビ）
- `docs/design/reference/nextjs/components/WeekSummary.tsx`＋`SegmentBar.tsx`（7日サマリ）
- `docs/design/reference/nextjs/components/TaskList.tsx`・`TaskRow.tsx`・`CheckRing.tsx`・`EmptyState.tsx`（リスト・記録なし）
- `docs/design/reference/nextjs/lib/data.ts`（`snapshotFor`・`WEEK` の形）

実装者は必ず素材自体も読むこと。**依存は置き換え**（`useState` の表示日 → specs 09 の `/history?date=` クエリパラメータ、`snapshotFor`/`WEEK` → `/api/days/{date}`・`/api/summary?days=7`）、**レイアウト構造・スタイル値・文言は忠実に転写**。

## レイアウト構造（上から）

1. DateNav（パネル: 前日ボタン・日付・翌日ボタン）
2. 読み取り専用行（バッジ＋罫線＋進捗）
3. TaskList（読み取り専用・ヘッダ行なし）／ 記録なし時は EmptyState
4. WeekSummary（直近7日パネル）

## コンポーネント一覧

| 要素 | 文言（転記） | 状態・様式 |
|---|---|---|
| DateNav ボタン | `◀ 前日` / `翌日 ▶` | 44px・等幅・border 枠。hover: accent。disabled（未来方向）: 文字 `#2C4470`・opacity .55 |
| DateNav 日付 | `YYYY-MM-DD（曜）` | 等幅 15px |
| 読み取り専用バッジ | `読み取り専用` | アウトラインバッジ（10px・.16em・muted） |
| 進捗表示 | `{done} / {total}`（記録なし時 `— / —`） | 等幅・accent。バッジとの間は 1px 罫線で接続 |
| TaskRow（readonly） | 今日画面と同一様式 | `<div>`（button でない）・タップ不可。done 様式は同じ |
| EmptyState | `記録なし` | 破線 border・muted・中央寄せ |
| WeekSummary ラベル | `LAST 7 DAYS` | 等幅マイクロラベル |
| WeekSummary 行 | `{MM-DD}`（幅48px）・`{done}/{total}` または `記録なし`（幅62px・muted）・ミニセグメントバー | 日付昇順・行高44px・行全体がボタン。選択中: 淡い accent 背景＋inset 枠。記録なし日はバー全区画 void（opacity .5） |

## インタラクション（コードの事実）

- 前日/翌日タップで表示日を移動。**未来（今日より先）へは進めない**（翌日ボタン disabled）
- サマリ行タップでその日の表示へ移動（選択行がハイライト）
- 表示日が今日でも読み取り専用表示（プロトタイプの挙動）。**実装は specs 09 §3 を正とする**: 今日は readonly=false でトグル可

## 未定事項

- ロード中スケルトン（素材に無し。実装時に specs に従い作る）
- 不正 date クエリ（400）の表示（specs 09 §6「不正な日付＋今日へのリンク」。素材に無し——ErrorBanner/EmptyState の様式を流用して実装時に確定）
