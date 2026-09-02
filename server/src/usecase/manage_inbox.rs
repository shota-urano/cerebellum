use std::sync::Arc;

use crate::domain::{
    error::DomainError,
    inbox::{
        InboxApplyResultInput, InboxApplyState, InboxBatchInput, InboxDecisionInput, InboxKind,
        validate_apply_result, validate_batch, validate_decision,
    },
};

use super::{
    error::UsecaseError,
    get_day::resolve_date,
    ports::{Clock, InboxRepository, InboxRepositoryError, InboxSourceSummary, StoredInboxItem},
};

pub struct ManageInbox {
    repository: Arc<dyn InboxRepository>,
    clock: Arc<dyn Clock>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct InboxBatchSaved {
    pub source: String,
    pub date: String,
    pub received_at: String,
    pub item_count: usize,
}

impl ManageInbox {
    pub fn new(repository: Arc<dyn InboxRepository>, clock: Arc<dyn Clock>) -> Self {
        Self { repository, clock }
    }

    pub fn save_inbox_batch(
        &self,
        input: InboxBatchInput,
        body_size: usize,
    ) -> Result<InboxBatchSaved, UsecaseError> {
        let mut batch = validate_batch(input, body_size).map_err(domain_error)?;
        let now = self.clock.now();
        batch.date = resolve_date(&batch.date, now.date_naive())?
            .format("%Y-%m-%d")
            .to_string();
        let received_at = now.to_rfc3339();
        self.repository
            .replace_inbox_batch(&batch, &received_at)
            .map_err(repository_error)?;
        Ok(InboxBatchSaved {
            source: batch.source,
            date: batch.date,
            received_at,
            item_count: batch.items.len(),
        })
    }

    pub fn open(&self) -> Result<Vec<StoredInboxItem>, UsecaseError> {
        self.repository
            .list_open_inbox_items(&self.clock.now().to_rfc3339())
            .map_err(repository_error)
    }

    pub fn decided(&self, source: &str) -> Result<Vec<StoredInboxItem>, UsecaseError> {
        self.repository
            .list_decided_inbox_items(source)
            .map_err(repository_error)
    }

    pub fn failed(&self) -> Result<Vec<StoredInboxItem>, UsecaseError> {
        self.repository
            .list_failed_inbox_items()
            .map_err(repository_error)
    }

    pub fn save_decision(
        &self,
        id: i64,
        input: InboxDecisionInput,
    ) -> Result<StoredInboxItem, UsecaseError> {
        let current = self.get(id)?;
        let decision = validate_decision(
            current.kind,
            decision_validation_apply_state(current.kind, current.apply_state),
            current.options.as_deref(),
            input.clone(),
        )
        .map_err(domain_error)?;
        let decided_at = self.clock.now().to_rfc3339();
        match self.repository.save_inbox_decision(
            id,
            current.status,
            current.apply_state,
            decision.status,
            decision.choice.as_deref(),
            &decided_at,
        ) {
            Ok(item) => Ok(item),
            Err(InboxRepositoryError::StateMismatch) => {
                let current = self.get(id)?;
                validate_decision(
                    current.kind,
                    decision_validation_apply_state(current.kind, current.apply_state),
                    current.options.as_deref(),
                    input,
                )
                .map_err(domain_error)?;
                Err(concurrent_state_conflict(id))
            }
            Err(error) => Err(repository_error(error)),
        }
    }

    pub fn save_apply_result(
        &self,
        id: i64,
        input: InboxApplyResultInput,
    ) -> Result<StoredInboxItem, UsecaseError> {
        let current = self.get(id)?;
        let result = validate_apply_result(current.status, current.apply_state, input.clone())
            .map_err(domain_error)?;
        let applied_at = self.clock.now().to_rfc3339();
        match self.repository.save_inbox_apply_result(
            id,
            current.status,
            current.apply_state,
            &result,
            &applied_at,
        ) {
            Ok(item) => Ok(item),
            Err(InboxRepositoryError::StateMismatch) => {
                let current = self.get(id)?;
                validate_apply_result(current.status, current.apply_state, input)
                    .map_err(domain_error)?;
                Err(concurrent_state_conflict(id))
            }
            Err(error) => Err(repository_error(error)),
        }
    }

    pub fn summary(&self) -> Result<Vec<InboxSourceSummary>, UsecaseError> {
        self.repository.inbox_summary().map_err(repository_error)
    }

    fn get(&self, id: i64) -> Result<StoredInboxItem, UsecaseError> {
        self.repository
            .get_inbox_item(id)
            .map_err(repository_error)?
            .ok_or_else(|| UsecaseError::NotFound(format!("inbox item {id}")))
    }
}

fn domain_error(error: DomainError) -> UsecaseError {
    UsecaseError::BadRequest(error.to_string())
}

fn repository_error(error: InboxRepositoryError) -> UsecaseError {
    match error {
        InboxRepositoryError::Conflict => UsecaseError::Conflict(
            "decided or non-pending inbox items cannot be replaced".to_owned(),
        ),
        InboxRepositoryError::StateMismatch => {
            UsecaseError::Conflict("inbox item state changed concurrently".to_owned())
        }
        error @ InboxRepositoryError::Internal { .. } => UsecaseError::Internal(Box::new(error)),
    }
}

fn concurrent_state_conflict(id: i64) -> UsecaseError {
    UsecaseError::Conflict(format!("inbox item {id} changed concurrently"))
}

fn decision_validation_apply_state(
    kind: InboxKind,
    apply_state: InboxApplyState,
) -> InboxApplyState {
    match kind {
        InboxKind::Read | InboxKind::Alert => InboxApplyState::Pending,
        InboxKind::Approve | InboxKind::Choose => apply_state,
    }
}
