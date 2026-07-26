use thiserror::Error;

#[derive(Debug, Error, PartialEq, Eq)]
pub enum DomainError {
    #[error("weekday index must be in 0..=6, got {0}")]
    InvalidWeekday(u32),
}
