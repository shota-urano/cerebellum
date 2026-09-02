use std::sync::Arc;

use crate::domain::{
    error::DomainError,
    intake::{
        IntakeApplyResultInput, IntakeBatchInput, compute_slug, validate_apply_result,
        validate_batch, validate_decision,
    },
};

use super::{
    error::UsecaseError,
    get_day::resolve_date,
    ports::{Clock, IntakeReceipt, IntakeRepository, IntakeRepositoryError, StoredIntakeCandidate},
};

pub struct ManageIntake {
    repository: Arc<dyn IntakeRepository>,
    clock: Arc<dyn Clock>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct IntakeList {
    pub items: Vec<StoredIntakeCandidate>,
    pub latest: Option<IntakeReceipt>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct IntakeSaved {
    pub date: String,
    pub received_at: String,
    pub item_count: usize,
    pub items: Vec<StoredIntakeCandidate>,
}

impl ManageIntake {
    pub fn new(repository: Arc<dyn IntakeRepository>, clock: Arc<dyn Clock>) -> Self {
        Self { repository, clock }
    }

    pub fn save_candidates(
        &self,
        input: IntakeBatchInput,
        body_size: usize,
    ) -> Result<IntakeSaved, UsecaseError> {
        let mut batch = validate_batch(input, body_size).map_err(domain_error)?;
        let now = self.clock.now();
        batch.date = resolve_date(&batch.date, now.date_naive())?
            .format("%Y-%m-%d")
            .to_string();
        for item in &mut batch.items {
            item.slug = compute_slug(&batch.date, item.lane, &item.text);
        }
        let received_at = now.to_rfc3339();
        self.repository
            .replace_intake_candidates(&batch, &received_at)
            .map_err(repository_error)?;
        let list = self
            .repository
            .list_proposed_intake()
            .map_err(repository_error)?;
        let items = list
            .into_iter()
            .filter(|item| item.date == batch.date)
            .collect();
        Ok(IntakeSaved {
            date: batch.date,
            received_at,
            item_count: batch.items.len(),
            items,
        })
    }

    pub fn proposed(&self) -> Result<IntakeList, UsecaseError> {
        self.list(self.repository.list_proposed_intake())
    }
    pub fn pending_approved(&self) -> Result<IntakeList, UsecaseError> {
        self.list(self.repository.list_pending_approved_intake())
    }
    pub fn failed(&self) -> Result<IntakeList, UsecaseError> {
        self.list(self.repository.list_failed_intake())
    }

    pub fn save_decision(
        &self,
        id: i64,
        requested: &str,
    ) -> Result<StoredIntakeCandidate, UsecaseError> {
        let current = self.get(id)?;
        let status = validate_decision(current.apply_state, requested).map_err(domain_error)?;
        self.repository
            .save_intake_decision(id, current.status, status, &self.clock.now().to_rfc3339())
            .map_err(|error| match error {
                IntakeRepositoryError::StateMismatch => {
                    UsecaseError::Conflict(format!("intake candidate {id} changed concurrently"))
                }
                other => repository_error(other),
            })
    }

    pub fn save_apply_result(
        &self,
        id: i64,
        input: IntakeApplyResultInput,
    ) -> Result<StoredIntakeCandidate, UsecaseError> {
        let current = self.get(id)?;
        let result = validate_apply_result(current.status, input).map_err(domain_error)?;
        self.repository
            .save_intake_apply_result(id, &result, &self.clock.now().to_rfc3339())
            .map_err(|error| match error {
                IntakeRepositoryError::StateMismatch => {
                    UsecaseError::Conflict(format!("intake candidate {id} changed concurrently"))
                }
                other => repository_error(other),
            })
    }

    fn get(&self, id: i64) -> Result<StoredIntakeCandidate, UsecaseError> {
        self.repository
            .get_intake_candidate(id)
            .map_err(repository_error)?
            .ok_or_else(|| UsecaseError::NotFound(format!("intake candidate {id}")))
    }
    fn list(
        &self,
        result: Result<Vec<StoredIntakeCandidate>, IntakeRepositoryError>,
    ) -> Result<IntakeList, UsecaseError> {
        let items = result.map_err(repository_error)?;
        let latest = self
            .repository
            .latest_intake_receipt()
            .map_err(repository_error)?;
        Ok(IntakeList { items, latest })
    }
}

fn domain_error(error: DomainError) -> UsecaseError {
    UsecaseError::BadRequest(error.to_string())
}
fn repository_error(error: IntakeRepositoryError) -> UsecaseError {
    match error {
        IntakeRepositoryError::Conflict => UsecaseError::Conflict(
            "decided or non-pending intake candidates cannot be replaced".to_owned(),
        ),
        IntakeRepositoryError::StateMismatch => {
            UsecaseError::Conflict("intake candidate state changed concurrently".to_owned())
        }
        error @ IntakeRepositoryError::Internal { .. } => UsecaseError::Internal(Box::new(error)),
    }
}
