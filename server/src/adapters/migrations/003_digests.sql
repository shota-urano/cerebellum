-- 朝ダイジェストの取り込みと、タスク行から詳細を開くための結び付け（2026-07-27）
-- docs/specs/02-data-model.md §2・§6

CREATE TABLE digests (
  date        TEXT PRIMARY KEY,    -- "YYYY-MM-DD"（ローカルタイム）
  body        TEXT NOT NULL,       -- 受信した原文（Slack mrkdwn）をそのまま保持
  received_at TEXT NOT NULL        -- ISO8601 オフセット付き
);

-- 既定 NULL で追加する。既存の task_days 行の値は書き換えない（過去日に詳細は無い）
ALTER TABLE routines  ADD COLUMN detail_ref TEXT;
ALTER TABLE task_days ADD COLUMN detail_ref TEXT;

PRAGMA user_version = 3;
