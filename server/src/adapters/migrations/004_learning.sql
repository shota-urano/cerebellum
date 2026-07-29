CREATE TABLE learning_sets (
  date        TEXT PRIMARY KEY,
  raw         TEXT NOT NULL,
  received_at TEXT NOT NULL
);

CREATE TABLE learning_results (
  date         TEXT PRIMARY KEY,
  grades       TEXT NOT NULL,
  feeling      TEXT NOT NULL,
  completed_at TEXT NOT NULL
);

PRAGMA user_version = 4;
