use std::error::Error;

use chrono::{DateTime, FixedOffset};
use thiserror::Error;

use crate::domain::{
    day::SummaryDay,
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
