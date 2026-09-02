use thiserror::Error;

#[derive(Debug, Error, PartialEq, Eq)]
pub enum DomainError {
    #[error("weekday index must be in 0..=6, got {0}")]
    InvalidWeekday(u32),
    #[error("invalid harness proposal: {0}")]
    InvalidHarnessProposal(String),
    #[error("invalid harness state transition: {0}")]
    InvalidHarnessTransition(String),
    #[error("invalid intake candidate: {0}")]
    InvalidIntakeCandidate(String),
    #[error("invalid intake state transition: {0}")]
    InvalidIntakeTransition(String),
    #[error("invalid inbox item: {0}")]
    InvalidInboxItem(String),
    #[error("invalid inbox state transition: {0}")]
    InvalidInboxTransition(String),
}
