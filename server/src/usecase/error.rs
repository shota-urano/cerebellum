use std::error::Error;

use thiserror::Error;

#[derive(Debug, Error)]
pub enum UsecaseError {
    #[error("bad request: {0}")]
    BadRequest(String),
    #[error("day is read-only: {0}")]
    ReadonlyDay(String),
    #[error("resource not found: {0}")]
    NotFound(String),
    #[error("conflict: {0}")]
    Conflict(String),
    #[error("internal error")]
    Internal(#[source] Box<dyn Error + Send + Sync>),
}
