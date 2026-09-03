use std::error::Error;

use chrono::{DateTime, FixedOffset};
use thiserror::Error;

use crate::domain::{
    day::SummaryDay,
    harness::{
        ApplyResult, ApplyState, ChallengeVerdict, HarnessKind, HarnessProposalBatch,
        HarnessStatus, HarnessVerdict,
    },
    inbox::{InboxApplyResult, InboxApplyState, InboxBatch, InboxKind, InboxOption, InboxStatus},
    intake::{IntakeApplyResult, IntakeApplyState, IntakeBatch, IntakeLane, IntakeStatus},
    routine::{Routine, RoutineFields},
    task::{CheckedTask, Task},
};

pub trait VaultReader: Send + Sync {
    fn read_routine_markdown(&self) -> Result<String, VaultReaderError>;
}

pub trait TaskRepository: Send + Sync {
    fn health_check(&self) -> Result<(), RepositoryError>;
    fn snapshot_exists(&self, date: &str) -> Result<bool, RepositoryError>;
    fn insert_snapshot(&self, date: &str, tasks: &[Task]) -> Result<(), RepositoryError>;
    fn get_tasks(&self, date: &str) -> Result<Vec<CheckedTask>, RepositoryError>;
    fn toggle_check(
        &self,
        date: &str,
        task_id: &str,
        checked_at: DateTime<FixedOffset>,
    ) -> Result<(), RepositoryError>;
    fn get_summary(
        &self,
        start_date: &str,
        end_date: &str,
    ) -> Result<Vec<SummaryDay>, RepositoryError>;
}

pub trait RoutineRepository: Send + Sync {
    fn list_routines(&self, include_inactive: bool)
    -> Result<Vec<Routine>, RoutineRepositoryError>;
    fn get_routine(&self, id: i64) -> Result<Option<Routine>, RoutineRepositoryError>;
    fn insert_routine(
        &self,
        fields: &RoutineFields,
        timestamp: &str,
    ) -> Result<Routine, RoutineRepositoryError>;
    fn update_routine(
        &self,
        id: i64,
        fields: &RoutineFields,
        updated_at: &str,
    ) -> Result<Option<Routine>, RoutineRepositoryError>;
    fn deactivate_routine(
        &self,
        id: i64,
        updated_at: &str,
    ) -> Result<Option<Routine>, RoutineRepositoryError>;
    fn count_active_routines(&self) -> Result<usize, RoutineRepositoryError>;
}

pub trait RoutineImportRepository: Send + Sync {
    fn count_active_routines(&self) -> Result<usize, RoutineImportRepositoryError>;
    fn import_routines(
        &self,
        routines: &[RoutineFields],
        timestamp: &str,
        force: bool,
    ) -> Result<usize, RoutineImportRepositoryError>;
}

/// 朝ダイジェストの保存と取得（docs/specs/11-digest.md）。原文をそのまま持つ。
pub trait DigestRepository: Send + Sync {
    fn save_digest(&self, date: &str, body: &str, received_at: &str)
    -> Result<(), RepositoryError>;
    fn get_digest(&self, date: &str) -> Result<Option<StoredDigest>, RepositoryError>;
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StoredDigest {
    pub body: String,
    pub received_at: String,
}

pub trait LearningRepository: Send + Sync {
    fn save_learning_set(
        &self,
        date: &str,
        raw: &str,
        received_at: &str,
    ) -> Result<(), RepositoryError>;
    fn get_learning_set(&self, date: &str) -> Result<Option<StoredLearningSet>, RepositoryError>;
    fn save_learning_result(
        &self,
        date: &str,
        grades: &str,
        feeling: &str,
        completed_at: &str,
    ) -> Result<(), RepositoryError>;
    fn get_learning_result(
        &self,
        date: &str,
    ) -> Result<Option<StoredLearningResult>, RepositoryError>;
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StoredLearningSet {
    pub raw: String,
    pub received_at: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StoredLearningResult {
    pub grades: String,
    pub feeling: String,
    pub completed_at: String,
}

pub trait HarnessRepository: Send + Sync {
    fn replace_harness_proposals(
        &self,
        batch: &HarnessProposalBatch,
        received_at: &str,
    ) -> Result<(), HarnessRepositoryError>;
    fn list_harness_proposals(
        &self,
        date: &str,
    ) -> Result<Vec<StoredHarnessProposal>, HarnessRepositoryError>;
    fn get_harness_proposal(
        &self,
        id: i64,
    ) -> Result<Option<StoredHarnessProposal>, HarnessRepositoryError>;
    fn save_harness_decision(
        &self,
        id: i64,
        expected_status: HarnessStatus,
        status: HarnessStatus,
        decided_at: &str,
    ) -> Result<StoredHarnessProposal, HarnessRepositoryError>;
    fn list_pending_approved(&self) -> Result<Vec<StoredHarnessProposal>, HarnessRepositoryError>;
    fn list_failed(&self) -> Result<Vec<StoredHarnessProposal>, HarnessRepositoryError>;
    fn save_harness_apply_result(
        &self,
        id: i64,
        result: &ApplyResult,
        applied_at: &str,
    ) -> Result<StoredHarnessProposal, HarnessRepositoryError>;
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StoredHarnessProposal {
    pub id: i64,
    pub date: String,
    pub kind: HarnessKind,
    pub slug: String,
    pub insight_name: String,
    pub verdict: HarnessVerdict,
    pub category: Option<String>,
    pub summary: String,
    pub challenge_verdict: Option<ChallengeVerdict>,
    pub challenge_note: Option<String>,
    pub detail_path: Option<String>,
    pub detail_md: String,
    pub status: HarnessStatus,
    pub decided_at: Option<String>,
    pub apply_state: ApplyState,
    pub applied_at: Option<String>,
    pub apply_error: Option<String>,
    pub snapshot_path: Option<String>,
    pub received_at: String,
}

pub trait IntakeRepository: Send + Sync {
    fn replace_intake_candidates(
        &self,
        batch: &IntakeBatch,
        received_at: &str,
    ) -> Result<(), IntakeRepositoryError>;
    fn list_proposed_intake(&self) -> Result<Vec<StoredIntakeCandidate>, IntakeRepositoryError>;
    fn list_pending_approved_intake(
        &self,
    ) -> Result<Vec<StoredIntakeCandidate>, IntakeRepositoryError>;
    fn list_failed_intake(&self) -> Result<Vec<StoredIntakeCandidate>, IntakeRepositoryError>;
    fn latest_intake_receipt(&self) -> Result<Option<IntakeReceipt>, IntakeRepositoryError>;
    fn get_intake_candidate(
        &self,
        id: i64,
    ) -> Result<Option<StoredIntakeCandidate>, IntakeRepositoryError>;
    fn save_intake_decision(
        &self,
        id: i64,
        expected_status: IntakeStatus,
        status: IntakeStatus,
        decided_at: &str,
    ) -> Result<StoredIntakeCandidate, IntakeRepositoryError>;
    fn save_intake_apply_result(
        &self,
        id: i64,
        result: &IntakeApplyResult,
        applied_at: &str,
    ) -> Result<StoredIntakeCandidate, IntakeRepositoryError>;
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct IntakeReceipt {
    pub date: String,
    pub received_at: String,
    pub item_count: usize,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StoredIntakeCandidate {
    pub id: i64,
    pub date: String,
    pub slug: String,
    pub lane: IntakeLane,
    pub text: String,
    pub note: Option<String>,
    pub line_no: Option<i64>,
    pub source_path: String,
    pub source_note: Option<String>,
    pub status: IntakeStatus,
    pub decided_at: Option<String>,
    pub apply_state: IntakeApplyState,
    pub applied_at: Option<String>,
    pub apply_error: Option<String>,
    pub result_path: Option<String>,
    pub result_url: Option<String>,
    pub received_at: String,
}

pub trait InboxRepository: Send + Sync {
    fn replace_inbox_batch(
        &self,
        batch: &InboxBatch,
        received_at: &str,
    ) -> Result<(), InboxRepositoryError>;
    fn list_open_inbox_items(
        &self,
        now: &str,
    ) -> Result<Vec<StoredInboxItem>, InboxRepositoryError>;
    fn list_inbox_items_by_date(
        &self,
        date: &str,
    ) -> Result<Vec<StoredInboxItem>, InboxRepositoryError>;
    fn list_decided_inbox_items(
        &self,
        source: &str,
    ) -> Result<Vec<StoredInboxItem>, InboxRepositoryError>;
    fn list_failed_inbox_items(&self) -> Result<Vec<StoredInboxItem>, InboxRepositoryError>;
    fn get_inbox_item(&self, id: i64) -> Result<Option<StoredInboxItem>, InboxRepositoryError>;
    fn save_inbox_decision(
        &self,
        id: i64,
        expected_status: InboxStatus,
        expected_apply_state: InboxApplyState,
        decision_status: InboxStatus,
        choice: Option<&str>,
        decided_at: &str,
    ) -> Result<StoredInboxItem, InboxRepositoryError>;
    fn save_inbox_apply_result(
        &self,
        id: i64,
        expected_status: InboxStatus,
        expected_apply_state: InboxApplyState,
        result: &InboxApplyResult,
        applied_at: &str,
    ) -> Result<StoredInboxItem, InboxRepositoryError>;
    fn inbox_summary(&self) -> Result<Vec<InboxSourceSummary>, InboxRepositoryError>;
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StoredInboxItem {
    pub id: i64,
    pub source: String,
    pub date: String,
    pub slug: String,
    pub kind: InboxKind,
    pub title: String,
    pub body_md: Option<String>,
    pub options: Option<Vec<InboxOption>>,
    pub ref_path: Option<String>,
    pub payload: Option<serde_json::Value>,
    pub expires_at: Option<String>,
    pub status: InboxStatus,
    pub choice: Option<String>,
    pub decided_at: Option<String>,
    pub apply_state: InboxApplyState,
    pub applied_at: Option<String>,
    pub apply_error: Option<String>,
    pub result_path: Option<String>,
    pub result_url: Option<String>,
    pub received_at: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct InboxOpenCount {
    pub approve: usize,
    pub choose: usize,
    pub read: usize,
    pub alert: usize,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct InboxSourceSummary {
    pub source: String,
    pub latest_date: String,
    pub latest_received_at: String,
    pub latest_item_count: usize,
    pub open_count: InboxOpenCount,
    pub failed_count: usize,
}

pub trait Clock: Send + Sync {
    fn now(&self) -> DateTime<FixedOffset>;
}

#[derive(Debug, Error)]
#[error("vault reader failed")]
pub struct VaultReaderError {
    #[source]
    source: Box<dyn Error + Send + Sync>,
}

impl VaultReaderError {
    pub fn new(error: impl Error + Send + Sync + 'static) -> Self {
        Self {
            source: Box::new(error),
        }
    }
}

#[derive(Debug, Error)]
#[error("task repository failed")]
pub struct RepositoryError {
    #[source]
    source: Box<dyn Error + Send + Sync>,
}

impl RepositoryError {
    pub fn new(error: impl Error + Send + Sync + 'static) -> Self {
        Self {
            source: Box::new(error),
        }
    }
}

#[derive(Debug, Error)]
pub enum RoutineRepositoryError {
    #[error("an active routine with the same identity already exists")]
    Conflict,
    #[error("routine repository failed")]
    Internal {
        #[source]
        source: Box<dyn Error + Send + Sync>,
    },
}

impl RoutineRepositoryError {
    pub fn internal(error: impl Error + Send + Sync + 'static) -> Self {
        Self::Internal {
            source: Box::new(error),
        }
    }
}

#[derive(Debug, Error)]
pub enum RoutineImportRepositoryError {
    #[error("{count} active routines already exist")]
    ActiveRoutinesExist { count: usize },
    #[error("routine import repository failed")]
    Internal {
        #[source]
        source: Box<dyn Error + Send + Sync>,
    },
}

impl RoutineImportRepositoryError {
    pub fn internal(error: impl Error + Send + Sync + 'static) -> Self {
        Self::Internal {
            source: Box::new(error),
        }
    }
}

#[derive(Debug, Error)]
pub enum HarnessRepositoryError {
    #[error("harness proposals for the date contain a protected state")]
    Conflict,
    #[error("harness proposal no longer matches the expected state")]
    StateMismatch,
    #[error("harness repository failed")]
    Internal {
        #[source]
        source: Box<dyn Error + Send + Sync>,
    },
}

impl HarnessRepositoryError {
    pub fn internal(error: impl Error + Send + Sync + 'static) -> Self {
        Self::Internal {
            source: Box::new(error),
        }
    }
}

#[derive(Debug, Error)]
pub enum IntakeRepositoryError {
    #[error("intake candidates for the date contain a protected state")]
    Conflict,
    #[error("intake candidate no longer matches the expected state")]
    StateMismatch,
    #[error("intake repository failed")]
    Internal {
        #[source]
        source: Box<dyn Error + Send + Sync>,
    },
}
impl IntakeRepositoryError {
    pub fn internal(error: impl Error + Send + Sync + 'static) -> Self {
        Self::Internal {
            source: Box::new(error),
        }
    }
}

#[derive(Debug, Error)]
pub enum InboxRepositoryError {
    #[error("inbox items for the source and date contain a protected state")]
    Conflict,
    #[error("inbox item no longer matches the expected state")]
    StateMismatch,
    #[error("inbox repository failed")]
    Internal {
        #[source]
        source: Box<dyn Error + Send + Sync>,
    },
}

impl InboxRepositoryError {
    pub fn internal(error: impl Error + Send + Sync + 'static) -> Self {
        Self::Internal {
            source: Box::new(error),
        }
    }
}
