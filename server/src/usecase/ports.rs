use std::error::Error;

use chrono::{DateTime, FixedOffset};
use thiserror::Error;

use crate::domain::{
    day::SummaryDay,
    routine::{Routine, RoutineFields},
    task::{CheckedTask, Task},
};

pub trait VaultReader: Send + Sync {
    fn read_routine_markdown(&self) -> Result<String, VaultReaderError>;
}

pub trait TaskRepository: Send + Sync {
    fn health_check(&self) -> Result<(), RepositoryError>;
    fn snapshot_exists(&self, date: &str) -> Result<bool, RepositoryError>;
    fn insert_snapshot(&self, date: &str, tasks: &[Task]) -> Result<(), RepositoryError>;
    fn get_tasks(&self, date: &str) -> Result<Vec<CheckedTask>, RepositoryError>;
    fn toggle_check(
        &self,
        date: &str,
        task_id: &str,
        checked_at: DateTime<FixedOffset>,
    ) -> Result<(), RepositoryError>;
    fn get_summary(
        &self,
        start_date: &str,
        end_date: &str,
    ) -> Result<Vec<SummaryDay>, RepositoryError>;
}

pub trait RoutineRepository: Send + Sync {
    fn list_routines(&self, include_inactive: bool)
    -> Result<Vec<Routine>, RoutineRepositoryError>;
    fn get_routine(&self, id: i64) -> Result<Option<Routine>, RoutineRepositoryError>;
    fn insert_routine(
        &self,
        fields: &RoutineFields,
        timestamp: &str,
    ) -> Result<Routine, RoutineRepositoryError>;
    fn update_routine(
        &self,
        id: i64,
        fields: &RoutineFields,
        updated_at: &str,
    ) -> Result<Option<Routine>, RoutineRepositoryError>;
    fn deactivate_routine(
        &self,
        id: i64,
        updated_at: &str,
    ) -> Result<Option<Routine>, RoutineRepositoryError>;
    fn count_active_routines(&self) -> Result<usize, RoutineRepositoryError>;
}

pub trait RoutineImportRepository: Send + Sync {
    fn count_active_routines(&self) -> Result<usize, RoutineImportRepositoryError>;
    fn import_routines(
        &self,
        routines: &[RoutineFields],
        timestamp: &str,
        force: bool,
    ) -> Result<usize, RoutineImportRepositoryError>;
}

/// 朝ダイジェストの保存と取得（docs/specs/11-digest.md）。原文をそのまま持つ。
pub trait DigestRepository: Send + Sync {
    fn save_digest(&self, date: &str, body: &str, received_at: &str)
    -> Result<(), RepositoryError>;
    fn get_digest(&self, date: &str) -> Result<Option<StoredDigest>, RepositoryError>;
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StoredDigest {
    pub body: String,
    pub received_at: String,
}

pub trait Clock: Send + Sync {
    fn now(&self) -> DateTime<FixedOffset>;
}

#[derive(Debug, Error)]
#[error("vault reader failed")]
pub struct VaultReaderError {
    #[source]
    source: Box<dyn Error + Send + Sync>,
}

impl VaultReaderError {
    pub fn new(error: impl Error + Send + Sync + 'static) -> Self {
        Self {
            source: Box::new(error),
        }
    }
}

#[derive(Debug, Error)]
#[error("task repository failed")]
pub struct RepositoryError {
    #[source]
    source: Box<dyn Error + Send + Sync>,
}

impl RepositoryError {
    pub fn new(error: impl Error + Send + Sync + 'static) -> Self {
        Self {
            source: Box::new(error),
        }
    }
}

#[derive(Debug, Error)]
pub enum RoutineRepositoryError {
    #[error("an active routine with the same identity already exists")]
    Conflict,
    #[error("routine repository failed")]
    Internal {
        #[source]
        source: Box<dyn Error + Send + Sync>,
    },
}

impl RoutineRepositoryError {
    pub fn internal(error: impl Error + Send + Sync + 'static) -> Self {
        Self::Internal {
            source: Box::new(error),
        }
    }
}

#[derive(Debug, Error)]
pub enum RoutineImportRepositoryError {
    #[error("{count} active routines already exist")]
    ActiveRoutinesExist { count: usize },
    #[error("routine import repository failed")]
    Internal {
        #[source]
        source: Box<dyn Error + Send + Sync>,
    },
}

impl RoutineImportRepositoryError {
    pub fn internal(error: impl Error + Send + Sync + 'static) -> Self {
        Self::Internal {
            source: Box::new(error),
        }
    }
}
