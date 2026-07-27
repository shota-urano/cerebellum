# 02. データモデル仕様（整合性アンカー）

**親**: [`00-overview.md`](./00-overview.md) ｜ **担当**: Backend ｜ **範囲**: SQLite スキーマ・task_id・スナップショット規約・migration

## 1. 目的

全工程が共有する永続データの形を1か所に固定する。スキーマをここ以外で二重定義しない。

## 2. スキーマ（SQLite）

```sql
-- ルーティン表マスタ（正本。2026-07-27 に Vault md から移管）
CREATE TABLE routines (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,  -- 行の同一性。編集しても変わらない
  interval   TEXT NOT NULL,          -- 間隔（例: "毎日", "平日", "土曜"）。空不可
  time       TEXT NOT NULL,          -- 時刻（"H:MM" / "HH:MM" または空文字）
  effort     TEXT NOT NULL,          -- 実施（例: "1時間"。空可）
  tool       TEXT NOT NULL,          -- 確認ツール（例: "slack | obsidian"。空・"-" 可）
  content    TEXT NOT NULL,          -- 内容。空不可
  active     INTEGER NOT NULL DEFAULT 1,  -- 0=削除済み（論理削除）
  created_at TEXT NOT NULL,          -- ISO8601 オフセット付き
  updated_at TEXT NOT NULL
);

-- task_id 衝突の防止（§3 の材料が一致する行を2つ有効にしない）
CREATE UNIQUE INDEX routines_identity
  ON routines (interval, time, content) WHERE active = 1;

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
- `routines.id` と `task_days.task_id` は**結び付けない**。スナップショットは確定時点の値のコピーであり、マスタを後から編集・削除しても過去日の記録は変わらない（§4 不変性）
- `routines` の削除は論理削除（`active=0`）。物理削除しないのは、誤操作の復元と「いつ表から外したか」を残すため
- `routines` の**行順（`id` 昇順）が md の出現順に相当**する。時刻なし行の並びはこの順を安定ソートで保つ（[`04-routine-parse.md`](./04-routine-parse.md) §3.3）

## 3. task_id（確定・変更禁止）

```
task_id = hex(sha1("{間隔}|{時刻}|{内容}"))[0..12]   # 16進小文字・先頭12桁
```

- 入力は `routines` の値（内容は import 時に `<br>`→` / ` 変換済み、各値 trim 済み）。実施・ツール列は含めない
- 算出のみで、列には持たない（スナップショット確定時に毎回計算する）
- **式は変更禁止**。理由は Slack 通知（post.py）との整合ではなく（2026-07-27 に Slack 側を停止）、既に `task_days` に確定済みの過去記録と ID を連続させるため。式を変えると同じタスクが履歴上で別タスクになる
- 表の他列（実施・ツール）を編集しても ID は変わらない。間隔・時刻・内容を編集すると ID は変わるが、過去日の記録は不変なので影響しない

## 4. スナップショット規約

- **確定タイミング**: `/api/days/today` 初回アクセス時に ensure（[`05-day-usecase.md`](./05-day-usecase.md)）。日次ジョブは持たない
- **材料**: `routines` の `active=1` の行（`id` 昇順）→ due 判定 → 時刻順ソート（[`04-routine-parse.md`](./04-routine-parse.md) §3.2・§3.3）
- **冪等性**: その date に `task_days` の行が1件でも存在すれば何もしない。存在しない場合のみ、その日の due タスク一式を1トランザクションで INSERT
- **不変性**: 一度確定した `task_days` は更新・削除しない。正本（`routines`）を後日編集しても過去の記録は変わらない
- ensure されるのは**当日のみ**。過去日にスナップショットが無ければ「記録なし」（後から生成しない）
- **当日分の扱い**: その日のスナップショット確定後にマスタを編集しても、**当日の一覧には反映されない**（翌日から）。確定済みの一日を編集で書き換えないための意図的な仕様

## 5. 接続・migration

- `Mutex<Connection>` で単一保持（プールなし）。起動時に `PRAGMA journal_mode=WAL`
- migration は埋め込み SQL を起動時に適用、`PRAGMA user_version` で版管理

| user_version | 内容 |
|---|---|
| 1 | 初版（`task_days` / `task_checks`） |
| 2 | `routines` と `routines_identity` を追加（マスタの SQLite 移管。2026-07-27） |

- 既存 DB（user_version=1）にも適用できること。`routines` は空で作成され、中身は `cerebellum import-routines`（[`06-cli-serve.md`](./06-cli-serve.md) §3.1）で md から一度だけ流し込む
- DB ファイルの置き場所は [`06-cli-serve.md`](./06-cli-serve.md) §設定 を参照

## 6. エラー処理

- DB オープン・クエリ失敗は adapter エラー → usecase → API で 500（[`03-api.md`](./03-api.md)）
- health チェックは軽量クエリ（`SELECT 1`）で DB 可否を返す

## 7. スコープ外

- Phase 2 のテーブル（下書き・承認・digest）。追加は migration 版数を上げて行う
- チェック履歴の監査ログ（トグルは最新状態のみ保持）
- ルーティン編集の履歴・世代管理（`updated_at` の最新値のみ保持）
- 単発 TODO（`routines` は繰り返しタスクのマスタ。日付指定の単発は Phase 2）

## 8. 関連仕様

- 全体: [`00-overview.md`](./00-overview.md) ／ 構成: [`01-architecture.md`](./01-architecture.md)
- スナップショットを ensure する処理・マスタ CRUD: [`05-day-usecase.md`](./05-day-usecase.md)
- due 判定・ソート・task_id の材料（および初期 import のパース）: [`04-routine-parse.md`](./04-routine-parse.md)
- API への露出形: [`03-api.md`](./03-api.md)
