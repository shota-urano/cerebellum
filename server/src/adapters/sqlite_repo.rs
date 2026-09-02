use std::{
    path::{Path, PathBuf},
    sync::{Mutex, MutexGuard},
};

use chrono::{DateTime, FixedOffset};
use rusqlite::{Connection, OptionalExtension, Row, params, types::Type};
use thiserror::Error;

use crate::domain::{
    day::SummaryDay,
    harness::{
        ApplyResult, ApplyState, ChallengeVerdict, HarnessKind, HarnessProposalBatch,
        HarnessStatus, HarnessVerdict,
    },
    inbox::{InboxApplyResult, InboxApplyState, InboxBatch, InboxKind, InboxOption, InboxStatus},
    intake::{IntakeApplyResult, IntakeApplyState, IntakeBatch, IntakeLane, IntakeStatus},
    routine::{Routine, RoutineFields},
    task::{CheckedTask, Task},
};
use crate::usecase::ports::{
    DigestRepository, HarnessRepository, HarnessRepositoryError, InboxOpenCount, InboxRepository,
    InboxRepositoryError, InboxSourceSummary, IntakeReceipt, IntakeRepository,
    IntakeRepositoryError, LearningRepository, RepositoryError, RoutineImportRepository,
    RoutineImportRepositoryError, RoutineRepository, RoutineRepositoryError, StoredDigest,
    StoredHarnessProposal, StoredInboxItem, StoredIntakeCandidate, StoredLearningResult,
    StoredLearningSet, TaskRepository,
};

const MIGRATION_V1: &str = include_str!("migrations/001_init.sql");
const MIGRATION_V2: &str = include_str!("migrations/002_routines.sql");
const MIGRATION_V3: &str = include_str!("migrations/003_digests.sql");
const MIGRATION_V4: &str = include_str!("migrations/004_learning.sql");
const MIGRATION_V5: &str = include_str!("migrations/005_harness.sql");
const MIGRATION_V6: &str = include_str!("migrations/006_intake.sql");
const MIGRATION_V7: &str = include_str!("migrations/007_inbox.sql");
const LATEST_SCHEMA_VERSION: i64 = 7;

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
            0 => &[
                MIGRATION_V1,
                MIGRATION_V2,
                MIGRATION_V3,
                MIGRATION_V4,
                MIGRATION_V5,
                MIGRATION_V6,
                MIGRATION_V7,
            ][..],
            1 => &[
                MIGRATION_V2,
                MIGRATION_V3,
                MIGRATION_V4,
                MIGRATION_V5,
                MIGRATION_V6,
                MIGRATION_V7,
            ][..],
            2 => &[
                MIGRATION_V3,
                MIGRATION_V4,
                MIGRATION_V5,
                MIGRATION_V6,
                MIGRATION_V7,
            ][..],
            3 => &[MIGRATION_V4, MIGRATION_V5, MIGRATION_V6, MIGRATION_V7][..],
            4 => &[MIGRATION_V5, MIGRATION_V6, MIGRATION_V7][..],
            5 => &[MIGRATION_V6, MIGRATION_V7][..],
            6 => &[MIGRATION_V7][..],
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

impl LearningRepository for SqliteTaskRepository {
    fn save_learning_set(
        &self,
        date: &str,
        raw: &str,
        received_at: &str,
    ) -> Result<(), RepositoryError> {
        self.connection()
            .map_err(RepositoryError::new)?
            .execute(
                "INSERT INTO learning_sets (date, raw, received_at)
                 VALUES (?1, ?2, ?3)
                 ON CONFLICT(date) DO UPDATE SET raw = ?2, received_at = ?3",
                params![date, raw, received_at],
            )
            .map_err(|source| RepositoryError::new(SqliteRepositoryError::Query(source)))?;
        Ok(())
    }

    fn get_learning_set(&self, date: &str) -> Result<Option<StoredLearningSet>, RepositoryError> {
        self.connection()
            .map_err(RepositoryError::new)?
            .query_row(
                "SELECT raw, received_at FROM learning_sets WHERE date = ?1",
                [date],
                |row| {
                    Ok(StoredLearningSet {
                        raw: row.get(0)?,
                        received_at: row.get(1)?,
                    })
                },
            )
            .optional()
            .map_err(|source| RepositoryError::new(SqliteRepositoryError::Query(source)))
    }

    fn save_learning_result(
        &self,
        date: &str,
        grades: &str,
        feeling: &str,
        completed_at: &str,
    ) -> Result<(), RepositoryError> {
        self.connection()
            .map_err(RepositoryError::new)?
            .execute(
                "INSERT INTO learning_results (date, grades, feeling, completed_at)
                 VALUES (?1, ?2, ?3, ?4)
                 ON CONFLICT(date) DO UPDATE SET
                   grades = ?2, feeling = ?3, completed_at = ?4",
                params![date, grades, feeling, completed_at],
            )
            .map_err(|source| RepositoryError::new(SqliteRepositoryError::Query(source)))?;
        Ok(())
    }

    fn get_learning_result(
        &self,
        date: &str,
    ) -> Result<Option<StoredLearningResult>, RepositoryError> {
        self.connection()
            .map_err(RepositoryError::new)?
            .query_row(
                "SELECT grades, feeling, completed_at
                 FROM learning_results
                 WHERE date = ?1",
                [date],
                |row| {
                    Ok(StoredLearningResult {
                        grades: row.get(0)?,
                        feeling: row.get(1)?,
                        completed_at: row.get(2)?,
                    })
                },
            )
            .optional()
            .map_err(|source| RepositoryError::new(SqliteRepositoryError::Query(source)))
    }
}

impl HarnessRepository for SqliteTaskRepository {
    fn replace_harness_proposals(
        &self,
        batch: &HarnessProposalBatch,
        received_at: &str,
    ) -> Result<(), HarnessRepositoryError> {
        let mut connection = self
            .connection()
            .map_err(HarnessRepositoryError::internal)?;
        let transaction = connection
            .transaction()
            .map_err(HarnessRepositoryError::internal)?;
        let has_protected_state = transaction
            .query_row(
                "SELECT EXISTS(
                    SELECT 1
                    FROM harness_proposals
                    WHERE date = ?1
                      AND (
                        status IN ('approved', 'rejected')
                        OR apply_state <> 'pending'
                      )
                 )",
                [&batch.date],
                |row| row.get::<_, bool>(0),
            )
            .map_err(HarnessRepositoryError::internal)?;
        if has_protected_state {
            return Err(HarnessRepositoryError::Conflict);
        }

        transaction
            .execute(
                "DELETE FROM harness_proposals WHERE date = ?1",
                [&batch.date],
            )
            .map_err(HarnessRepositoryError::internal)?;
        {
            let mut statement = transaction
                .prepare(
                    "INSERT INTO harness_proposals (
                        date, kind, slug, insight_name, verdict, category, summary,
                        challenge_verdict, challenge_note, detail_path, detail_md,
                        status, apply_state, received_at
                     ) VALUES (
                        ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 'pending', ?13
                     )",
                )
                .map_err(HarnessRepositoryError::internal)?;
            for proposal in &batch.proposals {
                let status = if proposal.verdict == HarnessVerdict::Killed {
                    HarnessStatus::Killed
                } else {
                    HarnessStatus::Proposed
                };
                statement
                    .execute(params![
                        batch.date,
                        batch.kind.as_str(),
                        proposal.slug,
                        proposal.insight_name,
                        proposal.verdict.as_str(),
                        proposal.category,
                        proposal.summary,
                        proposal.challenge_verdict.map(ChallengeVerdict::as_str),
                        proposal.challenge_note,
                        proposal.detail_path,
                        proposal.detail_md,
                        status.as_str(),
                        received_at,
                    ])
                    .map_err(HarnessRepositoryError::internal)?;
            }
        }

        transaction
            .commit()
            .map_err(HarnessRepositoryError::internal)
    }

    fn list_harness_proposals(
        &self,
        date: &str,
    ) -> Result<Vec<StoredHarnessProposal>, HarnessRepositoryError> {
        let connection = self
            .connection()
            .map_err(HarnessRepositoryError::internal)?;
        let mut statement = connection
            .prepare(
                "SELECT
                    id, date, kind, slug, insight_name, verdict, category, summary,
                    challenge_verdict, challenge_note, detail_path, detail_md,
                    status, decided_at, apply_state, applied_at, apply_error,
                    snapshot_path, received_at
                 FROM harness_proposals
                 WHERE date = ?1
                 ORDER BY id ASC",
            )
            .map_err(HarnessRepositoryError::internal)?;
        statement
            .query_map([date], harness_proposal_from_row)
            .map_err(HarnessRepositoryError::internal)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(HarnessRepositoryError::internal)
    }

    fn get_harness_proposal(
        &self,
        id: i64,
    ) -> Result<Option<StoredHarnessProposal>, HarnessRepositoryError> {
        self.connection()
            .map_err(HarnessRepositoryError::internal)?
            .query_row(
                "SELECT
                    id, date, kind, slug, insight_name, verdict, category, summary,
                    challenge_verdict, challenge_note, detail_path, detail_md,
                    status, decided_at, apply_state, applied_at, apply_error,
                    snapshot_path, received_at
                 FROM harness_proposals
                 WHERE id = ?1",
                [id],
                harness_proposal_from_row,
            )
            .optional()
            .map_err(HarnessRepositoryError::internal)
    }

    fn save_harness_decision(
        &self,
        id: i64,
        expected_status: HarnessStatus,
        status: HarnessStatus,
        decided_at: &str,
    ) -> Result<StoredHarnessProposal, HarnessRepositoryError> {
        let connection = self
            .connection()
            .map_err(HarnessRepositoryError::internal)?;
        let changed = connection
            .execute(
                "UPDATE harness_proposals
                 SET status = ?1, decided_at = ?2
                 WHERE id = ?3
                   AND status = ?4
                   AND apply_state = 'pending'",
                params![status.as_str(), decided_at, id, expected_status.as_str()],
            )
            .map_err(HarnessRepositoryError::internal)?;
        if changed == 0 {
            return Err(HarnessRepositoryError::StateMismatch);
        }

        connection
            .query_row(
                "SELECT
                    id, date, kind, slug, insight_name, verdict, category, summary,
                    challenge_verdict, challenge_note, detail_path, detail_md,
                    status, decided_at, apply_state, applied_at, apply_error,
                    snapshot_path, received_at
                 FROM harness_proposals
                 WHERE id = ?1",
                [id],
                harness_proposal_from_row,
            )
            .map_err(HarnessRepositoryError::internal)
    }

    fn list_pending_approved(&self) -> Result<Vec<StoredHarnessProposal>, HarnessRepositoryError> {
        let connection = self
            .connection()
            .map_err(HarnessRepositoryError::internal)?;
        let mut statement = connection
            .prepare(
                "SELECT
                    id, date, kind, slug, insight_name, verdict, category, summary,
                    challenge_verdict, challenge_note, detail_path, detail_md,
                    status, decided_at, apply_state, applied_at, apply_error,
                    snapshot_path, received_at
                 FROM harness_proposals
                 WHERE status = 'approved' AND apply_state = 'pending'
                 ORDER BY date ASC, id ASC",
            )
            .map_err(HarnessRepositoryError::internal)?;
        statement
            .query_map([], harness_proposal_from_row)
            .map_err(HarnessRepositoryError::internal)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(HarnessRepositoryError::internal)
    }

    fn list_failed(&self) -> Result<Vec<StoredHarnessProposal>, HarnessRepositoryError> {
        let connection = self
            .connection()
            .map_err(HarnessRepositoryError::internal)?;
        let mut statement = connection
            .prepare(
                "SELECT
                    id, date, kind, slug, insight_name, verdict, category, summary,
                    challenge_verdict, challenge_note, detail_path, detail_md,
                    status, decided_at, apply_state, applied_at, apply_error,
                    snapshot_path, received_at
                 FROM harness_proposals
                 WHERE apply_state = 'failed'
                 ORDER BY date DESC, id DESC",
            )
            .map_err(HarnessRepositoryError::internal)?;
        statement
            .query_map([], harness_proposal_from_row)
            .map_err(HarnessRepositoryError::internal)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(HarnessRepositoryError::internal)
    }

    fn save_harness_apply_result(
        &self,
        id: i64,
        result: &ApplyResult,
        applied_at: &str,
    ) -> Result<StoredHarnessProposal, HarnessRepositoryError> {
        let connection = self
            .connection()
            .map_err(HarnessRepositoryError::internal)?;
        let changed = connection
            .execute(
                "UPDATE harness_proposals
                 SET apply_state = ?1,
                     applied_at = ?2,
                     apply_error = ?3,
                     snapshot_path = ?4
                 WHERE id = ?5
                   AND status = 'approved'",
                params![
                    result.state.as_str(),
                    applied_at,
                    result.error,
                    result.snapshot_path,
                    id,
                ],
            )
            .map_err(HarnessRepositoryError::internal)?;
        if changed == 0 {
            return Err(HarnessRepositoryError::StateMismatch);
        }

        connection
            .query_row(
                "SELECT
                    id, date, kind, slug, insight_name, verdict, category, summary,
                    challenge_verdict, challenge_note, detail_path, detail_md,
                    status, decided_at, apply_state, applied_at, apply_error,
                    snapshot_path, received_at
                 FROM harness_proposals
                 WHERE id = ?1",
                [id],
                harness_proposal_from_row,
            )
            .map_err(HarnessRepositoryError::internal)
    }
}

fn harness_proposal_from_row(row: &Row<'_>) -> rusqlite::Result<StoredHarnessProposal> {
    let kind = row.get::<_, String>(2)?;
    let verdict = row.get::<_, String>(5)?;
    let challenge_verdict = row.get::<_, Option<String>>(8)?;
    let status = row.get::<_, String>(12)?;
    let apply_state = row.get::<_, String>(14)?;

    Ok(StoredHarnessProposal {
        id: row.get(0)?,
        date: row.get(1)?,
        kind: match kind.as_str() {
            "daily" => HarnessKind::Daily,
            "prune" => HarnessKind::Prune,
            "model_switch" => HarnessKind::ModelSwitch,
            _ => return Err(invalid_harness_value(2, "kind", kind)),
        },
        slug: row.get(3)?,
        insight_name: row.get(4)?,
        verdict: match verdict.as_str() {
            "adopt" => HarnessVerdict::Adopt,
            "experiment" => HarnessVerdict::Experiment,
            "killed" => HarnessVerdict::Killed,
            _ => return Err(invalid_harness_value(5, "verdict", verdict)),
        },
        category: row.get(6)?,
        summary: row.get(7)?,
        challenge_verdict: match challenge_verdict.as_deref() {
            Some("hold") => Some(ChallengeVerdict::Hold),
            Some("weaken") => Some(ChallengeVerdict::Weaken),
            Some("refute") => Some(ChallengeVerdict::Refute),
            Some(_) => {
                return Err(invalid_harness_value(
                    8,
                    "challenge_verdict",
                    challenge_verdict.unwrap_or_default(),
                ));
            }
            None => None,
        },
        challenge_note: row.get(9)?,
        detail_path: row.get(10)?,
        detail_md: row.get(11)?,
        status: match status.as_str() {
            "proposed" => HarnessStatus::Proposed,
            "approved" => HarnessStatus::Approved,
            "rejected" => HarnessStatus::Rejected,
            "killed" => HarnessStatus::Killed,
            _ => return Err(invalid_harness_value(12, "status", status)),
        },
        decided_at: row.get(13)?,
        apply_state: match apply_state.as_str() {
            "pending" => ApplyState::Pending,
            "applied" => ApplyState::Applied,
            "failed" => ApplyState::Failed,
            _ => return Err(invalid_harness_value(14, "apply_state", apply_state)),
        },
        applied_at: row.get(15)?,
        apply_error: row.get(16)?,
        snapshot_path: row.get(17)?,
        received_at: row.get(18)?,
    })
}

fn invalid_harness_value(index: usize, column: &'static str, value: String) -> rusqlite::Error {
    rusqlite::Error::FromSqlConversionFailure(
        index,
        Type::Text,
        Box::new(SqliteRepositoryError::InvalidStoredHarnessValue { column, value }),
    )
}

impl IntakeRepository for SqliteTaskRepository {
    fn replace_intake_candidates(
        &self,
        batch: &IntakeBatch,
        received_at: &str,
    ) -> Result<(), IntakeRepositoryError> {
        let mut connection = self.connection().map_err(IntakeRepositoryError::internal)?;
        let transaction = connection
            .transaction()
            .map_err(IntakeRepositoryError::internal)?;
        let protected: bool = transaction.query_row(
            "SELECT EXISTS(SELECT 1 FROM intake_candidates WHERE date=?1 AND (status IN ('approved','rejected') OR apply_state<>'pending'))",
            [&batch.date], |row| row.get(0)).map_err(IntakeRepositoryError::internal)?;
        if protected {
            return Err(IntakeRepositoryError::Conflict);
        }
        transaction
            .execute("DELETE FROM intake_candidates WHERE date=?1", [&batch.date])
            .map_err(IntakeRepositoryError::internal)?;
        let item_count =
            i64::try_from(batch.items.len()).map_err(IntakeRepositoryError::internal)?;
        transaction.execute(
            "INSERT INTO intake_days(date,source_path,source_note,item_count,received_at) VALUES(?1,?2,?3,?4,?5)
             ON CONFLICT(date) DO UPDATE SET source_path=excluded.source_path,source_note=excluded.source_note,item_count=excluded.item_count,received_at=excluded.received_at",
            params![batch.date, batch.source_path, batch.source_note, item_count, received_at]
        ).map_err(IntakeRepositoryError::internal)?;
        {
            let mut statement = transaction.prepare(
                "INSERT INTO intake_candidates(date,slug,lane,text,note,line_no,status,apply_state,received_at) VALUES(?1,?2,?3,?4,?5,?6,'proposed','pending',?7)"
            ).map_err(IntakeRepositoryError::internal)?;
            for item in &batch.items {
                statement
                    .execute(params![
                        batch.date,
                        item.slug,
                        item.lane.as_str(),
                        item.text,
                        item.note,
                        item.line_no,
                        received_at
                    ])
                    .map_err(IntakeRepositoryError::internal)?;
            }
        }
        transaction
            .commit()
            .map_err(IntakeRepositoryError::internal)
    }

    fn list_proposed_intake(&self) -> Result<Vec<StoredIntakeCandidate>, IntakeRepositoryError> {
        self.list_intake_where("c.status='proposed'", "c.date DESC, c.id ASC")
    }
    fn list_pending_approved_intake(
        &self,
    ) -> Result<Vec<StoredIntakeCandidate>, IntakeRepositoryError> {
        self.list_intake_where(
            "c.status='approved' AND c.apply_state='pending'",
            "c.date ASC, c.id ASC",
        )
    }
    fn list_failed_intake(&self) -> Result<Vec<StoredIntakeCandidate>, IntakeRepositoryError> {
        self.list_intake_where("c.apply_state='failed'", "c.date DESC, c.id ASC")
    }

    fn latest_intake_receipt(&self) -> Result<Option<IntakeReceipt>, IntakeRepositoryError> {
        self.connection().map_err(IntakeRepositoryError::internal)?.query_row(
            "SELECT date,received_at,item_count FROM intake_days ORDER BY received_at DESC, date DESC LIMIT 1", [],
            |row| Ok((row.get::<_, String>(0)?,row.get::<_, String>(1)?,row.get::<_, i64>(2)?))
        ).optional().map_err(IntakeRepositoryError::internal)?.map(|(date,received_at,count)| Ok(IntakeReceipt { date, received_at, item_count: usize::try_from(count).map_err(IntakeRepositoryError::internal)? })).transpose()
    }

    fn get_intake_candidate(
        &self,
        id: i64,
    ) -> Result<Option<StoredIntakeCandidate>, IntakeRepositoryError> {
        self.connection()
            .map_err(IntakeRepositoryError::internal)?
            .query_row(
                &intake_select("c.id=?1", None),
                [id],
                intake_candidate_from_row,
            )
            .optional()
            .map_err(IntakeRepositoryError::internal)
    }

    fn save_intake_decision(
        &self,
        id: i64,
        expected_status: IntakeStatus,
        status: IntakeStatus,
        decided_at: &str,
    ) -> Result<StoredIntakeCandidate, IntakeRepositoryError> {
        let connection = self.connection().map_err(IntakeRepositoryError::internal)?;
        let changed=connection.execute("UPDATE intake_candidates SET status=?1,decided_at=?2 WHERE id=?3 AND status=?4 AND apply_state='pending'",params![status.as_str(),decided_at,id,expected_status.as_str()]).map_err(IntakeRepositoryError::internal)?;
        if changed == 0 {
            return Err(IntakeRepositoryError::StateMismatch);
        }
        connection
            .query_row(
                &intake_select("c.id=?1", None),
                [id],
                intake_candidate_from_row,
            )
            .map_err(IntakeRepositoryError::internal)
    }

    fn save_intake_apply_result(
        &self,
        id: i64,
        result: &IntakeApplyResult,
        applied_at: &str,
    ) -> Result<StoredIntakeCandidate, IntakeRepositoryError> {
        let connection = self.connection().map_err(IntakeRepositoryError::internal)?;
        let changed=connection.execute("UPDATE intake_candidates SET apply_state=?1,applied_at=?2,apply_error=?3,result_path=?4,result_url=?5 WHERE id=?6 AND status='approved'",params![result.state.as_str(),applied_at,result.error,result.result_path,result.result_url,id]).map_err(IntakeRepositoryError::internal)?;
        if changed == 0 {
            return Err(IntakeRepositoryError::StateMismatch);
        }
        connection
            .query_row(
                &intake_select("c.id=?1", None),
                [id],
                intake_candidate_from_row,
            )
            .map_err(IntakeRepositoryError::internal)
    }
}

impl SqliteTaskRepository {
    fn list_intake_where(
        &self,
        condition: &str,
        order: &str,
    ) -> Result<Vec<StoredIntakeCandidate>, IntakeRepositoryError> {
        let connection = self.connection().map_err(IntakeRepositoryError::internal)?;
        let sql = intake_select(condition, Some(order));
        let mut statement = connection
            .prepare(&sql)
            .map_err(IntakeRepositoryError::internal)?;
        statement
            .query_map([], intake_candidate_from_row)
            .map_err(IntakeRepositoryError::internal)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(IntakeRepositoryError::internal)
    }
}

fn intake_select(condition: &str, order: Option<&str>) -> String {
    format!(
        "SELECT c.id,c.date,c.slug,c.lane,c.text,c.note,c.line_no,d.source_path,d.source_note,c.status,c.decided_at,c.apply_state,c.applied_at,c.apply_error,c.result_path,c.result_url,c.received_at FROM intake_candidates c JOIN intake_days d ON d.date=c.date WHERE {condition}{}",
        order.map(|v| format!(" ORDER BY {v}")).unwrap_or_default()
    )
}

fn intake_candidate_from_row(row: &Row<'_>) -> rusqlite::Result<StoredIntakeCandidate> {
    let lane: String = row.get(3)?;
    let status: String = row.get(9)?;
    let apply: String = row.get(11)?;
    Ok(StoredIntakeCandidate {
        id: row.get(0)?,
        date: row.get(1)?,
        slug: row.get(2)?,
        lane: match lane.as_str() {
            "todo" => IntakeLane::Todo,
            "thought" => IntakeLane::Thought,
            "tone" => IntakeLane::Tone,
            _ => return Err(invalid_intake_value(3, "lane", lane)),
        },
        text: row.get(4)?,
        note: row.get(5)?,
        line_no: row.get(6)?,
        source_path: row.get(7)?,
        source_note: row.get(8)?,
        status: match status.as_str() {
            "proposed" => IntakeStatus::Proposed,
            "approved" => IntakeStatus::Approved,
            "rejected" => IntakeStatus::Rejected,
            _ => return Err(invalid_intake_value(9, "status", status)),
        },
        decided_at: row.get(10)?,
        apply_state: match apply.as_str() {
            "pending" => IntakeApplyState::Pending,
            "applied" => IntakeApplyState::Applied,
            "failed" => IntakeApplyState::Failed,
            _ => return Err(invalid_intake_value(11, "apply_state", apply)),
        },
        applied_at: row.get(12)?,
        apply_error: row.get(13)?,
        result_path: row.get(14)?,
        result_url: row.get(15)?,
        received_at: row.get(16)?,
    })
}
fn invalid_intake_value(index: usize, column: &'static str, value: String) -> rusqlite::Error {
    rusqlite::Error::FromSqlConversionFailure(
        index,
        Type::Text,
        Box::new(SqliteRepositoryError::InvalidStoredIntakeValue { column, value }),
    )
}

impl InboxRepository for SqliteTaskRepository {
    fn replace_inbox_batch(
        &self,
        batch: &InboxBatch,
        received_at: &str,
    ) -> Result<(), InboxRepositoryError> {
        let mut connection = self.connection().map_err(InboxRepositoryError::internal)?;
        let transaction = connection
            .transaction()
            .map_err(InboxRepositoryError::internal)?;
        let protected = transaction
            .query_row(
                "SELECT EXISTS(
                    SELECT 1 FROM inbox_items
                    WHERE source = ?1 AND date = ?2
                      AND (
                        status IN ('approved', 'rejected', 'chosen')
                        OR (kind IN ('approve', 'choose') AND apply_state <> 'pending')
                      )
                )",
                params![batch.source, batch.date],
                |row| row.get::<_, bool>(0),
            )
            .map_err(InboxRepositoryError::internal)?;
        if protected {
            return Err(InboxRepositoryError::Conflict);
        }

        transaction
            .execute(
                "DELETE FROM inbox_items WHERE source = ?1 AND date = ?2",
                params![batch.source, batch.date],
            )
            .map_err(InboxRepositoryError::internal)?;
        let item_count =
            i64::try_from(batch.items.len()).map_err(InboxRepositoryError::internal)?;
        transaction
            .execute(
                "INSERT INTO inbox_receipts (source, date, received_at, item_count)
                 VALUES (?1, ?2, ?3, ?4)
                 ON CONFLICT(source, date) DO UPDATE SET
                   received_at = excluded.received_at,
                   item_count = excluded.item_count",
                params![batch.source, batch.date, received_at, item_count],
            )
            .map_err(InboxRepositoryError::internal)?;
        {
            let mut statement = transaction
                .prepare(
                    "INSERT INTO inbox_items (
                        source, date, slug, kind, title, body_md, options_json, ref_path,
                        payload_json, expires_at, status, apply_state, received_at
                    ) VALUES (
                        ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13
                    )",
                )
                .map_err(InboxRepositoryError::internal)?;
            for item in &batch.items {
                let options = item
                    .options
                    .as_deref()
                    .map(inbox_options_json)
                    .transpose()?;
                let payload = item
                    .payload
                    .as_ref()
                    .map(serde_json::to_string)
                    .transpose()
                    .map_err(InboxRepositoryError::internal)?;
                statement
                    .execute(params![
                        batch.source,
                        batch.date,
                        item.slug,
                        item.kind.as_str(),
                        item.title,
                        item.body_md,
                        options,
                        item.ref_path,
                        payload,
                        item.expires_at,
                        item.status.as_str(),
                        item.apply_state.as_str(),
                        received_at,
                    ])
                    .map_err(InboxRepositoryError::internal)?;
            }
        }
        transaction.commit().map_err(InboxRepositoryError::internal)
    }

    fn list_open_inbox_items(
        &self,
        now: &str,
    ) -> Result<Vec<StoredInboxItem>, InboxRepositoryError> {
        self.list_inbox_items(
            "status = 'open' AND (expires_at IS NULL OR expires_at >= ?1)",
            "date DESC, id DESC",
            [now],
        )
    }

    fn list_decided_inbox_items(
        &self,
        source: &str,
    ) -> Result<Vec<StoredInboxItem>, InboxRepositoryError> {
        self.list_inbox_items(
            "source = ?1 AND status IN ('approved', 'chosen') AND apply_state = 'pending'",
            "date ASC, id ASC",
            [source],
        )
    }

    fn list_failed_inbox_items(&self) -> Result<Vec<StoredInboxItem>, InboxRepositoryError> {
        self.list_inbox_items("apply_state = 'failed'", "date DESC, id DESC", [])
    }

    fn get_inbox_item(&self, id: i64) -> Result<Option<StoredInboxItem>, InboxRepositoryError> {
        self.connection()
            .map_err(InboxRepositoryError::internal)?
            .query_row(
                &inbox_item_select("id = ?1", None),
                [id],
                inbox_item_from_row,
            )
            .optional()
            .map_err(InboxRepositoryError::internal)
    }

    fn save_inbox_decision(
        &self,
        id: i64,
        expected_status: InboxStatus,
        expected_apply_state: InboxApplyState,
        decision_status: InboxStatus,
        choice: Option<&str>,
        decided_at: &str,
    ) -> Result<StoredInboxItem, InboxRepositoryError> {
        let connection = self.connection().map_err(InboxRepositoryError::internal)?;
        let changed = connection
            .execute(
                "UPDATE inbox_items
                 SET status = ?1, choice = ?2, decided_at = ?3
                 WHERE id = ?4 AND status = ?5 AND apply_state = ?6",
                params![
                    decision_status.as_str(),
                    choice,
                    decided_at,
                    id,
                    expected_status.as_str(),
                    expected_apply_state.as_str(),
                ],
            )
            .map_err(InboxRepositoryError::internal)?;
        if changed == 0 {
            return Err(InboxRepositoryError::StateMismatch);
        }
        connection
            .query_row(
                &inbox_item_select("id = ?1", None),
                [id],
                inbox_item_from_row,
            )
            .map_err(InboxRepositoryError::internal)
    }

    fn save_inbox_apply_result(
        &self,
        id: i64,
        expected_status: InboxStatus,
        expected_apply_state: InboxApplyState,
        result: &InboxApplyResult,
        applied_at: &str,
    ) -> Result<StoredInboxItem, InboxRepositoryError> {
        let connection = self.connection().map_err(InboxRepositoryError::internal)?;
        let changed = connection
            .execute(
                "UPDATE inbox_items
                 SET apply_state = ?1, applied_at = ?2, apply_error = ?3,
                     result_path = ?4, result_url = ?5
                 WHERE id = ?6 AND status = ?7 AND apply_state = ?8",
                params![
                    result.state.as_str(),
                    applied_at,
                    result.error,
                    result.result_path,
                    result.result_url,
                    id,
                    expected_status.as_str(),
                    expected_apply_state.as_str(),
                ],
            )
            .map_err(InboxRepositoryError::internal)?;
        if changed == 0 {
            return Err(InboxRepositoryError::StateMismatch);
        }
        connection
            .query_row(
                &inbox_item_select("id = ?1", None),
                [id],
                inbox_item_from_row,
            )
            .map_err(InboxRepositoryError::internal)
    }

    fn inbox_summary(&self) -> Result<Vec<InboxSourceSummary>, InboxRepositoryError> {
        let connection = self.connection().map_err(InboxRepositoryError::internal)?;
        let mut statement = connection
            .prepare(
                "SELECT r.source, r.date, r.received_at, r.item_count,
                    COALESCE(SUM(CASE WHEN i.status = 'open' AND i.kind = 'approve' THEN 1 ELSE 0 END), 0),
                    COALESCE(SUM(CASE WHEN i.status = 'open' AND i.kind = 'choose' THEN 1 ELSE 0 END), 0),
                    COALESCE(SUM(CASE WHEN i.status = 'open' AND i.kind = 'read' THEN 1 ELSE 0 END), 0),
                    COALESCE(SUM(CASE WHEN i.status = 'open' AND i.kind = 'alert' THEN 1 ELSE 0 END), 0),
                    COALESCE(SUM(CASE WHEN i.apply_state = 'failed' THEN 1 ELSE 0 END), 0)
                 FROM inbox_receipts r
                 LEFT JOIN inbox_items i ON i.source = r.source
                 WHERE NOT EXISTS (
                    SELECT 1 FROM inbox_receipts newer
                    WHERE newer.source = r.source
                      AND (newer.date > r.date
                           OR (newer.date = r.date AND newer.received_at > r.received_at))
                 )
                 GROUP BY r.source, r.date, r.received_at, r.item_count
                 ORDER BY r.source ASC",
            )
            .map_err(InboxRepositoryError::internal)?;
        statement
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, i64>(3)?,
                    row.get::<_, i64>(4)?,
                    row.get::<_, i64>(5)?,
                    row.get::<_, i64>(6)?,
                    row.get::<_, i64>(7)?,
                    row.get::<_, i64>(8)?,
                ))
            })
            .map_err(InboxRepositoryError::internal)?
            .map(|row| {
                let (
                    source,
                    latest_date,
                    latest_received_at,
                    item_count,
                    approve,
                    choose,
                    read,
                    alert,
                    failed_count,
                ) = row.map_err(InboxRepositoryError::internal)?;
                Ok(InboxSourceSummary {
                    source,
                    latest_date,
                    latest_received_at,
                    latest_item_count: stored_count(item_count)?,
                    open_count: InboxOpenCount {
                        approve: stored_count(approve)?,
                        choose: stored_count(choose)?,
                        read: stored_count(read)?,
                        alert: stored_count(alert)?,
                    },
                    failed_count: stored_count(failed_count)?,
                })
            })
            .collect()
    }
}

impl SqliteTaskRepository {
    fn list_inbox_items<P: rusqlite::Params>(
        &self,
        condition: &str,
        order: &str,
        parameters: P,
    ) -> Result<Vec<StoredInboxItem>, InboxRepositoryError> {
        let connection = self.connection().map_err(InboxRepositoryError::internal)?;
        let mut statement = connection
            .prepare(&inbox_item_select(condition, Some(order)))
            .map_err(InboxRepositoryError::internal)?;
        statement
            .query_map(parameters, inbox_item_from_row)
            .map_err(InboxRepositoryError::internal)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(InboxRepositoryError::internal)
    }
}

fn inbox_item_select(condition: &str, order: Option<&str>) -> String {
    format!(
        "SELECT id, source, date, slug, kind, title, body_md, options_json, ref_path, payload_json,
                expires_at, status, choice, decided_at, apply_state, applied_at, apply_error,
                result_path, result_url, received_at
         FROM inbox_items WHERE {condition}{}",
        order
            .map(|value| format!(" ORDER BY {value}"))
            .unwrap_or_default()
    )
}

fn inbox_options_json(options: &[InboxOption]) -> Result<String, InboxRepositoryError> {
    serde_json::to_string(
        &options
            .iter()
            .map(|option| serde_json::json!({ "id": option.id, "label": option.label }))
            .collect::<Vec<_>>(),
    )
    .map_err(InboxRepositoryError::internal)
}

fn inbox_item_from_row(row: &Row<'_>) -> rusqlite::Result<StoredInboxItem> {
    let kind = row.get::<_, String>(4)?;
    let options_json = row.get::<_, Option<String>>(7)?;
    let payload_json = row.get::<_, Option<String>>(9)?;
    let status = row.get::<_, String>(11)?;
    let apply_state = row.get::<_, String>(14)?;
    Ok(StoredInboxItem {
        id: row.get(0)?,
        source: row.get(1)?,
        date: row.get(2)?,
        slug: row.get(3)?,
        kind: inbox_kind_from_stored(4, kind)?,
        title: row.get(5)?,
        body_md: row.get(6)?,
        options: options_json
            .map(|value| inbox_options_from_json(7, value))
            .transpose()?,
        ref_path: row.get(8)?,
        payload: payload_json
            .map(|value| {
                serde_json::from_str(&value)
                    .map_err(|_| invalid_inbox_value(9, "payload_json", value))
            })
            .transpose()?,
        expires_at: row.get(10)?,
        status: inbox_status_from_stored(11, status)?,
        choice: row.get(12)?,
        decided_at: row.get(13)?,
        apply_state: inbox_apply_state_from_stored(14, apply_state)?,
        applied_at: row.get(15)?,
        apply_error: row.get(16)?,
        result_path: row.get(17)?,
        result_url: row.get(18)?,
        received_at: row.get(19)?,
    })
}

fn inbox_options_from_json(index: usize, value: String) -> rusqlite::Result<Vec<InboxOption>> {
    let values: Vec<serde_json::Value> = serde_json::from_str(&value)
        .map_err(|_| invalid_inbox_value(index, "options_json", value.clone()))?;
    values
        .into_iter()
        .map(|option| {
            let Some(id) = option.get("id").and_then(serde_json::Value::as_str) else {
                return Err(invalid_inbox_value(index, "options_json", value.clone()));
            };
            let Some(label) = option.get("label").and_then(serde_json::Value::as_str) else {
                return Err(invalid_inbox_value(index, "options_json", value.clone()));
            };
            Ok(InboxOption {
                id: id.to_owned(),
                label: label.to_owned(),
            })
        })
        .collect()
}

fn inbox_kind_from_stored(index: usize, value: String) -> rusqlite::Result<InboxKind> {
    match value.as_str() {
        "approve" => Ok(InboxKind::Approve),
        "choose" => Ok(InboxKind::Choose),
        "read" => Ok(InboxKind::Read),
        "alert" => Ok(InboxKind::Alert),
        _ => Err(invalid_inbox_value(index, "kind", value)),
    }
}

fn inbox_status_from_stored(index: usize, value: String) -> rusqlite::Result<InboxStatus> {
    match value.as_str() {
        "open" => Ok(InboxStatus::Open),
        "approved" => Ok(InboxStatus::Approved),
        "rejected" => Ok(InboxStatus::Rejected),
        "chosen" => Ok(InboxStatus::Chosen),
        "read" => Ok(InboxStatus::Read),
        "acknowledged" => Ok(InboxStatus::Acknowledged),
        _ => Err(invalid_inbox_value(index, "status", value)),
    }
}

fn inbox_apply_state_from_stored(index: usize, value: String) -> rusqlite::Result<InboxApplyState> {
    match value.as_str() {
        "none" => Ok(InboxApplyState::None),
        "pending" => Ok(InboxApplyState::Pending),
        "applied" => Ok(InboxApplyState::Applied),
        "failed" => Ok(InboxApplyState::Failed),
        _ => Err(invalid_inbox_value(index, "apply_state", value)),
    }
}

fn invalid_inbox_value(index: usize, column: &'static str, value: String) -> rusqlite::Error {
    rusqlite::Error::FromSqlConversionFailure(
        index,
        Type::Text,
        Box::new(SqliteRepositoryError::InvalidStoredInboxValue { column, value }),
    )
}

fn stored_count(value: i64) -> Result<usize, InboxRepositoryError> {
    usize::try_from(value).map_err(|_| {
        InboxRepositoryError::internal(SqliteRepositoryError::InvalidStoredCount(value))
    })
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
    #[error("stored harness {column} value is invalid: {value}")]
    InvalidStoredHarnessValue { column: &'static str, value: String },
    #[error("stored intake {column} value is invalid: {value}")]
    InvalidStoredIntakeValue { column: &'static str, value: String },
    #[error("stored inbox {column} value is invalid: {value}")]
    InvalidStoredInboxValue { column: &'static str, value: String },
}

#[cfg(test)]
mod tests {
    use chrono::{DateTime, FixedOffset};
    use rusqlite::{Connection, params};

    use super::{
        MIGRATION_V1, MIGRATION_V2, MIGRATION_V3, MIGRATION_V4, MIGRATION_V5, MIGRATION_V6,
        SqliteTaskRepository,
    };
    use crate::{
        domain::{
            day::SummaryDay,
            harness::{
                ApplyResult, ApplyState, ChallengeVerdict, HarnessKind, HarnessProposal,
                HarnessProposalBatch, HarnessStatus, HarnessVerdict,
            },
            inbox::{
                InboxApplyResult, InboxApplyState, InboxBatch, InboxItem, InboxKind, InboxOption,
                InboxStatus,
            },
            intake::{IntakeBatch, IntakeItem, IntakeLane},
            routine::{Routine, RoutineFields},
            task::{CheckedTask, Task},
        },
        usecase::ports::{
            HarnessRepository, HarnessRepositoryError, InboxRepository, InboxRepositoryError,
            IntakeRepository, IntakeRepositoryError, RoutineRepository, RoutineRepositoryError,
            TaskRepository,
        },
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

    fn harness_batch(date: &str, slugs: &[&str]) -> HarnessProposalBatch {
        HarnessProposalBatch {
            date: date.to_owned(),
            kind: HarnessKind::Daily,
            proposals: slugs
                .iter()
                .map(|slug| HarnessProposal {
                    slug: (*slug).to_owned(),
                    insight_name: format!("insight-{slug}"),
                    verdict: HarnessVerdict::Adopt,
                    category: Some("experiment".to_owned()),
                    summary: format!("summary-{slug}"),
                    challenge_verdict: Some(ChallengeVerdict::Hold),
                    challenge_note: None,
                    detail_path: None,
                    detail_md: format!("# {slug}"),
                })
                .collect(),
        }
    }

    fn intake_batch(date: &str, slugs: &[&str]) -> IntakeBatch {
        IntakeBatch {
            date: date.to_owned(),
            source_path: format!("90_Meta/daily_intake/{date}.md"),
            source_note: None,
            items: slugs
                .iter()
                .map(|slug| IntakeItem {
                    slug: (*slug).to_owned(),
                    lane: IntakeLane::Thought,
                    text: format!("text-{slug}"),
                    note: None,
                    line_no: None,
                })
                .collect(),
        }
    }

    fn inbox_item(slug: &str, kind: InboxKind) -> InboxItem {
        InboxItem {
            slug: slug.to_owned(),
            kind,
            title: format!("title-{slug}"),
            body_md: None,
            options: (kind == InboxKind::Choose).then(|| {
                vec![
                    InboxOption {
                        id: "one".to_owned(),
                        label: "One".to_owned(),
                    },
                    InboxOption {
                        id: "two".to_owned(),
                        label: "Two".to_owned(),
                    },
                ]
            }),
            ref_path: None,
            payload: None,
            expires_at: None,
            status: InboxStatus::Open,
            apply_state: match kind {
                InboxKind::Approve | InboxKind::Choose => InboxApplyState::Pending,
                InboxKind::Read | InboxKind::Alert => InboxApplyState::None,
            },
        }
    }

    fn inbox_batch(source: &str, date: &str, items: Vec<InboxItem>) -> InboxBatch {
        InboxBatch {
            source: source.to_owned(),
            date: date.to_owned(),
            items,
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
                       AND name IN (
                         'digests', 'harness_proposals', 'inbox_items', 'inbox_receipts', 'intake_candidates', 'intake_days', 'learning_results', 'learning_sets',
                         'routines', 'task_days', 'task_checks'
                       )
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

        assert_eq!(version, 7);
        assert_eq!(
            tables,
            vec![
                "digests",
                "harness_proposals",
                "inbox_items",
                "inbox_receipts",
                "intake_candidates",
                "intake_days",
                "learning_results",
                "learning_sets",
                "routines",
                "task_checks",
                "task_days"
            ]
        );
        assert!(routine_index_exists);
    }

    #[test]
    fn migrates_version_three_with_existing_data_to_latest_schema() {
        let connection = Connection::open_in_memory().expect("in-memory SQLite should open");
        connection
            .execute_batch(MIGRATION_V1)
            .expect("version one schema should initialize");
        connection
            .execute_batch(MIGRATION_V2)
            .expect("version two schema should initialize");
        connection
            .execute_batch(MIGRATION_V3)
            .expect("version three schema should initialize");
        let version_before: i64 = connection
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .expect("version three should be readable");
        assert_eq!(version_before, 3);
        connection
            .execute(
                "INSERT INTO digests (date, body, received_at) VALUES (?1, ?2, ?3)",
                params!["2026-07-28", "existing digest", "2026-07-28T06:00:00+09:00"],
            )
            .expect("existing digest should insert");

        let repository = SqliteTaskRepository::from_connection(connection)
            .expect("version three database should migrate");
        let connection = repository
            .connection()
            .expect("repository connection should lock");
        let version: i64 = connection
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .expect("schema version should be readable");
        let existing_digest: String = connection
            .query_row(
                "SELECT body FROM digests WHERE date = ?1",
                ["2026-07-28"],
                |row| row.get(0),
            )
            .expect("existing digest should remain");

        connection
            .execute(
                "INSERT INTO learning_sets (date, raw, received_at) VALUES (?1, ?2, ?3)",
                params![
                    "2026-07-29",
                    r#"{"theme":"SQLite","lesson_md":"lesson","problems":[]}"#,
                    "2026-07-29T06:00:00+09:00"
                ],
            )
            .expect("learning set should insert after migration");
        connection
            .execute(
                "INSERT INTO learning_results (date, grades, feeling, completed_at)
                 VALUES (?1, ?2, ?3, ?4)",
                params![
                    "2026-07-29",
                    r#"[{"no":1,"grade":"o"}]"#,
                    "理解できた",
                    "2026-07-29T08:00:00+09:00"
                ],
            )
            .expect("learning result should insert after migration");
        let learning_rows: i64 = connection
            .query_row(
                "SELECT
                   (SELECT COUNT(*) FROM learning_sets)
                   + (SELECT COUNT(*) FROM learning_results)",
                [],
                |row| row.get(0),
            )
            .expect("learning tables should be queryable");

        assert_eq!(version, 7);
        assert_eq!(existing_digest, "existing digest");
        assert_eq!(learning_rows, 2);
    }

    #[test]
    fn migrates_version_four_learning_database_to_harness_schema() {
        let connection = Connection::open_in_memory().expect("in-memory SQLite should open");
        for migration in [MIGRATION_V1, MIGRATION_V2, MIGRATION_V3, MIGRATION_V4] {
            connection
                .execute_batch(migration)
                .expect("migration through version four should initialize");
        }
        connection
            .execute(
                "INSERT INTO learning_sets (date, raw, received_at) VALUES (?1, ?2, ?3)",
                params![
                    "2026-07-29",
                    r#"{"theme":"existing learning set"}"#,
                    "2026-07-29T06:00:00+09:00"
                ],
            )
            .expect("existing learning set should insert");
        let version_before: i64 = connection
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .expect("version four should be readable");
        assert_eq!(version_before, 4);

        let repository = SqliteTaskRepository::from_connection(connection)
            .expect("version four database should migrate");
        let connection = repository
            .connection()
            .expect("repository connection should lock");
        let version: i64 = connection
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .expect("schema version should be readable");
        let learning_raw: String = connection
            .query_row(
                "SELECT raw FROM learning_sets WHERE date = ?1",
                ["2026-07-29"],
                |row| row.get(0),
            )
            .expect("existing learning set should remain");
        connection
            .execute(
                "INSERT INTO harness_proposals (
                    date, kind, slug, insight_name, verdict, category, summary,
                    challenge_verdict, challenge_note, detail_path, detail_md,
                    status, decided_at, apply_state, applied_at, apply_error,
                    snapshot_path, received_at
                 ) VALUES (
                    ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9,
                    ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18
                 )",
                params![
                    "2026-07-29",
                    "daily",
                    "search-state",
                    "検索状態の外置き",
                    "experiment",
                    "⑥実験（新機軸）",
                    "外部メモを使う方式を試す",
                    "weaken",
                    "合格条件を明確にした",
                    "40_Projects/harness/判定/2026-07-29-search-state.md",
                    "# 判定",
                    "proposed",
                    Option::<String>::None,
                    "pending",
                    Option::<String>::None,
                    Option::<String>::None,
                    Option::<String>::None,
                    "2026-07-29T06:40:00+09:00"
                ],
            )
            .expect("harness proposal should insert after migration");
        let proposal_count: i64 = connection
            .query_row("SELECT COUNT(*) FROM harness_proposals", [], |row| {
                row.get(0)
            })
            .expect("harness proposals should be queryable");

        assert_eq!(version, 7);
        assert_eq!(learning_raw, r#"{"theme":"existing learning set"}"#);
        assert_eq!(proposal_count, 1);
    }

    #[test]
    fn migrates_version_five_database_through_intake_to_inbox_schema() {
        let connection = Connection::open_in_memory().unwrap();
        for migration in [
            MIGRATION_V1,
            MIGRATION_V2,
            MIGRATION_V3,
            MIGRATION_V4,
            MIGRATION_V5,
        ] {
            connection.execute_batch(migration).unwrap();
        }
        let version_before: i64 = connection
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .unwrap();
        assert_eq!(version_before, 5);
        let repository = SqliteTaskRepository::from_connection(connection).unwrap();
        let connection = repository.connection().unwrap();
        let version_after: i64 = connection
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .unwrap();
        assert_eq!(version_after, 7);
        for table in [
            "intake_days",
            "intake_candidates",
            "inbox_receipts",
            "inbox_items",
        ] {
            let exists: bool = connection
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name=?1)",
                    [table],
                    |row| row.get(0),
                )
                .unwrap();
            assert!(exists);
        }
    }

    #[test]
    fn rejects_duplicate_intake_date_and_slug() {
        let repository = repository();
        let connection = repository.connection().unwrap();
        connection.execute("INSERT INTO intake_days(date,source_path,item_count,received_at) VALUES('2026-08-28','opaque',2,'2026-08-29T00:41:00+09:00')",[]).unwrap();
        connection.execute("INSERT INTO intake_candidates(date,slug,lane,text,status,apply_state,received_at) VALUES('2026-08-28','same','todo','one','proposed','pending','now')",[]).unwrap();
        let duplicate=connection.execute("INSERT INTO intake_candidates(date,slug,lane,text,status,apply_state,received_at) VALUES('2026-08-28','same','tone','two','proposed','pending','now')",[]);
        assert!(matches!(
            duplicate,
            Err(rusqlite::Error::SqliteFailure(_, _))
        ));
    }

    #[test]
    fn migrates_version_six_database_to_inbox_schema() {
        let connection = Connection::open_in_memory().unwrap();
        for migration in [
            MIGRATION_V1,
            MIGRATION_V2,
            MIGRATION_V3,
            MIGRATION_V4,
            MIGRATION_V5,
            MIGRATION_V6,
        ] {
            connection.execute_batch(migration).unwrap();
        }
        let version_before: i64 = connection
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .unwrap();
        assert_eq!(version_before, 6);

        let repository = SqliteTaskRepository::from_connection(connection).unwrap();
        let connection = repository.connection().unwrap();
        let version_after: i64 = connection
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .unwrap();

        assert_eq!(version_after, 7);
    }

    #[test]
    fn rejects_duplicate_inbox_source_date_and_slug() {
        let repository = repository();
        let connection = repository.connection().unwrap();
        connection
            .execute(
                "INSERT INTO inbox_items (source, date, slug, kind, title, status, apply_state, received_at) \
                 VALUES ('night-harness', '2026-09-02', 'same', 'approve', 'one', 'open', 'pending', 'now')",
                [],
            )
            .unwrap();
        let duplicate = connection.execute(
            "INSERT INTO inbox_items (source, date, slug, kind, title, status, apply_state, received_at) \
             VALUES ('night-harness', '2026-09-02', 'same', 'alert', 'two', 'open', 'none', 'now')",
            [],
        );

        assert!(matches!(
            duplicate,
            Err(rusqlite::Error::SqliteFailure(_, _))
        ));
    }

    #[test]
    fn rejects_duplicate_inbox_receipt_source_and_date() {
        let repository = repository();
        let connection = repository.connection().unwrap();
        connection
            .execute(
                "INSERT INTO inbox_receipts (source, date, received_at, item_count) \
                 VALUES ('night-harness', '2026-09-02', 'now', 1)",
                [],
            )
            .unwrap();
        let duplicate = connection.execute(
            "INSERT INTO inbox_receipts (source, date, received_at, item_count) \
             VALUES ('night-harness', '2026-09-02', 'later', 2)",
            [],
        );

        assert!(matches!(
            duplicate,
            Err(rusqlite::Error::SqliteFailure(_, _))
        ));
    }

    #[test]
    fn failed_intake_replacement_rolls_back_parent_and_candidates() {
        let repository = repository();
        repository
            .replace_intake_candidates(
                &intake_batch("2026-08-28", &["original"]),
                "2026-08-29T00:41:00+09:00",
            )
            .unwrap();
        repository.connection().unwrap().execute_batch("CREATE TRIGGER reject_intake BEFORE INSERT ON intake_candidates WHEN NEW.slug='explode' BEGIN SELECT RAISE(ABORT,'explode'); END;").unwrap();
        assert!(matches!(
            repository.replace_intake_candidates(
                &intake_batch("2026-08-28", &["partial", "explode"]),
                "2026-08-30T00:41:00+09:00"
            ),
            Err(IntakeRepositoryError::Internal { .. })
        ));
        let rows = repository.list_proposed_intake().unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].slug, "original");
        let receipt = repository.latest_intake_receipt().unwrap().unwrap();
        assert_eq!(receipt.received_at, "2026-08-29T00:41:00+09:00");
        assert_eq!(receipt.item_count, 1);
    }

    #[test]
    fn non_pending_intake_row_blocks_replacement() {
        let repository = repository();
        repository
            .replace_intake_candidates(&intake_batch("2026-08-28", &["one"]), "now")
            .unwrap();
        repository
            .connection()
            .unwrap()
            .execute(
                "UPDATE intake_candidates SET apply_state='failed' WHERE date='2026-08-28'",
                [],
            )
            .unwrap();
        assert!(matches!(
            repository.replace_intake_candidates(&intake_batch("2026-08-28", &["two"]), "later"),
            Err(IntakeRepositoryError::Conflict)
        ));
    }

    #[test]
    fn rejects_duplicate_harness_proposal_date_and_slug() {
        let repository = repository();
        let connection = repository
            .connection()
            .expect("repository connection should lock");
        let insert = |slug: &str| {
            connection.execute(
                "INSERT INTO harness_proposals (
                    date, kind, slug, insight_name, verdict, summary, detail_md,
                    status, apply_state, received_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                params![
                    "2026-07-29",
                    "daily",
                    slug,
                    "検索状態の外置き",
                    "experiment",
                    "外部メモを使う方式を試す",
                    "# 判定",
                    "proposed",
                    "pending",
                    "2026-07-29T06:40:00+09:00"
                ],
            )
        };

        insert("search-state").expect("first proposal should insert");
        let duplicate = insert("search-state").expect_err("duplicate should be rejected");

        assert!(matches!(
            duplicate,
            rusqlite::Error::SqliteFailure(error, _)
                if error.extended_code == rusqlite::ffi::SQLITE_CONSTRAINT_UNIQUE
        ));
    }

    #[test]
    fn failed_harness_batch_replacement_rolls_back_delete_and_partial_inserts() {
        let repository = repository();
        repository
            .replace_harness_proposals(
                &harness_batch("2026-07-29", &["original"]),
                "2026-07-29T06:40:00+09:00",
            )
            .expect("original batch should save");
        repository
            .connection()
            .expect("repository connection should lock")
            .execute_batch(
                "CREATE TRIGGER reject_exploding_harness_proposal
                 BEFORE INSERT ON harness_proposals
                 WHEN NEW.slug = 'explode'
                 BEGIN
                   SELECT RAISE(ABORT, 'injected insert failure');
                 END;",
            )
            .expect("failure trigger should install");

        assert!(
            repository
                .replace_harness_proposals(
                    &harness_batch("2026-07-29", &["partial", "explode"]),
                    "2026-07-29T07:00:00+09:00",
                )
                .is_err()
        );
        let stored = repository
            .list_harness_proposals("2026-07-29")
            .expect("original batch should remain queryable");

        assert_eq!(
            stored
                .iter()
                .map(|proposal| proposal.slug.as_str())
                .collect::<Vec<_>>(),
            vec!["original"]
        );
        assert_eq!(stored[0].received_at, "2026-07-29T06:40:00+09:00");
    }

    #[test]
    fn harness_replacement_allows_killed_but_rejects_decisions_and_non_pending_rows() {
        let repository = repository();
        let mut replaceable = harness_batch("2026-07-29", &["killed", "proposed"]);
        replaceable.proposals[0].verdict = HarnessVerdict::Killed;
        replaceable.proposals[0].challenge_verdict = None;
        repository
            .replace_harness_proposals(&replaceable, "2026-07-29T06:40:00+09:00")
            .expect("killed and proposed batch should save");
        repository
            .replace_harness_proposals(
                &harness_batch("2026-07-29", &["replacement"]),
                "2026-07-29T07:00:00+09:00",
            )
            .expect("killed and proposed rows should be replaceable");

        let mut killed_only = harness_batch("2026-07-30", &["killed-only"]);
        killed_only.proposals[0].verdict = HarnessVerdict::Killed;
        killed_only.proposals[0].challenge_verdict = None;
        repository
            .replace_harness_proposals(&killed_only, "2026-07-30T06:40:00+09:00")
            .expect("killed-only batch should save");
        repository
            .replace_harness_proposals(
                &harness_batch("2026-07-30", &["replacement"]),
                "2026-07-30T07:00:00+09:00",
            )
            .expect("killed-only rows should be replaceable");

        for (date, status) in [
            ("2026-07-27", HarnessStatus::Approved),
            ("2026-07-28", HarnessStatus::Rejected),
        ] {
            repository
                .replace_harness_proposals(
                    &harness_batch(date, &["decided"]),
                    "2026-07-29T06:40:00+09:00",
                )
                .expect("batch should save");
            let id = repository
                .list_harness_proposals(date)
                .expect("batch should list")[0]
                .id;
            repository
                .save_harness_decision(
                    id,
                    HarnessStatus::Proposed,
                    status,
                    "2026-07-29T08:00:00+09:00",
                )
                .expect("decision should save");
            assert!(matches!(
                repository.replace_harness_proposals(
                    &harness_batch(date, &["blocked"]),
                    "2026-07-29T09:00:00+09:00",
                ),
                Err(HarnessRepositoryError::Conflict)
            ));
        }

        repository
            .replace_harness_proposals(
                &harness_batch("2026-07-26", &["non-pending"]),
                "2026-07-29T06:40:00+09:00",
            )
            .expect("batch should save");
        repository
            .connection()
            .expect("repository connection should lock")
            .execute(
                "UPDATE harness_proposals
                 SET apply_state = 'failed'
                 WHERE date = '2026-07-26'",
                [],
            )
            .expect("non-pending state should be injected");
        assert!(matches!(
            repository.replace_harness_proposals(
                &harness_batch("2026-07-26", &["blocked"]),
                "2026-07-29T09:00:00+09:00",
            ),
            Err(HarnessRepositoryError::Conflict)
        ));
    }

    #[test]
    fn harness_repository_round_trip_preserves_guards_order_and_apply_retries() {
        let repository = repository();
        let mut current_batch = harness_batch("2026-07-29", &["current", "refuted"]);
        current_batch.proposals[1].verdict = HarnessVerdict::Killed;
        current_batch.proposals[1].challenge_verdict = None;
        repository
            .replace_harness_proposals(&current_batch, "2026-07-29T06:40:00+09:00")
            .expect("current batch should save");
        let current_rows = repository
            .list_harness_proposals("2026-07-29")
            .expect("current batch should list");
        assert_eq!(current_rows[0].status, HarnessStatus::Proposed);
        assert_eq!(current_rows[1].status, HarnessStatus::Killed);

        let current = repository
            .save_harness_decision(
                current_rows[0].id,
                HarnessStatus::Proposed,
                HarnessStatus::Approved,
                "2026-07-29T08:00:00+09:00",
            )
            .expect("decision should save");
        assert_eq!(current.status, HarnessStatus::Approved);
        assert!(matches!(
            repository.replace_harness_proposals(
                &harness_batch("2026-07-29", &["replacement"]),
                "2026-07-29T09:00:00+09:00",
            ),
            Err(crate::usecase::ports::HarnessRepositoryError::Conflict)
        ));

        repository
            .replace_harness_proposals(
                &harness_batch("2026-07-28", &["older"]),
                "2026-07-28T06:40:00+09:00",
            )
            .expect("older batch should save");
        let older = repository
            .list_harness_proposals("2026-07-28")
            .expect("older batch should list")
            .remove(0);
        repository
            .save_harness_decision(
                older.id,
                HarnessStatus::Proposed,
                HarnessStatus::Approved,
                "2026-07-28T08:00:00+09:00",
            )
            .expect("older decision should save");
        assert_eq!(
            repository
                .list_pending_approved()
                .expect("pending approved proposals should list")
                .iter()
                .map(|proposal| proposal.slug.as_str())
                .collect::<Vec<_>>(),
            vec!["older", "current"]
        );

        let failed = repository
            .save_harness_apply_result(
                current.id,
                &ApplyResult {
                    state: ApplyState::Failed,
                    snapshot_path: None,
                    error: Some("destination exists".to_owned()),
                },
                "2026-07-30T06:20:00+09:00",
            )
            .expect("failed result should save");
        assert_eq!(failed.apply_state, ApplyState::Failed);
        assert_eq!(failed.apply_error.as_deref(), Some("destination exists"));
        assert_eq!(
            repository
                .list_failed()
                .expect("failed proposals should list")
                .iter()
                .map(|proposal| proposal.slug.as_str())
                .collect::<Vec<_>>(),
            vec!["current"]
        );

        let applied = repository
            .save_harness_apply_result(
                current.id,
                &ApplyResult {
                    state: ApplyState::Applied,
                    snapshot_path: Some("archive/current".to_owned()),
                    error: None,
                },
                "2026-07-30T06:30:00+09:00",
            )
            .expect("applied retry should save");
        assert_eq!(applied.apply_state, ApplyState::Applied);
        assert_eq!(applied.snapshot_path.as_deref(), Some("archive/current"));
        assert!(applied.apply_error.is_none());
        assert!(
            repository
                .list_failed()
                .expect("applied retry should leave failed list")
                .is_empty()
        );
    }

    #[test]
    fn decision_cas_rejects_a_stale_read_after_apply_result() {
        let repository = repository();
        repository
            .replace_harness_proposals(
                &harness_batch("2026-07-29", &["apply-first"]),
                "2026-07-29T06:40:00+09:00",
            )
            .expect("batch should save");
        let proposed = repository
            .list_harness_proposals("2026-07-29")
            .expect("batch should list")
            .remove(0);
        repository
            .save_harness_decision(
                proposed.id,
                HarnessStatus::Proposed,
                HarnessStatus::Approved,
                "2026-07-29T08:00:00+09:00",
            )
            .expect("proposal should be approved");
        let stale_for_decision = repository
            .get_harness_proposal(proposed.id)
            .expect("proposal read should succeed")
            .expect("proposal should exist");

        repository
            .save_harness_apply_result(
                proposed.id,
                &ApplyResult {
                    state: ApplyState::Applied,
                    snapshot_path: Some("archive/apply-first".to_owned()),
                    error: None,
                },
                "2026-07-30T06:20:00+09:00",
            )
            .expect("apply result should win the race");

        assert!(matches!(
            repository.save_harness_decision(
                proposed.id,
                stale_for_decision.status,
                HarnessStatus::Rejected,
                "2026-07-30T06:20:01+09:00",
            ),
            Err(HarnessRepositoryError::StateMismatch)
        ));
        let stored = repository
            .get_harness_proposal(proposed.id)
            .expect("proposal read should succeed")
            .expect("proposal should exist");
        assert_eq!(stored.status, HarnessStatus::Approved);
        assert_eq!(stored.apply_state, ApplyState::Applied);
    }

    #[test]
    fn apply_result_cas_rejects_a_stale_read_after_decision() {
        let repository = repository();
        repository
            .replace_harness_proposals(
                &harness_batch("2026-07-29", &["decision-first"]),
                "2026-07-29T06:40:00+09:00",
            )
            .expect("batch should save");
        let proposed = repository
            .list_harness_proposals("2026-07-29")
            .expect("batch should list")
            .remove(0);
        repository
            .save_harness_decision(
                proposed.id,
                HarnessStatus::Proposed,
                HarnessStatus::Approved,
                "2026-07-29T08:00:00+09:00",
            )
            .expect("proposal should be approved");
        let stale_for_apply = repository
            .get_harness_proposal(proposed.id)
            .expect("proposal read should succeed")
            .expect("proposal should exist");

        repository
            .save_harness_decision(
                proposed.id,
                stale_for_apply.status,
                HarnessStatus::Rejected,
                "2026-07-30T06:20:00+09:00",
            )
            .expect("decision should win the race");

        assert!(matches!(
            repository.save_harness_apply_result(
                proposed.id,
                &ApplyResult {
                    state: ApplyState::Applied,
                    snapshot_path: Some("archive/decision-first".to_owned()),
                    error: None,
                },
                "2026-07-30T06:20:01+09:00",
            ),
            Err(HarnessRepositoryError::StateMismatch)
        ));
        let stored = repository
            .get_harness_proposal(proposed.id)
            .expect("proposal read should succeed")
            .expect("proposal should exist");
        assert_eq!(stored.status, HarnessStatus::Rejected);
        assert_eq!(stored.apply_state, ApplyState::Pending);
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

        assert_eq!(version, 7);
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
            "migration v1→v7: user_version={version}, existing_task_days=1, \
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

    #[test]
    fn inbox_replacement_is_atomic_and_protects_human_and_apply_states() {
        let repository = repository();
        let first = inbox_batch(
            "night-harness",
            "2026-09-02",
            vec![inbox_item("first", InboxKind::Approve)],
        );
        repository
            .replace_inbox_batch(&first, "2026-09-02T06:00:00+09:00")
            .unwrap();
        repository
            .replace_inbox_batch(
                &inbox_batch(
                    "night-harness",
                    "2026-09-02",
                    vec![inbox_item("replacement-a", InboxKind::Approve)],
                ),
                "2026-09-02T07:00:00+09:00",
            )
            .unwrap();
        let replacement = repository
            .list_open_inbox_items("2026-09-02T08:00:00+09:00")
            .unwrap();
        assert_eq!(
            replacement
                .iter()
                .map(|item| item.slug.as_str())
                .collect::<Vec<_>>(),
            ["replacement-a"]
        );

        let id = replacement[0].id;
        repository
            .save_inbox_decision(
                id,
                InboxStatus::Open,
                InboxApplyState::Pending,
                InboxStatus::Approved,
                None,
                "2026-09-02T08:10:00+09:00",
            )
            .unwrap();
        assert!(matches!(
            repository.replace_inbox_batch(&first, "2026-09-02T08:11:00+09:00"),
            Err(InboxRepositoryError::Conflict)
        ));
        assert_eq!(
            repository.get_inbox_item(id).unwrap().unwrap().status,
            InboxStatus::Approved
        );

        for (date, kind, status) in [
            ("2026-09-03", InboxKind::Approve, InboxStatus::Rejected),
            ("2026-09-04", InboxKind::Choose, InboxStatus::Chosen),
        ] {
            let batch = inbox_batch("night-harness", date, vec![inbox_item("item", kind)]);
            repository
                .replace_inbox_batch(&batch, "2026-09-04T06:00:00+09:00")
                .unwrap();
            let item = repository
                .list_open_inbox_items("2026-09-05T00:00:00+09:00")
                .unwrap()
                .into_iter()
                .find(|item| item.date == date)
                .unwrap();
            repository
                .save_inbox_decision(
                    item.id,
                    InboxStatus::Open,
                    InboxApplyState::Pending,
                    status,
                    (status == InboxStatus::Chosen).then_some("one"),
                    "2026-09-04T06:10:00+09:00",
                )
                .unwrap();
            assert!(matches!(
                repository.replace_inbox_batch(&batch, "2026-09-04T06:11:00+09:00"),
                Err(InboxRepositoryError::Conflict)
            ));
        }

        let batch = inbox_batch(
            "night-harness",
            "2026-09-05",
            vec![inbox_item("apply", InboxKind::Approve)],
        );
        repository
            .replace_inbox_batch(&batch, "2026-09-05T06:00:00+09:00")
            .unwrap();
        let item = repository
            .list_open_inbox_items("2026-09-05T07:00:00+09:00")
            .unwrap()
            .into_iter()
            .find(|item| item.date == "2026-09-05")
            .unwrap();
        let decided = repository
            .save_inbox_decision(
                item.id,
                InboxStatus::Open,
                InboxApplyState::Pending,
                InboxStatus::Approved,
                None,
                "2026-09-05T07:01:00+09:00",
            )
            .unwrap();
        repository
            .save_inbox_apply_result(
                decided.id,
                InboxStatus::Approved,
                InboxApplyState::Pending,
                &InboxApplyResult {
                    state: InboxApplyState::Failed,
                    result_path: None,
                    result_url: None,
                    error: Some("temporary failure".to_owned()),
                },
                "2026-09-05T07:02:00+09:00",
            )
            .unwrap();
        assert!(matches!(
            repository.replace_inbox_batch(&batch, "2026-09-05T07:03:00+09:00"),
            Err(InboxRepositoryError::Conflict)
        ));
    }

    #[test]
    fn inbox_read_and_alert_replacement_reopens_and_empty_batches_keep_receipts() {
        let repository = repository();
        let batch = inbox_batch(
            "routine_watchdog",
            "2026-09-02",
            vec![
                inbox_item("report", InboxKind::Read),
                inbox_item("warning", InboxKind::Alert),
            ],
        );
        repository
            .replace_inbox_batch(&batch, "2026-09-02T06:00:00+09:00")
            .unwrap();
        let items = repository
            .list_open_inbox_items("2026-09-02T06:01:00+09:00")
            .unwrap();
        for item in items {
            let status = match item.kind {
                InboxKind::Read => InboxStatus::Read,
                InboxKind::Alert => InboxStatus::Acknowledged,
                _ => unreachable!(),
            };
            repository
                .save_inbox_decision(
                    item.id,
                    InboxStatus::Open,
                    InboxApplyState::None,
                    status,
                    None,
                    "2026-09-02T06:02:00+09:00",
                )
                .unwrap();
        }
        repository
            .replace_inbox_batch(&batch, "2026-09-02T06:03:00+09:00")
            .unwrap();
        let reopened = repository
            .list_open_inbox_items("2026-09-02T06:04:00+09:00")
            .unwrap();
        assert_eq!(reopened.len(), 2);
        assert!(reopened.iter().all(|item| item.status == InboxStatus::Open));

        repository
            .replace_inbox_batch(
                &inbox_batch("routine_watchdog", "2026-09-02", vec![]),
                "2026-09-02T06:05:00+09:00",
            )
            .unwrap();
        assert!(
            repository
                .list_open_inbox_items("2026-09-02T06:06:00+09:00")
                .unwrap()
                .is_empty()
        );
        let summary = repository.inbox_summary().unwrap();
        assert_eq!(summary.len(), 1);
        assert_eq!(summary[0].latest_item_count, 0);
        assert_eq!(summary[0].latest_received_at, "2026-09-02T06:05:00+09:00");
    }

    #[test]
    fn inbox_queries_and_summary_follow_specified_ordering_and_counts() {
        let repository = repository();
        let mut expired = inbox_item("expired", InboxKind::Alert);
        expired.expires_at = Some("2026-09-02T06:00:00+09:00".to_owned());
        repository
            .replace_inbox_batch(
                &inbox_batch("sender-a", "2026-09-01", vec![expired]),
                "2026-09-01T06:00:00+09:00",
            )
            .unwrap();
        repository
            .replace_inbox_batch(
                &inbox_batch(
                    "sender-a",
                    "2026-09-03",
                    vec![
                        inbox_item("newest", InboxKind::Read),
                        inbox_item("approve", InboxKind::Approve),
                    ],
                ),
                "2026-09-03T06:00:00+09:00",
            )
            .unwrap();
        repository
            .replace_inbox_batch(
                &inbox_batch(
                    "sender-b",
                    "2026-09-02",
                    vec![inbox_item("other", InboxKind::Choose)],
                ),
                "2026-09-02T06:00:00+09:00",
            )
            .unwrap();

        let open = repository
            .list_open_inbox_items("2026-09-02T07:00:00+09:00")
            .unwrap();
        assert_eq!(
            open.iter()
                .map(|item| item.slug.as_str())
                .collect::<Vec<_>>(),
            ["approve", "newest", "other"]
        );

        let approve = open.iter().find(|item| item.slug == "approve").unwrap();
        let approved = repository
            .save_inbox_decision(
                approve.id,
                InboxStatus::Open,
                InboxApplyState::Pending,
                InboxStatus::Approved,
                None,
                "2026-09-03T07:00:00+09:00",
            )
            .unwrap();
        let other = open.iter().find(|item| item.slug == "other").unwrap();
        repository
            .save_inbox_decision(
                other.id,
                InboxStatus::Open,
                InboxApplyState::Pending,
                InboxStatus::Chosen,
                Some("one"),
                "2026-09-02T07:00:00+09:00",
            )
            .unwrap();
        repository
            .save_inbox_apply_result(
                approved.id,
                InboxStatus::Approved,
                InboxApplyState::Pending,
                &InboxApplyResult {
                    state: InboxApplyState::Failed,
                    result_path: None,
                    result_url: None,
                    error: Some("failed".to_owned()),
                },
                "2026-09-03T08:00:00+09:00",
            )
            .unwrap();

        repository
            .replace_inbox_batch(
                &inbox_batch(
                    "sender-a",
                    "2026-09-04",
                    vec![inbox_item("sender-a-decided", InboxKind::Approve)],
                ),
                "2026-09-04T06:00:00+09:00",
            )
            .unwrap();
        repository
            .replace_inbox_batch(
                &inbox_batch(
                    "sender-b",
                    "2026-09-04",
                    vec![inbox_item("other-newer", InboxKind::Choose)],
                ),
                "2026-09-04T06:00:00+09:00",
            )
            .unwrap();
        for (slug, status, choice) in [
            ("sender-a-decided", InboxStatus::Approved, None),
            ("other-newer", InboxStatus::Chosen, Some("one")),
        ] {
            let item = repository
                .list_open_inbox_items("2026-09-04T07:00:00+09:00")
                .unwrap()
                .into_iter()
                .find(|item| item.slug == slug)
                .unwrap();
            repository
                .save_inbox_decision(
                    item.id,
                    InboxStatus::Open,
                    InboxApplyState::Pending,
                    status,
                    choice,
                    "2026-09-04T07:00:00+09:00",
                )
                .unwrap();
        }

        let decided = repository.list_decided_inbox_items("sender-b").unwrap();
        assert_eq!(
            decided
                .iter()
                .map(|item| (item.slug.as_str(), item.date.as_str()))
                .collect::<Vec<_>>(),
            [("other", "2026-09-02"), ("other-newer", "2026-09-04")]
        );
        assert_eq!(
            repository.list_failed_inbox_items().unwrap()[0].slug,
            "approve"
        );

        let summary = repository.inbox_summary().unwrap();
        assert_eq!(summary.len(), 2);
        assert_eq!(summary[0].source, "sender-a");
        assert_eq!(summary[0].latest_date, "2026-09-04");
        assert_eq!(summary[0].latest_item_count, 1);
        assert_eq!(summary[0].open_count.read, 1);
        assert_eq!(summary[0].failed_count, 1);
        assert_eq!(summary[1].source, "sender-b");
        assert_eq!(summary[1].open_count.choose, 0);
        assert_eq!(summary[1].failed_count, 0);
    }
}
