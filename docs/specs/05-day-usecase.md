# 05. 日取得・消し込み・サマリ仕様（usecase）

**親**: [`00-overview.md`](./00-overview.md) ｜ **担当**: Backend ｜ **範囲**: `usecase/get_day.rs`・`usecase/toggle_check.rs`・`usecase/get_summary.rs`・`usecase/ports.rs`

## 1. 目的

Phase 1 の全ビジネスルール（スナップショット確定・当日のみ書き込み可・サマリ集計）をポート越しの純アプリケーションロジックとして実装する。ルールはこの層に置き、API 層に漏らさない。

## 2. 入出力

- **入力**: date 文字列（`"today"` または `%Y-%m-%d`）／taskId／days（サマリ日数）
- **出力**: [`03-api.md`](./03-api.md) の DTO に対応するアプリ内モデル（DaySnapshot・Summary）
- **依存ポート**: `VaultReader`（md 全文取得）・`TaskRepository`（[`02-data-model.md`](./02-data-model.md) への読み書き）・`Clock`（現在時刻）

## 3. 処理詳細

### 3.1 get_day(date)

1. `Clock` から今日の日付を得る。`date == "today"` は今日に解決。`%Y-%m-%d` 形式でなければ `bad_request`
2. **date == 今日 のとき**: スナップショット ensure（冪等）
   - `TaskRepository` に該当 date の `task_days` 行が存在すれば何もしない
   - 無ければ `VaultReader` で md 全文を取得 → パース＋due 判定＋ソート（[`04-routine-parse.md`](./04-routine-parse.md)）→ `sort_no` を振って1トランザクションで INSERT
   - Vault 読み取り不能なら `vault_unavailable`（スナップショットは作らない）
3. `task_days`＋`task_checks` を結合して返す。`readonly = (date != 今日)`
4. 過去日でスナップショットが無ければ空のスナップショット（tasks 0件・readonly）を返す（404 にしない）
5. 未来日の扱い: 過去日と同じ readonly 扱いとし、ensure しない（記録なし表示になる）

### 3.2 toggle_check(taskId)

1. 対象は常に今日（パスが `today` 固定）。API 層で過去日パスは存在しない設計だが、**ガードはこの層でも持つ**: 対象 date が今日でなければ `readonly_day`
2. get_day と同じ ensure を先に実行（未 ensure の日の初回操作がトグルでも成立するように）
3. taskId が今日の `task_days` に無ければ `not_found`
4. `task_checks` へ UPSERT: `done` を反転（行が無ければ `done=1` で作成）、`checked_at` に `Clock` の現在時刻（ISO8601 オフセット付き）
5. 更新後の DaySnapshot を返す（レスポンスは get_day と同形）

### 3.3 get_summary(days)

1. `days` は正整数（既定 7。上限 366、超過は `bad_request`）
2. 今日を含む直近 `days` 日の範囲で、`task_days` にスナップショットが存在する日ごとに `{date, done, total}` を返す（date 昇順）
3. `done` = その日の `task_checks.done=1` の件数、`total` = `task_days` の行数。記録なしの日は含めない

## 4. 設定値・確定値

- 日付境界は深夜0時・ローカルタイム（Asia/Tokyo）。日付書式 `%Y-%m-%d`（変更禁止）
- 過去日は読み取り専用（変更禁止）・スナップショットは当日のみ ensure・一度確定したら不変（[`02-data-model.md`](./02-data-model.md) §4）
- サマリ既定 7日

## 5. インターフェース

HTTP 露出は [`03-api.md`](./03-api.md) が正。この層は同期メソッド（`spawn_blocking` 経由で呼ばれる。[`01-architecture.md`](./01-architecture.md) §3）。

## 6. エラー処理

`UsecaseError` として `BadRequest / ReadonlyDay / NotFound / VaultUnavailable / Internal` を定義し、API 層が [`03-api.md`](./03-api.md) §4 の表へ機械的に写像する。

## 7. スコープ外

- チェックの取り消し履歴・監査（最新状態のみ）
- 日次バッチ・cron（ensure はアクセス駆動のみ）
- 単発 TODO の追加

## 8. 関連仕様

- 前工程: [`04-routine-parse.md`](./04-routine-parse.md)（パース・due）
- データ: [`02-data-model.md`](./02-data-model.md) ／ API: [`03-api.md`](./03-api.md)
- テスト（FakeClock・InMemoryRepo・冪等性/日付境界/過去日ガード）: [`01-architecture.md`](./01-architecture.md) §6
