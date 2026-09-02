---
status: confirmed
confirmed_rev: ef9531d
---

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
  detail_ref TEXT,                   -- 詳細ビューへの結び付け（NULL 可。§6 の語彙のみ）
  created_at TEXT NOT NULL,          -- ISO8601 オフセット付き
  updated_at TEXT NOT NULL
);

-- task_id 衝突の防止（§3 の材料が一致する行を2つ有効にしない）
CREATE UNIQUE INDEX routines_identity
  ON routines (interval, time, content) WHERE active = 1;

-- その日のスナップショット（過去日表示の正）
CREATE TABLE task_days (
  date       TEXT NOT NULL,        -- "YYYY-MM-DD"（ローカルタイム）
  task_id    TEXT NOT NULL,        -- §3
  interval   TEXT NOT NULL,        -- 間隔列の原文（例: "毎日", "土曜"）
  time       TEXT NOT NULL,        -- 時間列の原文（例: "7:30"。空文字あり）
  effort     TEXT NOT NULL,        -- 実施列の原文（例: "1時間"。空文字あり）
  tool       TEXT NOT NULL,        -- 確認ツール列の原文（例: "slack | obsidian"。空文字・"-" あり）
  content    TEXT NOT NULL,        -- 内容列（<br> は " / " に変換済み）
  sort_no    INTEGER NOT NULL,     -- スナップショット確定時の表示順（0起点）
  detail_ref TEXT,                 -- 確定時の routines.detail_ref のコピー（NULL 可。§6）
  PRIMARY KEY (date, task_id)
);

-- 朝のダイジェスト（second-brain の daily-digest が POST してくる。§6）
CREATE TABLE digests (
  date        TEXT PRIMARY KEY,    -- "YYYY-MM-DD"（ローカルタイム）
  body        TEXT NOT NULL,       -- 受信した原文（Slack mrkdwn）をそのまま保持
  received_at TEXT NOT NULL        -- ISO8601 オフセット付き
);

-- 学習セット（second-brain の night-study が生成した構造化 JSON）
CREATE TABLE learning_sets (
  date        TEXT PRIMARY KEY,    -- "YYYY-MM-DD"（ローカルタイム）
  raw         TEXT NOT NULL,       -- §14.3.1 のセット JSON をそのまま保持
  received_at TEXT NOT NULL        -- ISO8601 オフセット付き
);

-- 学習成績（自己採点と当日の感想）
CREATE TABLE learning_results (
  date         TEXT PRIMARY KEY,   -- 対応する learning_sets.date
  grades       TEXT NOT NULL,      -- §14.3.3 の grades 配列を JSON のまま保持
  feeling      TEXT NOT NULL,      -- 当日の感想（空文字可）
  completed_at TEXT NOT NULL       -- ISO8601 オフセット付き
);

-- ハーネス取り込み提案（second-brain の night-harness が生成。§17）
CREATE TABLE harness_proposals (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  date              TEXT NOT NULL, -- "YYYY-MM-DD"（ローカルタイム）
  kind              TEXT NOT NULL, -- daily | prune | model_switch
  slug              TEXT NOT NULL,
  insight_name      TEXT NOT NULL,
  verdict           TEXT NOT NULL, -- adopt | experiment | killed
  category          TEXT,
  summary           TEXT NOT NULL,
  challenge_verdict TEXT,          -- hold | weaken | refute
  challenge_note    TEXT,
  detail_path       TEXT,          -- Vault 相対パス（サーバーはアクセスしない）
  detail_md         TEXT NOT NULL,
  status            TEXT NOT NULL, -- proposed | approved | rejected | killed
  decided_at        TEXT,
  apply_state       TEXT NOT NULL, -- pending | applied | failed
  applied_at        TEXT,
  apply_error       TEXT,
  snapshot_path     TEXT,
  received_at       TEXT NOT NULL,
  UNIQUE(date, slug)
);

-- daily取り込み候補の受信日（0件受信も記録。§22）
CREATE TABLE intake_days (
  date        TEXT PRIMARY KEY,
  source_path TEXT NOT NULL, -- Vault 相対パス（サーバーはアクセスしない）
  source_note TEXT,
  item_count  INTEGER NOT NULL,
  received_at TEXT NOT NULL
);

-- daily取り込み候補と承認・適用状態（§22）
CREATE TABLE intake_candidates (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  date        TEXT NOT NULL,
  slug        TEXT NOT NULL,
  lane        TEXT NOT NULL, -- todo | thought | tone
  text        TEXT NOT NULL,
  note        TEXT,
  line_no     INTEGER,
  status      TEXT NOT NULL, -- proposed | approved | rejected
  decided_at  TEXT,
  apply_state TEXT NOT NULL, -- pending | applied | failed
  applied_at  TEXT,
  apply_error TEXT,
  result_path TEXT,
  result_url  TEXT,
  received_at TEXT NOT NULL,
  UNIQUE(date, slug)
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
| 3 | `digests` を追加、`routines.detail_ref` / `task_days.detail_ref` を追加（ダイジェスト取り込み。2026-07-27） |
| 4 | `learning_sets` / `learning_results` を追加（学習。[`14-learning.md`](./14-learning.md)。2026-07-29） |
| 5 | `harness_proposals` を追加（ハーネス承認。[`17-harness-approval.md`](./17-harness-approval.md)。2026-07-29） |
| 6 | `intake_days` / `intake_candidates` を追加（daily取り込み承認。[`22-daily-intake.md`](./22-daily-intake.md)。2026-08-29） |

- v3 の列追加は `ALTER TABLE ... ADD COLUMN`（既定 NULL）。**既存 `task_days` 行の値は書き換えない**（追加列が NULL のまま残るのは正常。過去日に詳細は無い）

- 既存 DB（user_version=1）にも適用できること。`routines` は空で作成され、中身は `cerebellum import-routines`（[`06-cli-serve.md`](./06-cli-serve.md) §3.1）で md から一度だけ流し込む
- DB ファイルの置き場所は [`06-cli-serve.md`](./06-cli-serve.md) §設定 を参照

## 6. detail_ref と詳細ビュー（確定・変更禁止）

タスク行から「その日の詳細」を開くための結び付け。

- `detail_ref` の語彙は**次の8つのみ**（これ以外は保存時に `bad_request`）:
  `digest.connection` ／ `digest.derive` ／ `digest.idea` ／ `digest.consolidate` ／ `nightshift.report` ／ `learning.session` ／ `harness.proposals` ／ `intake.candidates`
- `nightshift.report` はダイジェストではなく**夜勤詳細ビュー**（`/nightshift`・[`13-web-nightshift.md`](./13-web-nightshift.md)）への結び付け（2026-07-28 追加）。サーバーは語彙検証のみ行い、データは cerebellum を経由しない（表示側が夜勤ビューアの `runs.json` を直接読む）
- `learning.session` は**学習詳細ビュー**（`/learning`・[`15-web-learning.md`](./15-web-learning.md)）への結び付け。対応する学習セットと成績は `learning_sets` / `learning_results` に保存する（[`14-learning.md`](./14-learning.md)）
- `harness.proposals` は**ハーネス提案画面**（`/harness`・[`18-web-harness.md`](./18-web-harness.md)）への結び付け。対応する提案と承認・適用状態は `harness_proposals` に保存する（[`17-harness-approval.md`](./17-harness-approval.md)）
- `intake.candidates` は**あなた待ち画面**（`/waiting`・[`23-web-waiting.md`](./23-web-waiting.md)）への結び付け。対応する受信記録・候補・承認・適用状態は `intake_days` / `intake_candidates` に保存する（[`22-daily-intake.md`](./22-daily-intake.md)）
- スナップショット確定時に `routines.detail_ref` を `task_days.detail_ref` へコピーする。以後マスタ側を変えても過去日の結び付きは変わらない（§4 不変性と同じ理由）
- `digests.body` は**受信原文をそのまま保存**する。セクション分割・整形は表示時のパースで行い、保存時には行わない（[`11-digest.md`](./11-digest.md) §3）。フォーマットが変わっても再パースで救えるようにするため
- 同じ date への再 POST は**上書き**（`received_at` を更新）。ダイジェストは生成物であり、`task_days` のような不変記録ではない

## 7. エラー処理

- DB オープン・クエリ失敗は adapter エラー → usecase → API で 500（[`03-api.md`](./03-api.md)）
- health チェックは軽量クエリ（`SELECT 1`）で DB 可否を返す

## 8. スコープ外

- Phase 2 のテーブル（下書き・承認・digest）。追加は migration 版数を上げて行う
- チェック履歴の監査ログ（トグルは最新状態のみ保持）
- ルーティン編集の履歴・世代管理（`updated_at` の最新値のみ保持）
- 単発 TODO（`routines` は繰り返しタスクのマスタ。日付指定の単発は Phase 2）

## 9. 関連仕様

- 全体: [`00-overview.md`](./00-overview.md) ／ 構成: [`01-architecture.md`](./01-architecture.md)
- ダイジェストの取り込み・パース: [`11-digest.md`](./11-digest.md) ／ 表示: [`12-web-digest.md`](./12-web-digest.md)
- スナップショットを ensure する処理・マスタ CRUD: [`05-day-usecase.md`](./05-day-usecase.md)
- due 判定・ソート・task_id の材料（および初期 import のパース）: [`04-routine-parse.md`](./04-routine-parse.md)
- API への露出形: [`03-api.md`](./03-api.md)
