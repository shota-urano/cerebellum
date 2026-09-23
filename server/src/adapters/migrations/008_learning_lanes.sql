CREATE TABLE learning_sets_v8 (
  date        TEXT NOT NULL,
  lane        TEXT NOT NULL,
  raw         TEXT NOT NULL,
  received_at TEXT NOT NULL,
  PRIMARY KEY (date, lane)
);

INSERT INTO learning_sets_v8 (date, lane, raw, received_at)
  SELECT date, 'main', raw, received_at FROM learning_sets;

DROP TABLE learning_sets;
ALTER TABLE learning_sets_v8 RENAME TO learning_sets;

CREATE TABLE learning_results_v8 (
  date         TEXT NOT NULL,
  lane         TEXT NOT NULL,
  grades       TEXT NOT NULL,
  feeling      TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  PRIMARY KEY (date, lane)
);

INSERT INTO learning_results_v8 (date, lane, grades, feeling, completed_at)
  SELECT date, 'main', grades, feeling, completed_at FROM learning_results;

DROP TABLE learning_results;
ALTER TABLE learning_results_v8 RENAME TO learning_results;

PRAGMA user_version = 8;
