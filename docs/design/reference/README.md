# 日次ルーティン消し込みダッシュボード（UIプロトタイプ）

- 単一ファイル・依存なし（Google Fonts のみ）。常時ダーク、iPhone Safari 幅で最適・PC は中央寄せ（max-width 440px）。
- パレット: 背景 `#050B1A` / 面 `#0D1B36` / 境界 `#16305E` / 本文 `#D7E9FF` / 補助 `#5F7AA6` / アクセント `#38E5FF` / エラー `#FF5C7A`。数字・時刻・進捗は JetBrains Mono + `tabular-nums`、角丸 6px/4px、影なし（発光のみ）。

## 画面 → コンポーネント/ファイル対応表

| 画面 | 実装場所（ファイル） | 対応する要素／ロジック |
| --- | --- | --- |
| 共通シェル（中央寄せ・上部 HUD ステータス行・下部タブ） | `Daily Routine HUD.dc.html` template 冒頭・末尾 | ルート flex コンテナ、`ROUTINE / DAILY` 行、固定タブ（`goToday` / `goHistory`、`tabStyle()`） |
| 1. 今日 — ヘッダ計器盤 | template `<sc-if value="{{ isToday }}">` 内 ヘッダカード | `todayLabel` / `progressLabel`（4 / 13）/ `segs`（13区画・`segStyle()`）/ `pctLabel` / `remainLabel`、コーナーブラケット装飾 |
| 1. 今日 — タスクリスト | template `rows` の `<sc-for>` | `base`（完了4件＋未完了9件の実データ）、`rowVals()`（チェックリング・打ち消し線・等幅メタ、ツール空/`-` は非表示）、`toggle(i)` で即時トグル |
| 1. 今日 — 全完了表示 | `<sc-if value="{{ allDone }}">` | `ALL CLEAR` バナー（発光） |
| 1. 今日 — 空状態 | `<sc-if value="{{ isEmpty }}">` | 「今日のタスクはありません」。Tweaks の `emptyToday` で確認可 |
| 1. 今日 — エラーバナー | `<sc-if value="{{ showError }}">` | エラー色の左ボーダー＋「Vault が読み取れません。…」。Tweaks の `showErrorBanner` で表示 |
| 2. 履歴 — 日付ナビ | `<sc-if value="{{ isHistory }}">` 内 ナビ行 | `histLabel` / `onPrev` / `onNext`（`nextStyle` で当日以降を非活性化＝未来へ進めない） |
| 2. 履歴 — 読み取り専用リスト | 同 `histRows` の `<sc-for>` | `histTasks(iso)`（当日は今日の状態、過去日は done 件数から生成）、`rowVals(..., false)` でトグル不可 |
| 2. 履歴 — 記録なし | `<sc-if value="{{ histNoRecord }}">` | 2026-07-22 を選択すると「記録なし」 |
| 2. 履歴 — 直近7日サマリ | 同 `summary` の `<sc-for>` | `summaryData`（07-20〜07-26、日付昇順）＋ミニセグメントバー。行タップでその日へ移動 |

## Tweaks（プロトタイプ確認用）

- `showErrorBanner` — エラーバナーの表示
- `emptyToday` — 今日を空状態にする
- `glow` — 消し込み発光の強度（0〜2）
