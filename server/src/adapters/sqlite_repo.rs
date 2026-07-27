use std::{
    path::{Path, PathBuf},
    sync::{Mutex, MutexGuard},
};

use chrono::{DateTime, FixedOffset};
use rusqlite::{Connection, OptionalExtension, Row, params};
use thiserror::Error;

use crate::domain::{
    day::SummaryDay,
    routine::{Routine, RoutineFields},
    task::{CheckedTask, Task},
};
use crate::usecase::ports::{
    DigestRepository, RepositoryError, RoutineImportRepository, RoutineImportRepositoryError,
    RoutineRepository, RoutineRepositoryError, StoredDigest, TaskRepository,
};

const MIGRATION_V1: &str = include_str!("migrations/001_init.sql");
const MIGRATION_V2: &str = include_str!("migrations/002_routines.sql");
const MIGRATION_V3: &str = include_str!("migrations/003_digests.sql");
const LATEST_SCHEMA_VERSION: i64 = 3;

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

        let migrations = match version {
            0 => &[MIGRATION_V1, MIGRATION_V2, MIGRATION_V3][..],
            1 => &[MIGRATION_V2, MIGRATION_V3][..],
            2 => &[MIGRATION_V3][..],
            LATEST_SCHEMA_VERSION => return Ok(()),
            version => return Err(SqliteRepositoryError::UnsupportedSchemaVersion(version)),
        };
        let transaction = connection
            .transaction()
            .map_err(SqliteRepositoryError::Migration)?;
        for migration in migrations {
            transaction
                .execute_batch(migration)
                .map_err(SqliteRepositoryError::Migration)?;
        }
        transaction
            .commit()
            .map_err(SqliteRepositoryError::Migration)
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
                        date, task_id, interval, time, effort, tool, content, sort_no, detail_ref
                    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
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
                        sort_no,
                        task.detail_ref
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
                    d.detail_ref,
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
                    row.get::<_, Option<String>>(7)?,
                    row.get::<_, bool>(8)?,
                    row.get::<_, Option<String>>(9)?,
                ))
            })
            .map_err(SqliteRepositoryError::Query)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(SqliteRepositoryError::Query)?;

        rows.into_iter()
            .map(
                |(
                    id,
                    interval,
                    time,
                    effort,
                    tool,
                    content,
                    sort_no,
                    detail_ref,
                    done,
                    checked_at,
                )| {
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
                            detail_ref,
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

    fn list_stored_routines(
        &self,
        include_inactive: bool,
    ) -> Result<Vec<Routine>, RoutineRepositoryError> {
        let connection = self
            .connection()
            .map_err(RoutineRepositoryError::internal)?;
        let sql = if include_inactive {
            "SELECT id, interval, time, effort, tool, content, active, detail_ref, created_at, updated_at
             FROM routines
             ORDER BY id ASC"
        } else {
            "SELECT id, interval, time, effort, tool, content, active, detail_ref, created_at, updated_at
             FROM routines
             WHERE active = 1
             ORDER BY id ASC"
        };
        let mut statement = connection
            .prepare(sql)
            .map_err(RoutineRepositoryError::internal)?;
        statement
            .query_map([], routine_from_row)
            .map_err(RoutineRepositoryError::internal)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(RoutineRepositoryError::internal)
    }

    fn load_routine(&self, id: i64) -> Result<Option<Routine>, RoutineRepositoryError> {
        self.connection()
            .map_err(RoutineRepositoryError::internal)?
            .query_row(
                "SELECT id, interval, time, effort, tool, content, active, detail_ref, created_at, updated_at
                 FROM routines
                 WHERE id = ?1",
                [id],
                routine_from_row,
            )
            .optional()
            .map_err(RoutineRepositoryError::internal)
    }

    fn save_routine(
        &self,
        fields: &RoutineFields,
        timestamp: &str,
    ) -> Result<Routine, RoutineRepositoryError> {
        let connection = self
            .connection()
            .map_err(RoutineRepositoryError::internal)?;
        connection
            .execute(
                "INSERT INTO routines (
                    interval, time, effort, tool, content, active, detail_ref, created_at, updated_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6, ?7, ?7)",
                params![
                    fields.interval,
                    fields.time,
                    fields.effort,
                    fields.tool,
                    fields.content,
                    fields.detail_ref,
                    timestamp
                ],
            )
            .map_err(map_routine_write_error)?;

        Ok(Routine {
            id: connection.last_insert_rowid(),
            interval: fields.interval.clone(),
            time: fields.time.clone(),
            effort: fields.effort.clone(),
            tool: fields.tool.clone(),
            content: fields.content.clone(),
            active: true,
            detail_ref: fields.detail_ref.clone(),
            created_at: timestamp.to_owned(),
            updated_at: timestamp.to_owned(),
        })
    }

    fn replace_routine(
        &self,
        id: i64,
        fields: &RoutineFields,
        updated_at: &str,
    ) -> Result<Option<Routine>, RoutineRepositoryError> {
        let connection = self
            .connection()
            .map_err(RoutineRepositoryError::internal)?;
        let changed = connection
            .execute(
                "UPDATE routines
                 SET interval = ?1,
                     time = ?2,
                     effort = ?3,
                     tool = ?4,
                     content = ?5,
                     detail_ref = ?6,
                     updated_at = ?7
                 WHERE id = ?8 AND active = 1",
                params![
                    fields.interval,
                    fields.time,
                    fields.effort,
                    fields.tool,
                    fields.content,
                    fields.detail_ref,
                    updated_at,
                    id
                ],
            )
            .map_err(map_routine_write_error)?;
        if changed == 0 {
            return Ok(None);
        }

        connection
            .query_row(
                "SELECT id, interval, time, effort, tool, content, active, detail_ref, created_at, updated_at
                 FROM routines
                 WHERE id = ?1",
                [id],
                routine_from_row,
            )
            .map(Some)
            .map_err(RoutineRepositoryError::internal)
    }

    fn deactivate_stored_routine(
        &self,
        id: i64,
        updated_at: &str,
    ) -> Result<Option<Routine>, RoutineRepositoryError> {
        let connection = self
            .connection()
            .map_err(RoutineRepositoryError::internal)?;
        let changed = connection
            .execute(
                "UPDATE routines
                 SET active = 0, updated_at = ?1
                 WHERE id = ?2 AND active = 1",
                params![updated_at, id],
            )
            .map_err(RoutineRepositoryError::internal)?;
        if changed == 0 {
            return Ok(None);
        }

        connection
            .query_row(
                "SELECT id, interval, time, effort, tool, content, active, detail_ref, created_at, updated_at
                 FROM routines
                 WHERE id = ?1",
                [id],
                routine_from_row,
            )
            .map(Some)
            .map_err(RoutineRepositoryError::internal)
    }

    fn active_routine_count(&self) -> Result<usize, RoutineRepositoryError> {
        let count = self
            .connection()
            .map_err(RoutineRepositoryError::internal)?
            .query_row(
                "SELECT COUNT(*) FROM routines WHERE active = 1",
                [],
                |row| row.get::<_, i64>(0),
            )
            .map_err(RoutineRepositoryError::internal)?;
        usize::try_from(count).map_err(|_| {
            RoutineRepositoryError::internal(SqliteRepositoryError::InvalidStoredCount(count))
        })
    }

    fn import_stored_routines(
        &self,
        routines: &[RoutineFields],
        timestamp: &str,
        force: bool,
    ) -> Result<usize, RoutineImportRepositoryError> {
        let mut connection = self
            .connection()
            .map_err(RoutineImportRepositoryError::internal)?;
        let transaction = connection
            .transaction()
            .map_err(RoutineImportRepositoryError::internal)?;
        let active_count = transaction
            .query_row(
                "SELECT COUNT(*) FROM routines WHERE active = 1",
                [],
                |row| row.get::<_, i64>(0),
            )
            .map_err(RoutineImportRepositoryError::internal)?;
        let active_count = usize::try_from(active_count).map_err(|_| {
            RoutineImportRepositoryError::internal(SqliteRepositoryError::InvalidStoredCount(
                active_count,
            ))
        })?;

        if active_count > 0 && !force {
            return Err(RoutineImportRepositoryError::ActiveRoutinesExist {
                count: active_count,
            });
        }
        if force {
            transaction
                .execute(
                    "UPDATE routines
                     SET active = 0, updated_at = ?1
                     WHERE active = 1",
                    [timestamp],
                )
                .map_err(RoutineImportRepositoryError::internal)?;
        }

        {
            let mut statement = transaction
                .prepare(
                    "INSERT INTO routines (
                        interval, time, effort, tool, content, active, created_at, updated_at
                     ) VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6, ?6)",
                )
                .map_err(RoutineImportRepositoryError::internal)?;
            for routine in routines {
                statement
                    .execute(params![
                        routine.interval,
                        routine.time,
                        routine.effort,
                        routine.tool,
                        routine.content,
                        timestamp
                    ])
                    .map_err(RoutineImportRepositoryError::internal)?;
            }
        }

        transaction
            .commit()
            .map_err(RoutineImportRepositoryError::internal)?;
        Ok(routines.len())
    }
}

fn routine_from_row(row: &Row<'_>) -> rusqlite::Result<Routine> {
    Ok(Routine {
        id: row.get(0)?,
        interval: row.get(1)?,
        time: row.get(2)?,
        effort: row.get(3)?,
        tool: row.get(4)?,
        content: row.get(5)?,
        active: row.get(6)?,
        detail_ref: row.get(7)?,
        created_at: row.get(8)?,
        updated_at: row.get(9)?,
    })
}

fn map_routine_write_error(source: rusqlite::Error) -> RoutineRepositoryError {
    if matches!(
        &source,
        rusqlite::Error::SqliteFailure(error, _)
            if error.extended_code == rusqlite::ffi::SQLITE_CONSTRAINT_UNIQUE
    ) {
        RoutineRepositoryError::Conflict
    } else {
        RoutineRepositoryError::internal(source)
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

impl RoutineRepository for SqliteTaskRepository {
    fn list_routines(
        &self,
        include_inactive: bool,
    ) -> Result<Vec<Routine>, RoutineRepositoryError> {
        self.list_stored_routines(include_inactive)
    }

    fn get_routine(&self, id: i64) -> Result<Option<Routine>, RoutineRepositoryError> {
        self.load_routine(id)
    }

    fn insert_routine(
        &self,
        fields: &RoutineFields,
        timestamp: &str,
    ) -> Result<Routine, RoutineRepositoryError> {
        self.save_routine(fields, timestamp)
    }

    fn update_routine(
        &self,
        id: i64,
        fields: &RoutineFields,
        updated_at: &str,
    ) -> Result<Option<Routine>, RoutineRepositoryError> {
        self.replace_routine(id, fields, updated_at)
    }

    fn deactivate_routine(
        &self,
        id: i64,
        updated_at: &str,
    ) -> Result<Option<Routine>, RoutineRepositoryError> {
        self.deactivate_stored_routine(id, updated_at)
    }

    fn count_active_routines(&self) -> Result<usize, RoutineRepositoryError> {
        self.active_routine_count()
    }
}

impl RoutineImportRepository for SqliteTaskRepository {
    fn count_active_routines(&self) -> Result<usize, RoutineImportRepositoryError> {
        let count = self
            .connection()
            .map_err(RoutineImportRepositoryError::internal)?
            .query_row(
                "SELECT COUNT(*) FROM routines WHERE active = 1",
                [],
                |row| row.get::<_, i64>(0),
            )
            .map_err(RoutineImportRepositoryError::internal)?;
        usize::try_from(count).map_err(|_| {
            RoutineImportRepositoryError::internal(SqliteRepositoryError::InvalidStoredCount(count))
        })
    }

    fn import_routines(
        &self,
        routines: &[RoutineFields],
        timestamp: &str,
        force: bool,
    ) -> Result<usize, RoutineImportRepositoryError> {
        self.import_stored_routines(routines, timestamp, force)
    }
}

impl DigestRepository for SqliteTaskRepository {
    /// 同じ date への再 POST は上書き（docs/specs/02-data-model.md §6）
    fn save_digest(
        &self,
        date: &str,
        body: &str,
        received_at: &str,
    ) -> Result<(), RepositoryError> {
        self.connection()
            .map_err(RepositoryError::new)?
            .execute(
                "INSERT INTO digests (date, body, received_at)
                 VALUES (?1, ?2, ?3)
                 ON CONFLICT(date) DO UPDATE SET body = ?2, received_at = ?3",
                params![date, body, received_at],
            )
            .map_err(|source| RepositoryError::new(SqliteRepositoryError::Query(source)))?;
        Ok(())
    }

    fn get_digest(&self, date: &str) -> Result<Option<StoredDigest>, RepositoryError> {
        self.connection()
            .map_err(RepositoryError::new)?
            .query_row(
                "SELECT body, received_at FROM digests WHERE date = ?1",
                [date],
                |row| {
                    Ok(StoredDigest {
                        body: row.get(0)?,
                        received_at: row.get(1)?,
                    })
                },
            )
            .optional()
            .map_err(|source| RepositoryError::new(SqliteRepositoryError::Query(source)))
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
    use rusqlite::{Connection, params};

    use super::{MIGRATION_V1, SqliteTaskRepository};
    use crate::{
        domain::{
            day::SummaryDay,
            routine::{Routine, RoutineFields},
            task::{CheckedTask, Task},
        },
        usecase::ports::{RoutineRepository, RoutineRepositoryError, TaskRepository},
    };

    fn repository() -> SqliteTaskRepository {
        SqliteTaskRepository::from_connection(
            Connection::open_in_memory().expect("in-memory SQLite should open"),
        )
        .expect("in-memory repository should initialize")
    }

    fn task(id: &str, content: &str, sort_no: usize) -> Task {
        Task {
            detail_ref: None,
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
    fn migrates_new_database_to_the_latest_version_on_startup() {
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
                     WHERE type = 'table'
                       AND name IN ('digests', 'routines', 'task_days', 'task_checks')
                     ORDER BY name",
                )
                .expect("schema query should prepare");
            statement
                .query_map([], |row| row.get(0))
                .expect("schema query should execute")
                .collect::<Result<_, _>>()
                .expect("schema rows should decode")
        };
        let routine_index_exists: bool = connection
            .query_row(
                "SELECT EXISTS(
                    SELECT 1
                    FROM sqlite_master
                    WHERE type = 'index' AND name = 'routines_identity'
                )",
                [],
                |row| row.get(0),
            )
            .expect("routine index should be queryable");

        assert_eq!(version, 3);
        assert_eq!(
            tables,
            vec!["digests", "routines", "task_checks", "task_days"]
        );
        assert!(routine_index_exists);
    }

    #[test]
    fn migrates_version_one_with_existing_data_without_changing_snapshots() {
        let connection = Connection::open_in_memory().expect("in-memory SQLite should open");
        connection
            .execute_batch(MIGRATION_V1)
            .expect("version one schema should initialize");
        connection
            .execute(
                "INSERT INTO task_days (
                    date, task_id, interval, time, effort, tool, content, sort_no
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![
                    "2026-07-26",
                    "existing-task",
                    "毎日",
                    "7:30",
                    "10分",
                    "slack",
                    "既存データ",
                    0
                ],
            )
            .expect("existing task day should insert");
        connection
            .execute(
                "INSERT INTO task_checks (date, task_id, done, checked_at)
                 VALUES (?1, ?2, ?3, ?4)",
                params![
                    "2026-07-26",
                    "existing-task",
                    1,
                    "2026-07-26T08:00:00+09:00"
                ],
            )
            .expect("existing task check should insert");

        let repository = SqliteTaskRepository::from_connection(connection)
            .expect("version one database should migrate");
        let connection = repository
            .connection()
            .expect("repository connection should lock");
        let version: i64 = connection
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .expect("schema version should be readable");
        let stored: (String, String, i64, String) = connection
            .query_row(
                "SELECT d.content, d.tool, c.done, c.checked_at
                 FROM task_days d
                 JOIN task_checks c
                   ON c.date = d.date AND c.task_id = d.task_id
                 WHERE d.date = ?1 AND d.task_id = ?2",
                params!["2026-07-26", "existing-task"],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .expect("existing snapshot data should remain");
        let routine_count: i64 = connection
            .query_row("SELECT COUNT(*) FROM routines", [], |row| row.get(0))
            .expect("routines should be queryable");

        assert_eq!(version, 3);
        assert_eq!(
            stored,
            (
                "既存データ".to_owned(),
                "slack".to_owned(),
                1,
                "2026-07-26T08:00:00+09:00".to_owned()
            )
        );
        assert_eq!(routine_count, 0);
        println!(
            "migration v1→v2: user_version={version}, existing_task_days=1, \
             existing_task_checks=1, routines={routine_count}"
        );
    }

    fn routine_fields(interval: &str, time: &str, content: &str) -> RoutineFields {
        RoutineFields {
            detail_ref: None,
            interval: interval.to_owned(),
            time: time.to_owned(),
            effort: "10分".to_owned(),
            tool: "slack".to_owned(),
            content: content.to_owned(),
        }
    }

    #[test]
    fn inserts_updates_and_logically_deletes_routines() {
        let repository = repository();
        let first_fields = routine_fields("毎日", "7:30", "最初");
        let second_fields = routine_fields("平日", "8:00", "次");
        let first = repository
            .insert_routine(&first_fields, "2026-07-27T09:00:00+09:00")
            .expect("first routine should insert");
        let second = repository
            .insert_routine(&second_fields, "2026-07-27T09:01:00+09:00")
            .expect("second routine should insert");

        assert_eq!(
            repository
                .list_routines(false)
                .expect("active routines should list")
                .iter()
                .map(|routine| routine.id)
                .collect::<Vec<_>>(),
            vec![first.id, second.id]
        );
        assert_eq!(
            repository
                .get_routine(first.id)
                .expect("routine lookup should succeed"),
            Some(first.clone())
        );
        assert_eq!(
            repository
                .count_active_routines()
                .expect("active routines should count"),
            2
        );

        let updated_fields = routine_fields("土曜", "9:30", "更新後");
        let updated = repository
            .update_routine(first.id, &updated_fields, "2026-07-27T10:00:00+09:00")
            .expect("routine update should execute")
            .expect("active routine should update");
        assert_eq!(
            updated,
            Routine {
                id: first.id,
                detail_ref: None,
                interval: updated_fields.interval,
                time: updated_fields.time,
                effort: updated_fields.effort,
                tool: updated_fields.tool,
                content: updated_fields.content,
                active: true,
                created_at: "2026-07-27T09:00:00+09:00".to_owned(),
                updated_at: "2026-07-27T10:00:00+09:00".to_owned(),
            }
        );

        let deleted = repository
            .deactivate_routine(first.id, "2026-07-27T11:00:00+09:00")
            .expect("routine delete should execute")
            .expect("active routine should deactivate");
        assert!(!deleted.active);
        assert_eq!(deleted.updated_at, "2026-07-27T11:00:00+09:00");
        assert_eq!(
            repository
                .list_routines(false)
                .expect("active routines should list"),
            vec![second]
        );
        assert_eq!(
            repository
                .list_routines(true)
                .expect("all routines should list")
                .len(),
            2
        );
        assert_eq!(
            repository
                .count_active_routines()
                .expect("active routines should count"),
            1
        );
        assert!(
            repository
                .deactivate_routine(first.id, "2026-07-27T12:00:00+09:00")
                .expect("repeated delete should execute")
                .is_none()
        );
    }

    #[test]
    fn identifies_active_routine_identity_conflicts() {
        let repository = repository();
        let identity = routine_fields("毎日", "7:30", "重複");
        let first = repository
            .insert_routine(&identity, "2026-07-27T09:00:00+09:00")
            .expect("first identity should insert");

        assert!(matches!(
            repository.insert_routine(&identity, "2026-07-27T09:01:00+09:00"),
            Err(RoutineRepositoryError::Conflict)
        ));

        let other = repository
            .insert_routine(
                &routine_fields("平日", "8:00", "別の行"),
                "2026-07-27T09:02:00+09:00",
            )
            .expect("other routine should insert");
        assert!(matches!(
            repository.update_routine(other.id, &identity, "2026-07-27T09:03:00+09:00"),
            Err(RoutineRepositoryError::Conflict)
        ));

        repository
            .deactivate_routine(first.id, "2026-07-27T09:04:00+09:00")
            .expect("first routine should deactivate");
        repository
            .insert_routine(&identity, "2026-07-27T09:05:00+09:00")
            .expect("inactive identity should not conflict");
    }

    #[test]
    fn imports_routines_in_order_and_force_deactivates_existing_rows() {
        let repository = repository();
        let existing = repository
            .insert_routine(
                &routine_fields("毎日", "6:00", "既存"),
                "2026-07-27T08:00:00+09:00",
            )
            .expect("existing routine should insert");
        let imported = vec![
            routine_fields("毎日", "7:30", "先頭"),
            routine_fields("土曜", "8:00", "次"),
        ];

        let count = crate::usecase::ports::RoutineImportRepository::import_routines(
            &repository,
            &imported,
            "2026-07-27T09:00:00+09:00",
            true,
        )
        .expect("forced import should succeed");
        let stored = repository
            .list_routines(true)
            .expect("all routines should list");

        assert_eq!(count, 2);
        assert_eq!(
            stored
                .iter()
                .map(|routine| (routine.id, routine.active, routine.content.as_str()))
                .collect::<Vec<_>>(),
            vec![
                (existing.id, false, "既存"),
                (existing.id + 1, true, "先頭"),
                (existing.id + 2, true, "次"),
            ]
        );
        assert_eq!(stored[0].updated_at, "2026-07-27T09:00:00+09:00");
    }

    #[test]
    fn failed_forced_import_rolls_back_deactivation_and_inserts() {
        let repository = repository();
        let existing = repository
            .insert_routine(
                &routine_fields("毎日", "6:00", "既存"),
                "2026-07-27T08:00:00+09:00",
            )
            .expect("existing routine should insert");
        let duplicate = routine_fields("毎日", "7:30", "重複");

        assert!(
            crate::usecase::ports::RoutineImportRepository::import_routines(
                &repository,
                &[duplicate.clone(), duplicate],
                "2026-07-27T09:00:00+09:00",
                true,
            )
            .is_err()
        );
        assert_eq!(
            repository
                .list_routines(true)
                .expect("all routines should list"),
            vec![existing]
        );
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
