CREATE TABLE harness_proposals (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  date              TEXT NOT NULL,
  kind              TEXT NOT NULL,
  slug              TEXT NOT NULL,
  insight_name      TEXT NOT NULL,
  verdict           TEXT NOT NULL,
  category          TEXT,
  summary           TEXT NOT NULL,
  challenge_verdict TEXT,
  challenge_note    TEXT,
  detail_path       TEXT,
  detail_md         TEXT NOT NULL,
  status            TEXT NOT NULL,
  decided_at        TEXT,
  apply_state       TEXT NOT NULL,
  applied_at        TEXT,
  apply_error       TEXT,
  snapshot_path     TEXT,
  received_at       TEXT NOT NULL,
  UNIQUE(date, slug)
);

PRAGMA user_version = 5;
