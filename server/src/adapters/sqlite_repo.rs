use std::{
    path::{Path, PathBuf},
    sync::{Mutex, MutexGuard},
};

use chrono::{DateTime, FixedOffset};
use rusqlite::{Connection, params};
use thiserror::Error;

use crate::domain::{
    day::SummaryDay,
    task::{CheckedTask, Task},
};
use crate::usecase::ports::{RepositoryError, TaskRepository};

const MIGRATION_V1: &str = include_str!("migrations/001_init.sql");
const LATEST_SCHEMA_VERSION: i64 = 1;

pub struct SqliteTaskRepository {
    connection: Mutex<Connection>,
}

impl SqliteTaskRepository {
    pub fn open(path: &Path) -> Result<Self, SqliteRepositoryError> {
        let connection = Connection::open(path).map_err(|source| SqliteRepositoryError::Open {
            path: path.to_path_buf(),
            source,
        })?;

        Self::from_connection(connection)
    }

    fn from_connection(mut connection: Connection) -> Result<Self, SqliteRepositoryError> {
        connection
            .pragma_update(None, "journal_mode", "WAL")
            .map_err(SqliteRepositoryError::Configure)?;
        Self::migrate(&mut connection)?;

        Ok(Self {
            connection: Mutex::new(connection),
        })
    }

    fn migrate(connection: &mut Connection) -> Result<(), SqliteRepositoryError> {
        let version: i64 = connection
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .map_err(SqliteRepositoryError::Migration)?;

        match version {
            0 => {
                let transaction = connection
                    .transaction()
                    .map_err(SqliteRepositoryError::Migration)?;
                transaction
                    .execute_batch(MIGRATION_V1)
                    .map_err(SqliteRepositoryError::Migration)?;
                transaction
                    .commit()
                    .map_err(SqliteRepositoryError::Migration)
            }
            LATEST_SCHEMA_VERSION => Ok(()),
            version => Err(SqliteRepositoryError::UnsupportedSchemaVersion(version)),
        }
    }

    fn connection(&self) -> Result<MutexGuard<'_, Connection>, SqliteRepositoryError> {
        self.connection
            .lock()
            .map_err(|_| SqliteRepositoryError::ConnectionLock)
    }

    fn check_connection(&self) -> Result<(), SqliteRepositoryError> {
        self.connection()?
            .query_row("SELECT 1", [], |_| Ok(()))
            .map_err(SqliteRepositoryError::Health)
    }

    fn has_snapshot(&self, date: &str) -> Result<bool, SqliteRepositoryError> {
        self.connection()?
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM task_days WHERE date = ?1)",
                [date],
                |row| row.get(0),
            )
            .map_err(SqliteRepositoryError::Query)
    }

    fn save_snapshot(&self, date: &str, tasks: &[Task]) -> Result<(), SqliteRepositoryError> {
        let mut connection = self.connection()?;
        let transaction = connection
            .transaction()
            .map_err(SqliteRepositoryError::Query)?;
        let exists = transaction
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM task_days WHERE date = ?1)",
                [date],
                |row| row.get::<_, bool>(0),
            )
            .map_err(SqliteRepositoryError::Query)?;

        if exists {
            return Ok(());
        }

        {
            let mut statement = transaction
                .prepare(
                    "INSERT INTO task_days (
                        date, task_id, interval, time, effort, tool, content, sort_no
                    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                )
                .map_err(SqliteRepositoryError::Query)?;

            for task in tasks {
                let sort_no = i64::try_from(task.sort_no)
                    .map_err(|_| SqliteRepositoryError::SortNumberOutOfRange(task.sort_no))?;
                statement
                    .execute(params![
                        date,
                        task.id,
                        task.interval,
                        task.time,
                        task.effort,
                        task.tool,
                        task.content,
                        sort_no
                    ])
                    .map_err(SqliteRepositoryError::Query)?;
            }
        }

        transaction.commit().map_err(SqliteRepositoryError::Query)
    }

    fn load_tasks(&self, date: &str) -> Result<Vec<CheckedTask>, SqliteRepositoryError> {
        let connection = self.connection()?;
        let mut statement = connection
            .prepare(
                "SELECT
                    d.task_id,
                    d.interval,
                    d.time,
                    d.effort,
                    d.tool,
                    d.content,
                    d.sort_no,
                    COALESCE(c.done, 0),
                    c.checked_at
                FROM task_days d
                LEFT JOIN task_checks c
                  ON c.date = d.date AND c.task_id = d.task_id
                WHERE d.date = ?1
                ORDER BY d.sort_no ASC",
            )
            .map_err(SqliteRepositoryError::Query)?;
        let rows = statement
            .query_map([date], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, i64>(6)?,
                    row.get::<_, bool>(7)?,
                    row.get::<_, Option<String>>(8)?,
                ))
            })
            .map_err(SqliteRepositoryError::Query)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(SqliteRepositoryError::Query)?;

        rows.into_iter()
            .map(
                |(id, interval, time, effort, tool, content, sort_no, done, checked_at)| {
                    let sort_no = usize::try_from(sort_no)
                        .map_err(|_| SqliteRepositoryError::InvalidStoredSortNumber(sort_no))?;
                    Ok(CheckedTask {
                        task: Task {
                            id,
                            interval,
                            time,
                            effort,
                            tool,
                            content,
                            sort_no,
                        },
                        done,
                        checked_at,
                    })
                },
            )
            .collect()
    }

    fn flip_check(
        &self,
        date: &str,
        task_id: &str,
        checked_at: DateTime<FixedOffset>,
    ) -> Result<(), SqliteRepositoryError> {
        self.connection()?
            .execute(
                "INSERT INTO task_checks (date, task_id, done, checked_at)
                 VALUES (?1, ?2, 1, ?3)
                 ON CONFLICT(date, task_id) DO UPDATE SET
                   done = CASE task_checks.done WHEN 1 THEN 0 ELSE 1 END,
                   checked_at = excluded.checked_at",
                params![date, task_id, checked_at.to_rfc3339()],
            )
            .map(|_| ())
            .map_err(SqliteRepositoryError::Query)
    }

    fn summarize(
        &self,
        start_date: &str,
        end_date: &str,
    ) -> Result<Vec<SummaryDay>, SqliteRepositoryError> {
        let connection = self.connection()?;
        let mut statement = connection
            .prepare(
                "SELECT
                    d.date,
                    SUM(CASE WHEN c.done = 1 THEN 1 ELSE 0 END),
                    COUNT(*)
                 FROM task_days d
                 LEFT JOIN task_checks c
                   ON c.date = d.date AND c.task_id = d.task_id
                 WHERE d.date BETWEEN ?1 AND ?2
                 GROUP BY d.date
                 ORDER BY d.date ASC",
            )
            .map_err(SqliteRepositoryError::Query)?;
        let rows = statement
            .query_map(params![start_date, end_date], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, i64>(2)?,
                ))
            })
            .map_err(SqliteRepositoryError::Query)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(SqliteRepositoryError::Query)?;

        rows.into_iter()
            .map(|(date, done, total)| {
                Ok(SummaryDay {
                    date,
                    done: usize::try_from(done)
                        .map_err(|_| SqliteRepositoryError::InvalidStoredCount(done))?,
                    total: usize::try_from(total)
                        .map_err(|_| SqliteRepositoryError::InvalidStoredCount(total))?,
                })
            })
            .collect()
    }
}

impl TaskRepository for SqliteTaskRepository {
    fn health_check(&self) -> Result<(), RepositoryError> {
        self.check_connection().map_err(RepositoryError::new)
    }

    fn snapshot_exists(&self, date: &str) -> Result<bool, RepositoryError> {
        self.has_snapshot(date).map_err(RepositoryError::new)
    }

    fn insert_snapshot(&self, date: &str, tasks: &[Task]) -> Result<(), RepositoryError> {
        self.save_snapshot(date, tasks)
            .map_err(RepositoryError::new)
    }

    fn get_tasks(&self, date: &str) -> Result<Vec<CheckedTask>, RepositoryError> {
        self.load_tasks(date).map_err(RepositoryError::new)
    }

    fn toggle_check(
        &self,
        date: &str,
        task_id: &str,
        checked_at: DateTime<FixedOffset>,
    ) -> Result<(), RepositoryError> {
        self.flip_check(date, task_id, checked_at)
            .map_err(RepositoryError::new)
    }

    fn get_summary(
        &self,
        start_date: &str,
        end_date: &str,
    ) -> Result<Vec<SummaryDay>, RepositoryError> {
        self.summarize(start_date, end_date)
            .map_err(RepositoryError::new)
    }
}

#[derive(Debug, Error)]
pub enum SqliteRepositoryError {
    #[error("failed to open SQLite database at {}", path.display())]
    Open {
        path: PathBuf,
        #[source]
        source: rusqlite::Error,
    },
    #[error("failed to configure SQLite connection")]
    Configure(#[source] rusqlite::Error),
    #[error("failed to migrate SQLite database")]
    Migration(#[source] rusqlite::Error),
    #[error("unsupported SQLite schema version {0}")]
    UnsupportedSchemaVersion(i64),
    #[error("SQLite connection lock is poisoned")]
    ConnectionLock,
    #[error("SQLite health check failed")]
    Health(#[source] rusqlite::Error),
    #[error("SQLite query failed")]
    Query(#[source] rusqlite::Error),
    #[error("task sort number {0} does not fit in SQLite INTEGER")]
    SortNumberOutOfRange(usize),
    #[error("stored task sort number {0} is invalid")]
    InvalidStoredSortNumber(i64),
    #[error("stored aggregate count {0} is invalid")]
    InvalidStoredCount(i64),
}

#[cfg(test)]
mod tests {
    use chrono::{DateTime, FixedOffset};
    use rusqlite::Connection;

    use super::SqliteTaskRepository;
    use crate::{
        domain::{
            day::SummaryDay,
            task::{CheckedTask, Task},
        },
        usecase::ports::TaskRepository,
    };

    fn repository() -> SqliteTaskRepository {
        SqliteTaskRepository::from_connection(
            Connection::open_in_memory().expect("in-memory SQLite should open"),
        )
        .expect("in-memory repository should initialize")
    }

    fn task(id: &str, content: &str, sort_no: usize) -> Task {
        Task {
            id: id.to_owned(),
            interval: "毎日".to_owned(),
            time: format!("{}:00", sort_no + 7),
            effort: String::new(),
            tool: "slack".to_owned(),
            content: content.to_owned(),
            sort_no,
        }
    }

    fn checked_at(value: &str) -> DateTime<FixedOffset> {
        DateTime::parse_from_rfc3339(value).expect("test timestamp should be RFC 3339")
    }

    #[test]
    fn migrates_schema_to_version_one_on_startup() {
        let repository = repository();
        let connection = repository
            .connection()
            .expect("repository connection should lock");
        let version: i64 = connection
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .expect("schema version should be readable");
        let tables: Vec<String> = {
            let mut statement = connection
                .prepare(
                    "SELECT name
                     FROM sqlite_master
                     WHERE type = 'table' AND name IN ('task_days', 'task_checks')
                     ORDER BY name",
                )
                .expect("schema query should prepare");
            statement
                .query_map([], |row| row.get(0))
                .expect("schema query should execute")
                .collect::<Result<_, _>>()
                .expect("schema rows should decode")
        };

        assert_eq!(version, 1);
        assert_eq!(tables, vec!["task_checks", "task_days"]);
    }

    #[test]
    fn inserts_snapshot_atomically_and_keeps_first_snapshot() {
        let repository = repository();
        let duplicate = task("duplicate", "重複", 1);

        assert!(
            repository
                .insert_snapshot(
                    "2026-07-24",
                    &[task("first", "先頭", 0), duplicate.clone(), duplicate]
                )
                .is_err()
        );
        assert!(
            !repository
                .snapshot_exists("2026-07-24")
                .expect("snapshot lookup should succeed")
        );

        repository
            .insert_snapshot(
                "2026-07-25",
                &[task("later", "後", 1), task("first", "先", 0)],
            )
            .expect("first snapshot insert should succeed");
        repository
            .insert_snapshot("2026-07-25", &[task("replacement", "置換不可", 0)])
            .expect("repeated snapshot insert should be a no-op");

        assert!(
            repository
                .snapshot_exists("2026-07-25")
                .expect("snapshot lookup should succeed")
        );
        assert_eq!(
            repository
                .get_tasks("2026-07-25")
                .expect("snapshot should load"),
            vec![
                CheckedTask {
                    task: task("first", "先", 0),
                    done: false,
                    checked_at: None,
                },
                CheckedTask {
                    task: task("later", "後", 1),
                    done: false,
                    checked_at: None,
                },
            ]
        );
    }

    #[test]
    fn upsert_flips_done_and_updates_checked_at() {
        let repository = repository();
        repository
            .insert_snapshot("2026-07-25", &[task("task-1", "確認", 0)])
            .expect("snapshot insert should succeed");

        repository
            .toggle_check(
                "2026-07-25",
                "task-1",
                checked_at("2026-07-25T08:01:00+09:00"),
            )
            .expect("first toggle should succeed");
        let checked = repository
            .get_tasks("2026-07-25")
            .expect("checked snapshot should load");
        assert!(checked[0].done);
        assert_eq!(
            checked[0].checked_at.as_deref(),
            Some("2026-07-25T08:01:00+09:00")
        );

        repository
            .toggle_check(
                "2026-07-25",
                "task-1",
                checked_at("2026-07-25T08:02:00+09:00"),
            )
            .expect("second toggle should succeed");
        let unchecked = repository
            .get_tasks("2026-07-25")
            .expect("unchecked snapshot should load");
        assert!(!unchecked[0].done);
        assert_eq!(
            unchecked[0].checked_at.as_deref(),
            Some("2026-07-25T08:02:00+09:00")
        );
    }

    #[test]
    fn summarizes_only_snapshots_in_range_in_date_order() {
        let repository = repository();
        repository
            .insert_snapshot("2026-07-23", &[task("old", "範囲外", 0)])
            .expect("old snapshot insert should succeed");
        repository
            .insert_snapshot(
                "2026-07-24",
                &[task("task-a", "A", 0), task("task-b", "B", 1)],
            )
            .expect("first snapshot insert should succeed");
        repository
            .insert_snapshot("2026-07-25", &[task("task-c", "C", 0)])
            .expect("second snapshot insert should succeed");
        repository
            .toggle_check(
                "2026-07-24",
                "task-a",
                checked_at("2026-07-24T08:01:00+09:00"),
            )
            .expect("first task toggle should succeed");
        repository
            .toggle_check(
                "2026-07-24",
                "task-b",
                checked_at("2026-07-24T08:02:00+09:00"),
            )
            .expect("second task toggle should succeed");
        repository
            .toggle_check(
                "2026-07-24",
                "task-b",
                checked_at("2026-07-24T08:03:00+09:00"),
            )
            .expect("second task re-toggle should succeed");
        repository
            .toggle_check(
                "2026-07-25",
                "task-c",
                checked_at("2026-07-25T08:01:00+09:00"),
            )
            .expect("third task toggle should succeed");

        assert_eq!(
            repository
                .get_summary("2026-07-24", "2026-07-25")
                .expect("summary should load"),
            vec![
                SummaryDay {
                    date: "2026-07-24".to_owned(),
                    done: 1,
                    total: 2,
                },
                SummaryDay {
                    date: "2026-07-25".to_owned(),
                    done: 1,
                    total: 1,
                },
            ]
        );
    }
}
