# 09. 「履歴」画面仕様（Frontend）

**親**: [`00-overview.md`](./00-overview.md) ｜ **担当**: Frontend ｜ **範囲**: `app/history/page.tsx`＋`features/history/`（F3 過去分閲覧・サマリ）

## 1. 目的

過去の日付を遡ってその日のタスクと消し込み状態（スナップショット）を読み取り専用で見る。直近の消化率も一覧する。

## 2. 入出力

- **入力**: `GET /api/days/{date}`（`useDay`・day feature 再利用）／`GET /api/summary?days=7`（`useSummary`）
- **出力**: なし（読み取り専用画面）

## 3. 処理詳細

- URL は `/history?date=2026-07-25` の**クエリパラメータ方式**。date 省略時は今日
- **DateNav**: 前日/翌日ボタン＋日付表示。翌日方向は今日まで（未来へは進めない）
- **タスク一覧**: `app/history/page.tsx` が day feature の `DayView` を readonly モードで合成（history feature が day を import しない。[`07-web-foundation.md`](./07-web-foundation.md) §3 の依存ルール）
  - `readonly: true` のときトグル UI を無効化し「読み取り専用」バッジを表示
  - `tasks` が空（スナップショット無し）: 「記録なし」表示
  - date が今日のときはトグル可（readonly=false が返る）
- **SummaryCard**: `/api/summary?days=7` の結果を日付昇順で表示（date・done/total・達成率）。レスポンスに無い日は「記録なし」として扱う（[`03-api.md`](./03-api.md) §3）

## 4. 設定値・確定値

- 過去日は読み取り専用（変更禁止・要件確定事項）
- サマリは直近7日固定（Phase 1。期間切替は実装しない）
- 日付ナビは前日/翌日方式（カレンダー UI は Phase 1 では実装しない。要件は「カレンダー or 日付ナビ」でありナビを採用）

## 5. インターフェース

day feature の公開 API（`DayView` readonly モード）を消費。API 契約は [`03-api.md`](./03-api.md)。

## 6. エラー処理

- 400（不正 date クエリ）: 「不正な日付」表示＋今日へのリンク
- 503 / fetch 失敗: ErrorBanner（[`07-web-foundation.md`](./07-web-foundation.md) §6）

## 7. スコープ外

- 過去日の消し込み変更
- カレンダーグリッド UI・月表示
- 7日を超えるサマリ・グラフ描画（メトリクス可視化は Phase 2）

## 8. 関連仕様

- 基盤: [`07-web-foundation.md`](./07-web-foundation.md) ／ 今日画面（DayView の正）: [`08-web-today.md`](./08-web-today.md)
- API: [`03-api.md`](./03-api.md) ／ サマリ集計: [`05-day-usecase.md`](./05-day-usecase.md)
