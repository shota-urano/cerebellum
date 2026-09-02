CREATE TABLE intake_days (
  date        TEXT PRIMARY KEY,
  source_path TEXT NOT NULL,
  source_note TEXT,
  item_count  INTEGER NOT NULL,
  received_at TEXT NOT NULL
);

CREATE TABLE intake_candidates (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  date        TEXT NOT NULL,
  slug        TEXT NOT NULL,
  lane        TEXT NOT NULL,
  text        TEXT NOT NULL,
  note        TEXT,
  line_no     INTEGER,
  status      TEXT NOT NULL,
  decided_at  TEXT,
  apply_state TEXT NOT NULL,
  applied_at  TEXT,
  apply_error TEXT,
  result_path TEXT,
  result_url  TEXT,
  received_at TEXT NOT NULL,
  UNIQUE(date, slug)
);

PRAGMA user_version = 6;
