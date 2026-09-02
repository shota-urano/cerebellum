use std::sync::Arc;

use crate::domain::{
    error::DomainError,
    inbox::{
        InboxApplyResultInput, InboxBatchInput, InboxDecisionInput, validate_apply_result,
        validate_batch, validate_decision,
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
            current.apply_state,
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
                    current.apply_state,
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

#[cfg(test)]
mod tests {
    use std::{
        collections::BTreeMap,
        sync::{Arc, Mutex},
    };

    use chrono::{DateTime, FixedOffset};

    use super::ManageInbox;
    use crate::{
        domain::inbox::{
            InboxApplyResult, InboxApplyResultInput, InboxApplyState, InboxBatch, InboxBatchInput,
            InboxDecisionInput, InboxItem, InboxItemInput, InboxKind, InboxOptionInput,
            InboxStatus,
        },
        usecase::{
            error::UsecaseError,
            ports::{
                Clock, InboxOpenCount, InboxRepository, InboxRepositoryError, InboxSourceSummary,
                StoredInboxItem,
            },
        },
    };

    #[derive(Default)]
    struct InMemoryInboxRepository {
        state: Mutex<RepositoryState>,
    }

    #[derive(Default)]
    struct RepositoryState {
        next_id: i64,
        rows: Vec<StoredInboxItem>,
        receipts: BTreeMap<(String, String), (String, usize)>,
        apply_before_next_decision: bool,
    }

    impl InMemoryInboxRepository {
        fn apply_before_next_decision(&self) {
            self.state
                .lock()
                .expect("repository should lock")
                .apply_before_next_decision = true;
        }
    }

    impl InboxRepository for InMemoryInboxRepository {
        fn replace_inbox_batch(
            &self,
            batch: &InboxBatch,
            received_at: &str,
        ) -> Result<(), InboxRepositoryError> {
            let mut state = self.state.lock().expect("repository should lock");
            if state.rows.iter().any(|row| {
                row.source == batch.source
                    && row.date == batch.date
                    && (matches!(
                        row.status,
                        InboxStatus::Approved | InboxStatus::Rejected | InboxStatus::Chosen
                    ) || matches!(
                        row.apply_state,
                        InboxApplyState::Applied | InboxApplyState::Failed
                    ))
            }) {
                return Err(InboxRepositoryError::Conflict);
            }
            state
                .rows
                .retain(|row| row.source != batch.source || row.date != batch.date);
            state.receipts.insert(
                (batch.source.clone(), batch.date.clone()),
                (received_at.to_owned(), batch.items.len()),
            );
            for item in &batch.items {
                state.next_id += 1;
                let id = state.next_id;
                state.rows.push(stored_item(id, batch, item, received_at));
            }
            Ok(())
        }

        fn list_open_inbox_items(
            &self,
            now: &str,
        ) -> Result<Vec<StoredInboxItem>, InboxRepositoryError> {
            let mut rows = self
                .state
                .lock()
                .expect("repository should lock")
                .rows
                .iter()
                .filter(|row| {
                    row.status == InboxStatus::Open
                        && row
                            .expires_at
                            .as_deref()
                            .is_none_or(|expires| expires >= now)
                })
                .cloned()
                .collect::<Vec<_>>();
            rows.sort_by(|left, right| {
                right
                    .date
                    .cmp(&left.date)
                    .then_with(|| right.id.cmp(&left.id))
            });
            Ok(rows)
        }

        fn list_decided_inbox_items(
            &self,
            source: &str,
        ) -> Result<Vec<StoredInboxItem>, InboxRepositoryError> {
            let mut rows = self
                .state
                .lock()
                .expect("repository should lock")
                .rows
                .iter()
                .filter(|row| {
                    row.source == source
                        && matches!(row.status, InboxStatus::Approved | InboxStatus::Chosen)
                        && row.apply_state == InboxApplyState::Pending
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

        fn list_failed_inbox_items(&self) -> Result<Vec<StoredInboxItem>, InboxRepositoryError> {
            let mut rows = self
                .state
                .lock()
                .expect("repository should lock")
                .rows
                .iter()
                .filter(|row| row.apply_state == InboxApplyState::Failed)
                .cloned()
                .collect::<Vec<_>>();
            rows.sort_by(|left, right| {
                right
                    .date
                    .cmp(&left.date)
                    .then_with(|| right.id.cmp(&left.id))
            });
            Ok(rows)
        }

        fn get_inbox_item(&self, id: i64) -> Result<Option<StoredInboxItem>, InboxRepositoryError> {
            Ok(self
                .state
                .lock()
                .expect("repository should lock")
                .rows
                .iter()
                .find(|row| row.id == id)
                .cloned())
        }

        fn save_inbox_decision(
            &self,
            id: i64,
            expected_status: InboxStatus,
            expected_apply_state: InboxApplyState,
            decision_status: InboxStatus,
            choice: Option<&str>,
            decided_at: &str,
        ) -> Result<StoredInboxItem, InboxRepositoryError> {
            let mut state = self.state.lock().expect("repository should lock");
            let apply_before_update = state.apply_before_next_decision;
            state.apply_before_next_decision = false;
            let Some(row) = state.rows.iter_mut().find(|row| row.id == id) else {
                return Err(InboxRepositoryError::StateMismatch);
            };
            if apply_before_update {
                row.apply_state = InboxApplyState::Applied;
            }
            if row.status != expected_status || row.apply_state != expected_apply_state {
                return Err(InboxRepositoryError::StateMismatch);
            }
            row.status = decision_status;
            row.choice = choice.map(str::to_owned);
            row.decided_at = Some(decided_at.to_owned());
            Ok(row.clone())
        }

        fn save_inbox_apply_result(
            &self,
            id: i64,
            expected_status: InboxStatus,
            expected_apply_state: InboxApplyState,
            result: &InboxApplyResult,
            applied_at: &str,
        ) -> Result<StoredInboxItem, InboxRepositoryError> {
            let mut state = self.state.lock().expect("repository should lock");
            let Some(row) = state.rows.iter_mut().find(|row| row.id == id) else {
                return Err(InboxRepositoryError::StateMismatch);
            };
            if row.status != expected_status || row.apply_state != expected_apply_state {
                return Err(InboxRepositoryError::StateMismatch);
            }
            row.apply_state = result.state;
            row.applied_at = Some(applied_at.to_owned());
            row.apply_error = result.error.clone();
            row.result_path = result.result_path.clone();
            row.result_url = result.result_url.clone();
            Ok(row.clone())
        }

        fn inbox_summary(&self) -> Result<Vec<InboxSourceSummary>, InboxRepositoryError> {
            let state = self.state.lock().expect("repository should lock");
            let mut summaries = BTreeMap::<String, InboxSourceSummary>::new();
            for ((source, date), (received_at, item_count)) in &state.receipts {
                let entry = summaries
                    .entry(source.clone())
                    .or_insert_with(|| InboxSourceSummary {
                        source: source.clone(),
                        latest_date: date.clone(),
                        latest_received_at: received_at.clone(),
                        latest_item_count: *item_count,
                        open_count: InboxOpenCount {
                            approve: 0,
                            choose: 0,
                            read: 0,
                            alert: 0,
                        },
                        failed_count: 0,
                    });
                if date > &entry.latest_date {
                    entry.latest_date = date.clone();
                    entry.latest_received_at = received_at.clone();
                    entry.latest_item_count = *item_count;
                }
            }
            for row in &state.rows {
                let summary = summaries
                    .get_mut(&row.source)
                    .expect("receipt exists for every item");
                if row.status == InboxStatus::Open {
                    match row.kind {
                        InboxKind::Approve => summary.open_count.approve += 1,
                        InboxKind::Choose => summary.open_count.choose += 1,
                        InboxKind::Read => summary.open_count.read += 1,
                        InboxKind::Alert => summary.open_count.alert += 1,
                    }
                }
                if row.apply_state == InboxApplyState::Failed {
                    summary.failed_count += 1;
                }
            }
            Ok(summaries.into_values().collect())
        }
    }

    fn stored_item(
        id: i64,
        batch: &InboxBatch,
        item: &InboxItem,
        received_at: &str,
    ) -> StoredInboxItem {
        StoredInboxItem {
            id,
            source: batch.source.clone(),
            date: batch.date.clone(),
            slug: item.slug.clone(),
            kind: item.kind,
            title: item.title.clone(),
            body_md: item.body_md.clone(),
            options: item.options.clone(),
            ref_path: item.ref_path.clone(),
            payload: item.payload.clone(),
            expires_at: item.expires_at.clone(),
            status: item.status,
            choice: None,
            decided_at: None,
            apply_state: item.apply_state,
            applied_at: None,
            apply_error: None,
            result_path: None,
            result_url: None,
            received_at: received_at.to_owned(),
        }
    }

    struct FixedClock;
    impl Clock for FixedClock {
        fn now(&self) -> DateTime<FixedOffset> {
            DateTime::parse_from_rfc3339("2026-09-02T07:00:00+09:00")
                .expect("fixed time should parse")
        }
    }

    fn manage() -> (ManageInbox, Arc<InMemoryInboxRepository>) {
        let repository = Arc::new(InMemoryInboxRepository::default());
        (
            ManageInbox::new(repository.clone(), Arc::new(FixedClock)),
            repository,
        )
    }

    fn item(slug: &str, kind: &str) -> InboxItemInput {
        InboxItemInput {
            slug: Some(slug.to_owned()),
            kind: Some(kind.to_owned()),
            title: Some(format!("title-{slug}")),
            body_md: None,
            options: (kind == "choose").then(|| vec![option("one"), option("two")]),
            ref_path: None,
            payload: None,
            expires_at: None,
        }
    }
    fn option(id: &str) -> InboxOptionInput {
        InboxOptionInput {
            id: Some(id.to_owned()),
            label: Some(id.to_owned()),
        }
    }
    fn batch(source: &str, date: &str, items: Vec<InboxItemInput>) -> InboxBatchInput {
        InboxBatchInput {
            source: Some(source.to_owned()),
            date: Some(date.to_owned()),
            items: Some(items),
        }
    }
    fn decide(status: &str) -> InboxDecisionInput {
        InboxDecisionInput {
            status: Some(status.to_owned()),
            choice: (status == "chosen").then(|| "one".to_owned()),
        }
    }
    fn apply(state: &str) -> InboxApplyResultInput {
        InboxApplyResultInput {
            state: Some(state.to_owned()),
            result_path: None,
            result_url: None,
            error: (state == "failed").then(|| "failure".to_owned()),
        }
    }

    #[test]
    fn batches_resolve_today_replace_atomically_and_record_empty_receipts() {
        let (manage, _) = manage();
        let first = manage
            .save_inbox_batch(batch("sender", "today", vec![item("old", "approve")]), 1)
            .expect("today batch saves");
        assert_eq!(first.date, "2026-09-02");
        assert_eq!(first.received_at, "2026-09-02T07:00:00+09:00");
        manage
            .save_inbox_batch(
                batch("sender", "2026-09-02", vec![item("replacement", "read")]),
                1,
            )
            .expect("batch replaces");
        assert_eq!(
            manage
                .open()
                .unwrap()
                .iter()
                .map(|item| item.slug.as_str())
                .collect::<Vec<_>>(),
            ["replacement"]
        );
        manage
            .save_inbox_batch(batch("sender", "2026-09-02", vec![]), 1)
            .expect("empty batch records receipt");
        let summary = manage.summary().unwrap();
        assert_eq!(summary[0].latest_item_count, 0);
        assert!(manage.open().unwrap().is_empty());
    }

    #[test]
    fn protected_decisions_and_apply_results_make_resends_conflicts() {
        let (manage, _) = manage();
        for (date, kind, decision, apply_result) in [
            ("2026-08-27", "approve", "approved", None),
            ("2026-08-28", "approve", "rejected", None),
            ("2026-08-29", "choose", "chosen", None),
            ("2026-08-30", "approve", "approved", Some("applied")),
            ("2026-08-31", "approve", "approved", Some("failed")),
        ] {
            let saved = manage
                .save_inbox_batch(batch("sender", date, vec![item("protected", kind)]), 1)
                .unwrap();
            let id = manage
                .open()
                .unwrap()
                .into_iter()
                .find(|row| row.date == saved.date)
                .unwrap()
                .id;
            manage.save_decision(id, decide(decision)).unwrap();
            if let Some(apply_result) = apply_result {
                manage.save_apply_result(id, apply(apply_result)).unwrap();
            }
            assert!(
                matches!(
                    manage.save_inbox_batch(
                        batch("sender", date, vec![item("replacement", kind)]),
                        1
                    ),
                    Err(UsecaseError::Conflict(_))
                ),
                "{date} should be protected"
            );
        }
    }

    #[test]
    fn read_and_alert_decisions_keep_none_and_allow_resend() {
        let (manage, _) = manage();
        for (date, kind, status) in [
            ("2026-08-30", "read", "read"),
            ("2026-08-31", "alert", "acknowledged"),
        ] {
            manage
                .save_inbox_batch(batch("sender", date, vec![item("notice", kind)]), 1)
                .unwrap();
            let id = manage
                .open()
                .unwrap()
                .into_iter()
                .find(|row| row.date == date)
                .unwrap()
                .id;
            let decided = manage
                .save_decision(id, decide(status))
                .expect("read/alert decision saves");
            assert_eq!(decided.apply_state, InboxApplyState::None);
            manage
                .save_inbox_batch(batch("sender", date, vec![item("again", kind)]), 1)
                .expect("read/alert only batch is replaceable");
            assert_eq!(
                manage
                    .open()
                    .unwrap()
                    .into_iter()
                    .find(|row| row.date == date)
                    .unwrap()
                    .status,
                InboxStatus::Open
            );
        }
    }

    #[test]
    fn open_and_decided_queries_apply_clock_source_and_specified_ordering() {
        let (manage, _) = manage();
        let mut expired = item("expired", "alert");
        expired.expires_at = Some("2026-09-02T06:59:59+09:00".to_owned());
        manage
            .save_inbox_batch(batch("sender-a", "2026-08-29", vec![expired]), 1)
            .unwrap();
        manage
            .save_inbox_batch(
                batch("sender-a", "2026-08-30", vec![item("oldest", "approve")]),
                1,
            )
            .unwrap();
        manage
            .save_inbox_batch(
                batch("sender-a", "2026-09-01", vec![item("middle", "approve")]),
                1,
            )
            .unwrap();
        manage
            .save_inbox_batch(
                batch("sender-a", "2026-09-03", vec![item("newest", "read")]),
                1,
            )
            .unwrap();
        manage
            .save_inbox_batch(
                batch(
                    "sender-b",
                    "2026-08-28",
                    vec![item("other-source", "approve")],
                ),
                1,
            )
            .unwrap();
        assert_eq!(
            manage
                .open()
                .unwrap()
                .iter()
                .map(|row| row.slug.as_str())
                .collect::<Vec<_>>(),
            ["newest", "middle", "oldest", "other-source"]
        );
        for (slug, status) in [
            ("oldest", "approved"),
            ("middle", "approved"),
            ("other-source", "approved"),
        ] {
            let id = manage
                .open()
                .unwrap()
                .into_iter()
                .find(|row| row.slug == slug)
                .unwrap()
                .id;
            manage.save_decision(id, decide(status)).unwrap();
        }
        assert_eq!(
            manage
                .decided("sender-a")
                .unwrap()
                .iter()
                .map(|row| row.slug.as_str())
                .collect::<Vec<_>>(),
            ["oldest", "middle"]
        );
    }

    #[test]
    fn decisions_revalidate_after_state_mismatch_and_applied_items_cannot_be_decided() {
        let (manage, repository) = manage();
        manage
            .save_inbox_batch(
                batch("sender", "2026-09-02", vec![item("approve", "approve")]),
                1,
            )
            .unwrap();
        let id = manage.open().unwrap()[0].id;
        repository.apply_before_next_decision();
        assert!(matches!(
            manage.save_decision(id, decide("approved")),
            Err(UsecaseError::BadRequest(_))
        ));
        assert!(matches!(
            manage.save_decision(999, decide("approved")),
            Err(UsecaseError::NotFound(_))
        ));
    }

    #[test]
    fn summary_counts_open_kinds_and_failed_items() {
        let (manage, _) = manage();
        manage
            .save_inbox_batch(
                batch(
                    "sender-a",
                    "2026-09-01",
                    vec![item("approve", "approve"), item("read", "read")],
                ),
                1,
            )
            .unwrap();
        manage
            .save_inbox_batch(
                batch(
                    "sender-b",
                    "2026-09-02",
                    vec![item("choose", "choose"), item("alert", "alert")],
                ),
                1,
            )
            .unwrap();
        let approve = manage
            .open()
            .unwrap()
            .into_iter()
            .find(|row| row.slug == "approve")
            .unwrap()
            .id;
        manage.save_decision(approve, decide("approved")).unwrap();
        manage.save_apply_result(approve, apply("failed")).unwrap();
        let summary = manage.summary().unwrap();
        assert_eq!(
            summary
                .iter()
                .find(|row| row.source == "sender-a")
                .unwrap()
                .open_count
                .read,
            1
        );
        assert_eq!(
            summary
                .iter()
                .find(|row| row.source == "sender-a")
                .unwrap()
                .failed_count,
            1
        );
        let sender_b = summary.iter().find(|row| row.source == "sender-b").unwrap();
        assert_eq!(
            (sender_b.open_count.choose, sender_b.open_count.alert),
            (1, 1)
        );
    }
}
