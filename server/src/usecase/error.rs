use std::error::Error;

use thiserror::Error;

use super::ports::VaultReaderError;

#[derive(Debug, Error)]
pub enum UsecaseError {
    #[error("bad request: {0}")]
    BadRequest(String),
    #[error("day is read-only: {0}")]
    ReadonlyDay(String),
    #[error("resource not found: {0}")]
    NotFound(String),
    #[error("vault is unavailable")]
    VaultUnavailable(#[source] VaultReaderError),
    #[error("internal error")]
    Internal(#[source] Box<dyn Error + Send + Sync>),
}
