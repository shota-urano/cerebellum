use std::sync::Arc;

use crate::domain::{
    error::DomainError,
    harness::{
        ApplyResultInput, HarnessProposalBatchInput, validate_apply_result, validate_decision,
        validate_proposal_batch,
    },
};

use super::{
    error::UsecaseError,
    get_day::resolve_date,
    ports::{Clock, HarnessRepository, HarnessRepositoryError, StoredHarnessProposal},
};

pub struct ManageHarness {
    repository: Arc<dyn HarnessRepository>,
    clock: Arc<dyn Clock>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct HarnessProposalList {
    pub date: String,
    pub received_at: Option<String>,
    pub proposals: Vec<StoredHarnessProposal>,
}

impl ManageHarness {
    pub fn new(repository: Arc<dyn HarnessRepository>, clock: Arc<dyn Clock>) -> Self {
        Self { repository, clock }
    }

    pub fn save_proposals(
        &self,
        input: HarnessProposalBatchInput,
        body_size: usize,
    ) -> Result<HarnessProposalList, UsecaseError> {
        let mut batch = validate_proposal_batch(input, body_size).map_err(domain_error)?;
        let now = self.clock.now();
        batch.date = resolve_date(&batch.date, now.date_naive())?
            .format("%Y-%m-%d")
            .to_string();
        let received_at = now.to_rfc3339();

        self.repository
            .replace_harness_proposals(&batch, &received_at)
            .map_err(repository_error)?;

        self.list_resolved(&batch.date)
    }

    pub fn save_decision(
        &self,
        id: i64,
        requested_status: &str,
    ) -> Result<StoredHarnessProposal, UsecaseError> {
        let current = self
            .repository
            .get_harness_proposal(id)
            .map_err(repository_error)?
            .ok_or_else(|| UsecaseError::NotFound(format!("harness proposal {id}")))?;
        let status = validate_decision(current.status, current.apply_state, requested_status)
            .map_err(domain_error)?;
        let decided_at = self.clock.now().to_rfc3339();

        match self
            .repository
            .save_harness_decision(id, current.status, status, &decided_at)
        {
            Ok(proposal) => Ok(proposal),
            Err(HarnessRepositoryError::StateMismatch) => {
                self.resolve_decision_state_mismatch(id, requested_status)
            }
            Err(error) => Err(repository_error(error)),
        }
    }

    pub fn list_proposals(&self, date: &str) -> Result<HarnessProposalList, UsecaseError> {
        let today = self.clock.now().date_naive();
        let date = resolve_date(date, today)?.format("%Y-%m-%d").to_string();
        self.list_resolved(&date)
    }

    pub fn pending_approved(&self) -> Result<Vec<StoredHarnessProposal>, UsecaseError> {
        self.repository
            .list_pending_approved()
            .map_err(repository_error)
    }

    pub fn save_apply_result(
        &self,
        id: i64,
        input: ApplyResultInput,
    ) -> Result<StoredHarnessProposal, UsecaseError> {
        let current = self
            .repository
            .get_harness_proposal(id)
            .map_err(repository_error)?
            .ok_or_else(|| UsecaseError::NotFound(format!("harness proposal {id}")))?;
        let result = validate_apply_result(current.status, input.clone()).map_err(domain_error)?;
        let applied_at = self.clock.now().to_rfc3339();

        match self
            .repository
            .save_harness_apply_result(id, &result, &applied_at)
        {
            Ok(proposal) => Ok(proposal),
            Err(HarnessRepositoryError::StateMismatch) => {
                self.resolve_apply_result_state_mismatch(id, input)
            }
            Err(error) => Err(repository_error(error)),
        }
    }

    fn list_resolved(&self, date: &str) -> Result<HarnessProposalList, UsecaseError> {
        let proposals = self
            .repository
            .list_harness_proposals(date)
            .map_err(repository_error)?;
        let received_at = proposals
            .first()
            .map(|proposal| proposal.received_at.clone());

        Ok(HarnessProposalList {
            date: date.to_owned(),
            received_at,
            proposals,
        })
    }

    fn resolve_decision_state_mismatch(
        &self,
        id: i64,
        requested_status: &str,
    ) -> Result<StoredHarnessProposal, UsecaseError> {
        let current = self.reload_after_state_mismatch(id)?;
        validate_decision(current.status, current.apply_state, requested_status)
            .map_err(domain_error)?;
        Err(concurrent_state_conflict(id))
    }

    fn resolve_apply_result_state_mismatch(
        &self,
        id: i64,
        input: ApplyResultInput,
    ) -> Result<StoredHarnessProposal, UsecaseError> {
        let current = self.reload_after_state_mismatch(id)?;
        validate_apply_result(current.status, input).map_err(domain_error)?;
        Err(concurrent_state_conflict(id))
    }

    fn reload_after_state_mismatch(&self, id: i64) -> Result<StoredHarnessProposal, UsecaseError> {
        self.repository
            .get_harness_proposal(id)
            .map_err(repository_error)?
            .ok_or_else(|| UsecaseError::NotFound(format!("harness proposal {id}")))
    }
}

fn domain_error(error: DomainError) -> UsecaseError {
    UsecaseError::BadRequest(error.to_string())
}

fn repository_error(error: HarnessRepositoryError) -> UsecaseError {
    match error {
        HarnessRepositoryError::Conflict => {
            UsecaseError::Conflict("non-proposed harness proposals cannot be replaced".to_owned())
        }
        HarnessRepositoryError::StateMismatch => {
            UsecaseError::Conflict("harness proposal state changed concurrently".to_owned())
        }
        error @ HarnessRepositoryError::Internal { .. } => UsecaseError::Internal(Box::new(error)),
    }
}

fn concurrent_state_conflict(id: i64) -> UsecaseError {
    UsecaseError::Conflict(format!("harness proposal {id} changed concurrently"))
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use chrono::{DateTime, FixedOffset};

    use super::ManageHarness;
    use crate::{
        domain::harness::{
            ApplyResult, ApplyResultInput, ApplyState, HarnessProposalBatch,
            HarnessProposalBatchInput, HarnessProposalInput, HarnessStatus, HarnessVerdict,
        },
        usecase::{
            error::UsecaseError,
            ports::{Clock, HarnessRepository, HarnessRepositoryError, StoredHarnessProposal},
        },
    };

    #[derive(Default)]
    struct InMemoryHarnessRepository {
        state: Mutex<RepositoryState>,
    }

    #[derive(Default)]
    struct RepositoryState {
        next_id: i64,
        rows: Vec<StoredHarnessProposal>,
        apply_before_next_decision: bool,
        reject_before_next_apply_result: bool,
    }

    impl InMemoryHarnessRepository {
        fn apply_before_next_decision(&self) {
            self.state
                .lock()
                .expect("repository should lock")
                .apply_before_next_decision = true;
        }

        fn reject_before_next_apply_result(&self) {
            self.state
                .lock()
                .expect("repository should lock")
                .reject_before_next_apply_result = true;
        }
    }

    impl HarnessRepository for InMemoryHarnessRepository {
        fn replace_harness_proposals(
            &self,
            batch: &HarnessProposalBatch,
            received_at: &str,
        ) -> Result<(), HarnessRepositoryError> {
            let mut state = self.state.lock().expect("repository should lock");
            if state
                .rows
                .iter()
                .any(|row| row.date == batch.date && row.status != HarnessStatus::Proposed)
            {
                return Err(HarnessRepositoryError::Conflict);
            }

            state.rows.retain(|row| row.date != batch.date);
            for proposal in &batch.proposals {
                state.next_id += 1;
                let id = state.next_id;
                state.rows.push(StoredHarnessProposal {
                    id,
                    date: batch.date.clone(),
                    kind: batch.kind,
                    slug: proposal.slug.clone(),
                    insight_name: proposal.insight_name.clone(),
                    verdict: proposal.verdict,
                    category: proposal.category.clone(),
                    summary: proposal.summary.clone(),
                    challenge_verdict: proposal.challenge_verdict,
                    challenge_note: proposal.challenge_note.clone(),
                    detail_path: proposal.detail_path.clone(),
                    detail_md: proposal.detail_md.clone(),
                    status: if proposal.verdict == HarnessVerdict::Killed {
                        HarnessStatus::Killed
                    } else {
                        HarnessStatus::Proposed
                    },
                    decided_at: None,
                    apply_state: ApplyState::Pending,
                    applied_at: None,
                    apply_error: None,
                    snapshot_path: None,
                    received_at: received_at.to_owned(),
                });
            }
            Ok(())
        }

        fn list_harness_proposals(
            &self,
            date: &str,
        ) -> Result<Vec<StoredHarnessProposal>, HarnessRepositoryError> {
            let mut rows = self
                .state
                .lock()
                .expect("repository should lock")
                .rows
                .iter()
                .filter(|row| row.date == date)
                .cloned()
                .collect::<Vec<_>>();
            rows.sort_by_key(|row| row.id);
            Ok(rows)
        }

        fn get_harness_proposal(
            &self,
            id: i64,
        ) -> Result<Option<StoredHarnessProposal>, HarnessRepositoryError> {
            Ok(self
                .state
                .lock()
                .expect("repository should lock")
                .rows
                .iter()
                .find(|row| row.id == id)
                .cloned())
        }

        fn save_harness_decision(
            &self,
            id: i64,
            expected_status: HarnessStatus,
            status: HarnessStatus,
            decided_at: &str,
        ) -> Result<StoredHarnessProposal, HarnessRepositoryError> {
            let mut state = self.state.lock().expect("repository should lock");
            let apply_before_update = state.apply_before_next_decision;
            state.apply_before_next_decision = false;
            let Some(row) = state.rows.iter_mut().find(|row| row.id == id) else {
                return Err(HarnessRepositoryError::StateMismatch);
            };
            if apply_before_update {
                row.apply_state = ApplyState::Applied;
            }
            if row.status != expected_status || row.apply_state != ApplyState::Pending {
                return Err(HarnessRepositoryError::StateMismatch);
            }
            row.status = status;
            row.decided_at = Some(decided_at.to_owned());
            Ok(row.clone())
        }

        fn list_pending_approved(
            &self,
        ) -> Result<Vec<StoredHarnessProposal>, HarnessRepositoryError> {
            let mut rows = self
                .state
                .lock()
                .expect("repository should lock")
                .rows
                .iter()
                .filter(|row| {
                    row.status == HarnessStatus::Approved && row.apply_state == ApplyState::Pending
                })
                .cloned()
                .collect::<Vec<_>>();
            rows.sort_by(|left, right| {
                left.date
                    .cmp(&right.date)
                    .then_with(|| left.id.cmp(&right.id))
            });
            Ok(rows)
        }

        fn save_harness_apply_result(
            &self,
            id: i64,
            result: &ApplyResult,
            applied_at: &str,
        ) -> Result<StoredHarnessProposal, HarnessRepositoryError> {
            let mut state = self.state.lock().expect("repository should lock");
            let reject_before_update = state.reject_before_next_apply_result;
            state.reject_before_next_apply_result = false;
            let Some(row) = state.rows.iter_mut().find(|row| row.id == id) else {
                return Err(HarnessRepositoryError::StateMismatch);
            };
            if reject_before_update {
                row.status = HarnessStatus::Rejected;
            }
            if row.status != HarnessStatus::Approved {
                return Err(HarnessRepositoryError::StateMismatch);
            }
            row.apply_state = result.state;
            row.applied_at = Some(applied_at.to_owned());
            row.apply_error = result.error.clone();
            row.snapshot_path = result.snapshot_path.clone();
            Ok(row.clone())
        }
    }

    struct FixedClock;

    impl Clock for FixedClock {
        fn now(&self) -> DateTime<FixedOffset> {
            DateTime::parse_from_rfc3339("2026-07-29T06:40:00+09:00")
                .expect("fixed time should parse")
        }
    }

    fn manage() -> ManageHarness {
        manage_with_repository().0
    }

    fn manage_with_repository() -> (ManageHarness, Arc<InMemoryHarnessRepository>) {
        let repository = Arc::new(InMemoryHarnessRepository::default());
        (
            ManageHarness::new(repository.clone(), Arc::new(FixedClock)),
            repository,
        )
    }

    fn proposal(slug: &str, verdict: &str) -> HarnessProposalInput {
        HarnessProposalInput {
            slug: Some(slug.to_owned()),
            insight_name: Some(format!("insight-{slug}")),
            verdict: Some(verdict.to_owned()),
            category: Some("experiment".to_owned()),
            summary: Some(format!("summary-{slug}")),
            challenge_verdict: (verdict != "killed").then(|| "hold".to_owned()),
            challenge_note: None,
            detail_path: None,
            detail_md: Some(format!("# {slug}")),
        }
    }

    fn batch(date: &str, proposals: Vec<HarnessProposalInput>) -> HarnessProposalBatchInput {
        HarnessProposalBatchInput {
            date: Some(date.to_owned()),
            kind: None,
            proposals: Some(proposals),
        }
    }

    #[test]
    fn resending_the_same_date_replaces_the_whole_batch() {
        let manage = manage();
        manage
            .save_proposals(
                batch(
                    "2026-07-29",
                    vec![proposal("old-a", "adopt"), proposal("old-b", "experiment")],
                ),
                1,
            )
            .expect("first batch should save");

        let replaced = manage
            .save_proposals(
                batch("2026-07-29", vec![proposal("replacement", "adopt")]),
                1,
            )
            .expect("proposed batch should be replaceable");

        assert_eq!(
            replaced
                .proposals
                .iter()
                .map(|proposal| proposal.slug.as_str())
                .collect::<Vec<_>>(),
            vec!["replacement"]
        );
    }

    #[test]
    fn resending_a_date_with_a_recorded_decision_is_a_conflict() {
        let manage = manage();
        let stored = manage
            .save_proposals(batch("2026-07-29", vec![proposal("decided", "adopt")]), 1)
            .expect("batch should save");
        manage
            .save_decision(stored.proposals[0].id, "approved")
            .expect("decision should save");

        assert!(matches!(
            manage.save_proposals(
                batch("2026-07-29", vec![proposal("replacement", "adopt")]),
                1,
            ),
            Err(UsecaseError::Conflict(_))
        ));
    }

    #[test]
    fn killed_verdict_is_stored_with_killed_status() {
        let manage = manage();
        let stored = manage
            .save_proposals(batch("2026-07-29", vec![proposal("refuted", "killed")]), 1)
            .expect("killed proposal should save");

        assert_eq!(stored.proposals[0].status, HarnessStatus::Killed);
        assert_eq!(stored.proposals[0].apply_state, ApplyState::Pending);
    }

    #[test]
    fn missing_date_lists_as_not_received_instead_of_not_found() {
        let missing = manage()
            .list_proposals("today")
            .expect("missing date should return an empty view");

        assert_eq!(missing.date, "2026-07-29");
        assert!(missing.received_at.is_none());
        assert!(missing.proposals.is_empty());
    }

    #[test]
    fn pending_approved_lists_all_dates_oldest_first() {
        let manage = manage();
        let mut ids = Vec::new();
        for (date, slug) in [
            ("2026-07-30", "newest"),
            ("2026-07-28", "oldest"),
            ("2026-07-29", "middle"),
        ] {
            let stored = manage
                .save_proposals(batch(date, vec![proposal(slug, "adopt")]), 1)
                .expect("batch should save");
            ids.push(stored.proposals[0].id);
        }
        for id in ids {
            manage
                .save_decision(id, "approved")
                .expect("proposal should be approved");
        }

        assert_eq!(
            manage
                .pending_approved()
                .expect("pending proposals should list")
                .iter()
                .map(|proposal| proposal.slug.as_str())
                .collect::<Vec<_>>(),
            vec!["oldest", "middle", "newest"]
        );
    }

    #[test]
    fn applied_result_overwrites_a_previous_failure() {
        let manage = manage();
        let stored = manage
            .save_proposals(
                batch("2026-07-29", vec![proposal("retry", "experiment")]),
                1,
            )
            .expect("batch should save");
        let id = stored.proposals[0].id;
        manage
            .save_decision(id, "approved")
            .expect("proposal should be approved");
        let failed = manage
            .save_apply_result(
                id,
                ApplyResultInput {
                    state: Some("failed".to_owned()),
                    snapshot_path: None,
                    error: Some("destination exists".to_owned()),
                },
            )
            .expect("failure should save");
        assert_eq!(failed.apply_state, ApplyState::Failed);

        let applied = manage
            .save_apply_result(
                id,
                ApplyResultInput {
                    state: Some("applied".to_owned()),
                    snapshot_path: Some("archive/retry".to_owned()),
                    error: Some("old error should be cleared".to_owned()),
                },
            )
            .expect("retry success should overwrite failure");

        assert_eq!(applied.apply_state, ApplyState::Applied);
        assert_eq!(applied.snapshot_path.as_deref(), Some("archive/retry"));
        assert!(applied.apply_error.is_none());
    }

    #[test]
    fn decision_rereads_after_apply_result_wins_the_race() {
        let (manage, repository) = manage_with_repository();
        let stored = manage
            .save_proposals(
                batch("2026-07-29", vec![proposal("apply-first", "adopt")]),
                1,
            )
            .expect("batch should save");
        let id = stored.proposals[0].id;
        manage
            .save_decision(id, "approved")
            .expect("proposal should be approved");
        repository.apply_before_next_decision();

        let error = manage
            .save_decision(id, "rejected")
            .expect_err("stale decision should be rejected");

        assert!(matches!(error, UsecaseError::BadRequest(_)));
        assert!(error.to_string().contains("apply_state pending"));
        let current = repository
            .get_harness_proposal(id)
            .expect("proposal read should succeed")
            .expect("proposal should exist");
        assert_eq!(current.status, HarnessStatus::Approved);
        assert_eq!(current.apply_state, ApplyState::Applied);
    }

    #[test]
    fn apply_result_rereads_after_decision_wins_the_race() {
        let (manage, repository) = manage_with_repository();
        let stored = manage
            .save_proposals(
                batch("2026-07-29", vec![proposal("decision-first", "adopt")]),
                1,
            )
            .expect("batch should save");
        let id = stored.proposals[0].id;
        manage
            .save_decision(id, "approved")
            .expect("proposal should be approved");
        repository.reject_before_next_apply_result();

        let error = manage
            .save_apply_result(
                id,
                ApplyResultInput {
                    state: Some("applied".to_owned()),
                    snapshot_path: Some("archive/decision-first".to_owned()),
                    error: None,
                },
            )
            .expect_err("stale apply result should be rejected");

        assert!(matches!(error, UsecaseError::BadRequest(_)));
        assert!(error.to_string().contains("status approved"));
        let current = repository
            .get_harness_proposal(id)
            .expect("proposal read should succeed")
            .expect("proposal should exist");
        assert_eq!(current.status, HarnessStatus::Rejected);
        assert_eq!(current.apply_state, ApplyState::Pending);
    }
}
