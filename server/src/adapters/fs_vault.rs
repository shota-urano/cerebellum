use std::{
    fs, io,
    path::{Path, PathBuf},
};

use thiserror::Error;

use crate::usecase::ports::{VaultReader, VaultReaderError};

pub struct FsVaultReader {
    routine_path: PathBuf,
}

impl FsVaultReader {
    pub fn new(routine_path: impl Into<PathBuf>) -> Self {
        Self {
            routine_path: routine_path.into(),
        }
    }

    fn read(&self) -> Result<String, FsVaultError> {
        fs::read_to_string(&self.routine_path).map_err(|source| FsVaultError::Read {
            path: self.routine_path.clone(),
            source,
        })
    }
}

impl VaultReader for FsVaultReader {
    fn read_routine_markdown(&self) -> Result<String, VaultReaderError> {
        self.read().map_err(VaultReaderError::new)
    }
}

#[derive(Debug, Error)]
pub enum FsVaultError {
    #[error("failed to read routine markdown at {}", path.display())]
    Read {
        path: PathBuf,
        #[source]
        source: io::Error,
    },
}

impl AsRef<Path> for FsVaultReader {
    fn as_ref(&self) -> &Path {
        &self.routine_path
    }
}
