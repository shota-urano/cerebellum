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

PRAGMA user_version = 1;
