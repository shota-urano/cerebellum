# 02. データモデル仕様（整合性アンカー）

**親**: [`00-overview.md`](./00-overview.md) ｜ **担当**: Backend ｜ **範囲**: SQLite スキーマ・task_id・スナップショット規約・migration

## 1. 目的

全工程が共有する永続データの形を1か所に固定する。スキーマをここ以外で二重定義しない。

## 2. スキーマ（SQLite）

```sql
-- その日のスナップショット（過去日表示の正）
CREATE TABLE task_days (
  date     TEXT NOT NULL,          -- "YYYY-MM-DD"（ローカルタイム）
  task_id  TEXT NOT NULL,          -- §3
  interval TEXT NOT NULL,          -- 間隔列の原文（例: "毎日", "土曜"）
  time     TEXT NOT NULL,          -- 時間列の原文（例: "7:30"。空文字あり）
  effort   TEXT NOT NULL,          -- 実施列の原文（例: "1時間"。空文字あり）
  tool     TEXT NOT NULL,          -- 確認ツール列の原文（例: "slack | obsidian"。空文字・"-" あり）
  content  TEXT NOT NULL,          -- 内容列（<br> は " / " に変換済み）
  sort_no  INTEGER NOT NULL,       -- スナップショット確定時の表示順（0起点）
  PRIMARY KEY (date, task_id)
);

-- 消し込み状態
CREATE TABLE task_checks (
  date       TEXT NOT NULL,
  task_id    TEXT NOT NULL,
  done       INTEGER NOT NULL,     -- 0/1
  checked_at TEXT NOT NULL,        -- ISO8601 オフセット付き（例: "2026-07-25T08:01:00+09:00"）
  PRIMARY KEY (date, task_id)
);
```

- `sort_no` は要件定義のラフ案に無い追加列：表示順（時刻順ソート結果）をスナップショット時に固定するため。過去日の表示順を後日のロジック変更から独立させる
- `task_checks` に行が無いタスクは未チェック扱い。トグルは UPSERT（`done` 反転・`checked_at` 更新）
- 外部キーは張らない（同一プロセス・単一ライターで十分）

## 3. task_id（確定・変更禁止）

```
task_id = hex(sha1("{間隔}|{時刻}|{内容}"))[0..12]   # 16進小文字・先頭12桁
```

- 入力は**パース後**の値（内容は `<br>`→` / ` 変換済み、各セル trim 済み）。実施・ツール列は含めない
- post.py／v0 と同一仕様。表の他列（実施・ツール）を編集しても ID は変わらない

## 4. スナップショット規約

- **確定タイミング**: `/api/days/today` 初回アクセス時に ensure（[`05-day-usecase.md`](./05-day-usecase.md)）。日次ジョブは持たない
- **冪等性**: その date に `task_days` の行が1件でも存在すれば何もしない。存在しない場合のみ、その日の due タスク一式を1トランザクションで INSERT
- **不変性**: 一度確定した `task_days` は更新・削除しない。正本の表を後日編集しても過去の記録は変わらない
- ensure されるのは**当日のみ**。過去日にスナップショットが無ければ「記録なし」（後から生成しない）

## 5. 接続・migration

- `Mutex<Connection>` で単一保持（プールなし）。起動時に `PRAGMA journal_mode=WAL`
- migration は埋め込み SQL を起動時に適用、`PRAGMA user_version` で版管理（初版 user_version=1）
- DB ファイルの置き場所は [`06-cli-serve.md`](./06-cli-serve.md) §設定 を参照

## 6. エラー処理

- DB オープン・クエリ失敗は adapter エラー → usecase → API で 500（[`03-api.md`](./03-api.md)）
- health チェックは軽量クエリ（`SELECT 1`）で DB 可否を返す

## 7. スコープ外

- Phase 2 のテーブル（下書き・承認・digest）。追加は migration 版数を上げて行う
- チェック履歴の監査ログ（トグルは最新状態のみ保持）

## 8. 関連仕様

- 全体: [`00-overview.md`](./00-overview.md) ／ 構成: [`01-architecture.md`](./01-architecture.md)
- スナップショットを ensure する処理: [`05-day-usecase.md`](./05-day-usecase.md)
- task_id の材料を作るパース: [`04-routine-parse.md`](./04-routine-parse.md)
- API への露出形: [`03-api.md`](./03-api.md)
