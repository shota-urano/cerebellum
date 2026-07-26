use std::{
    path::{Path, PathBuf},
    sync::{Mutex, MutexGuard},
};

use rusqlite::Connection;
use thiserror::Error;

use crate::usecase::ports::{RepositoryError, TaskRepository};

pub struct SqliteTaskRepository {
    connection: Mutex<Connection>,
}

impl SqliteTaskRepository {
    pub fn open(path: &Path) -> Result<Self, SqliteRepositoryError> {
        let connection = Connection::open(path).map_err(|source| SqliteRepositoryError::Open {
            path: path.to_path_buf(),
            source,
        })?;

        Ok(Self {
            connection: Mutex::new(connection),
        })
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
}

impl TaskRepository for SqliteTaskRepository {
    fn health_check(&self) -> Result<(), RepositoryError> {
        self.check_connection().map_err(RepositoryError::new)
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
    #[error("SQLite connection lock is poisoned")]
    ConnectionLock,
    #[error("SQLite health check failed")]
    Health(#[source] rusqlite::Error),
}
