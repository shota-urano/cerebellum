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

PRAGMA user_version = 2;
