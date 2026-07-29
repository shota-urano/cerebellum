---
status: confirmed
confirmed_rev: b7d2f1e
---

# 10. 「ルーティン」画面仕様（マスタ編集）

**親**: [`00-overview.md`](./00-overview.md) ｜ **担当**: Frontend ｜ **範囲**: `app/routines/page.tsx`・`features/routines/`

## 1. 目的

ルーティン表の正本（SQLite `routines`）をブラウザから編集する画面。md を Obsidian で開かなくても、毎日の TODO の元をこのシステムだけで完結して管理できる状態にする（2026-07-27 の正本移管に伴う新設）。

## 2. 入出力

- **入力**: `GET /api/routines`（[`03-api.md`](./03-api.md) §2）
- **出力**: `POST /api/routines`・`PUT /api/routines/{id}`・`DELETE /api/routines/{id}`
- **経路**: `/routines`（当初タブバー3つ目 → 2026-07-29 ドロワー項目へ移行 [`16-web-navigation.md`](./16-web-navigation.md)）

## 3. 処理詳細

### 3.1 一覧

1. `useRoutines`（SWR・`GET /api/routines`）で `active=1` の行を `id` 昇順に表示
2. 1行に `interval` / `time` / `content` を出す。`effort`・`tool` は補助情報として控えめに（「今日」画面の `metaOf` 規則を踏襲 → [`08-web-today.md`](./08-web-today.md)）
3. 0件のときは空状態「ルーティンがありません」＋追加導線
4. 並び替え UI は**持たない**（表示順は API 返却順＝`id` 昇順のまま。時刻順ソートはその日のスナップショット側の規則であり、この画面には適用しない → [`04-routine-parse.md`](./04-routine-parse.md) §3.3）

### 3.2 追加・編集

1. 追加ボタン → フォーム（`interval` / `time` / `effort` / `tool` / `content` の5項目）
2. 行タップ → 同じフォームに現在値を入れて編集。保存は `PUT`（全項目送信・部分更新なし）
3. クライアント側検証は API と同一規則（[`03-api.md`](./03-api.md) §3）: `interval` 空不可・`content` 空不可・`time` は空または `H:MM`/`HH:MM`
4. `interval` は自由入力だが、`毎日` / `平日` / `週末` / `月`〜`日` を候補として提示する（判定は部分一致 → [`04-routine-parse.md`](./04-routine-parse.md) §3.2）
5. 保存成功で一覧を再検証（`mutate`）

### 3.3 削除

1. 行の削除操作 → 確認を挟んで `DELETE`（論理削除）
2. 削除済みは既定で表示しない（`includeInactive` は Phase 1 では UI から使わない）

### 3.4 当日反映されないことの明示（重要）

マスタの編集は**翌日以降のスナップショットから効く**（[`02-data-model.md`](./02-data-model.md) §4）。画面上部に常時「変更は明日の分から反映されます」を出し、保存直後にも同じ主旨を短く示す。ここを黙っていると「追加したのに今日出ない」を毎回踏む。

## 4. 設定値・確定値

- 経路 `/routines`・タブ表記「ルーティン」（タブは3つになる → [`01-shell.md`](../design/01-shell.md) の更新が必要）
- 表示順は API 返却順（`id` 昇順）。クライアントで再ソートしない
- 削除は論理削除のみ（物理削除の UI を作らない）

## 5. インターフェース

- API: [`03-api.md`](./03-api.md) §2・§3 ／ 型: `shared/api/types.ts`（手動同期）
- 構成規約（`app → features → shared`・barrel 経由）: [`07-web-foundation.md`](./07-web-foundation.md) §3
- 「今日」「履歴」の feature を import しない（feature 間 import 禁止。横断が要る場合は app 層で合成）

## 6. エラー処理

| 状況 | 表示 |
|---|---|
| 取得失敗・500 | `ErrorBanner`（`shared/ui`）。既に描画済みの一覧は保持 |
| 400 `bad_request` | フォーム内に該当項目のエラーを表示（画面遷移しない） |
| 409 `conflict` | 「同じ内容のルーティンが既にあります」をフォーム内に表示 |
| 404 `not_found` | 一覧を再検証して「削除済みです」を表示 |

## 7. スコープ外

- 並び替え・グルーピング・タグ
- 削除済みの復元 UI（DB 上は `active=0` で残る）
- 一括編集・md へのエクスポート
- 単発 TODO（Phase 2）

## 8. 関連仕様

- データ: [`02-data-model.md`](./02-data-model.md) §2 ／ API: [`03-api.md`](./03-api.md) ／ usecase: [`05-day-usecase.md`](./05-day-usecase.md) §3.4
- 基盤: [`07-web-foundation.md`](./07-web-foundation.md)
- 見た目: 専用のデザイン仕様・プロトタイプは**作らない**（2026-07-27 判断）。トークンは `docs/design/system/01-tokens.md`、様式は既存2画面（`docs/design/02-today.md`・`docs/design/03-history.md` と実装済みの `web/src/features/day/` ・ `web/src/features/history/`）から流用する。実装後に `docs/design/00-design-overview.md` の画面一覧と `docs/design/01-shell.md` のタブ記述（2→3）を追従更新する
