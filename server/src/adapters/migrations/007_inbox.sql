CREATE TABLE inbox_receipts (
  source      TEXT NOT NULL,
  date        TEXT NOT NULL,
  received_at TEXT NOT NULL,
  item_count  INTEGER NOT NULL,
  PRIMARY KEY (source, date)
);

CREATE TABLE inbox_items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  source       TEXT NOT NULL,
  date         TEXT NOT NULL,
  slug         TEXT NOT NULL,
  kind         TEXT NOT NULL,
  title        TEXT NOT NULL,
  body_md      TEXT,
  options_json TEXT,
  ref_path     TEXT,
  payload_json TEXT,
  expires_at   TEXT,
  status       TEXT NOT NULL,
  choice       TEXT,
  decided_at   TEXT,
  apply_state  TEXT NOT NULL,
  applied_at   TEXT,
  apply_error  TEXT,
  result_path  TEXT,
  result_url   TEXT,
  received_at  TEXT NOT NULL,
  UNIQUE(source, date, slug)
);

CREATE INDEX inbox_items_status_date
  ON inbox_items (status, date DESC, id DESC);

CREATE INDEX inbox_items_apply_state_date
  ON inbox_items (apply_state, date DESC, id DESC);

CREATE INDEX inbox_items_source_status_apply_state_date
  ON inbox_items (source, status, apply_state, date ASC, id ASC);

PRAGMA user_version = 7;
