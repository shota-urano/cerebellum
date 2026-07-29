use serde::{Deserialize, Serialize};

use crate::domain::{
    day::{DaySnapshot, Progress, SummaryDay},
    digest::{Block, Section},
    harness::{ApplyResultInput, HarnessProposalBatchInput, HarnessProposalInput},
    routine::{Routine, RoutineFields},
    task::CheckedTask,
};
use crate::usecase::{
    manage_digest::{DigestView, StoredAt},
    manage_harness::HarnessProposalList,
    ports::StoredHarnessProposal,
};

#[derive(Debug, Serialize)]
pub(super) struct HealthDto {
    db: &'static str,
    routines: usize,
    version: &'static str,
}

impl HealthDto {
    pub(super) fn new(db_ok: bool, routines: usize, version: &'static str) -> Self {
        Self {
            db: status(db_ok),
            routines,
            version,
        }
    }
}

fn status(ok: bool) -> &'static str {
    if ok { "ok" } else { "ng" }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct DayDto {
    date: String,
    weekday: char,
    readonly: bool,
    progress: ProgressDto,
    tasks: Vec<TaskDto>,
}

impl From<DaySnapshot> for DayDto {
    fn from(snapshot: DaySnapshot) -> Self {
        Self {
            date: snapshot.date,
            weekday: snapshot.weekday,
            readonly: snapshot.readonly,
            progress: snapshot.progress.into(),
            tasks: snapshot.tasks.into_iter().map(TaskDto::from).collect(),
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProgressDto {
    done: usize,
    total: usize,
}

impl From<Progress> for ProgressDto {
    fn from(progress: Progress) -> Self {
        Self {
            done: progress.done,
            total: progress.total,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct TaskDto {
    id: String,
    time: String,
    effort: String,
    tool: String,
    content: String,
    done: bool,
    checked_at: Option<String>,
    detail_ref: Option<String>,
}

impl From<CheckedTask> for TaskDto {
    fn from(checked_task: CheckedTask) -> Self {
        let checked_at = if checked_task.done {
            checked_task.checked_at
        } else {
            None
        };

        Self {
            id: checked_task.task.id,
            time: checked_task.task.time,
            effort: checked_task.task.effort,
            tool: checked_task.task.tool,
            content: checked_task.task.content,
            done: checked_task.done,
            checked_at,
            detail_ref: checked_task.task.detail_ref,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct SummaryDto {
    days: Vec<SummaryDayDto>,
}

impl From<Vec<SummaryDay>> for SummaryDto {
    fn from(days: Vec<SummaryDay>) -> Self {
        Self {
            days: days.into_iter().map(SummaryDayDto::from).collect(),
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct RoutineInputDto {
    interval: String,
    time: String,
    effort: String,
    tool: String,
    content: String,
    #[serde(default)]
    detail_ref: Option<String>,
}

impl From<RoutineInputDto> for RoutineFields {
    fn from(input: RoutineInputDto) -> Self {
        Self {
            interval: input.interval,
            time: input.time,
            effort: input.effort,
            tool: input.tool,
            content: input.content,
            detail_ref: input.detail_ref,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct RoutinesDto {
    routines: Vec<RoutineDto>,
}

impl From<Vec<Routine>> for RoutinesDto {
    fn from(routines: Vec<Routine>) -> Self {
        Self {
            routines: routines.into_iter().map(RoutineDto::from).collect(),
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct RoutineResponseDto {
    routine: RoutineDto,
}

impl From<Routine> for RoutineResponseDto {
    fn from(routine: Routine) -> Self {
        Self {
            routine: routine.into(),
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RoutineDto {
    id: i64,
    interval: String,
    time: String,
    effort: String,
    tool: String,
    content: String,
    active: bool,
    detail_ref: Option<String>,
    updated_at: String,
}

impl From<Routine> for RoutineDto {
    fn from(routine: Routine) -> Self {
        Self {
            id: routine.id,
            interval: routine.interval,
            time: routine.time,
            effort: routine.effort,
            tool: routine.tool,
            content: routine.content,
            active: routine.active,
            detail_ref: routine.detail_ref,
            updated_at: routine.updated_at,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SummaryDayDto {
    date: String,
    done: usize,
    total: usize,
}

impl From<SummaryDay> for SummaryDayDto {
    fn from(day: SummaryDay) -> Self {
        Self {
            date: day.date,
            done: day.done,
            total: day.total,
        }
    }
}

// ---- ダイジェスト（docs/specs/03-api.md §3・docs/specs/11-digest.md）----

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct DigestInputDto {
    pub(super) date: String,
    pub(super) body: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct DigestStoredDto {
    date: String,
    received_at: String,
}

impl From<StoredAt> for DigestStoredDto {
    fn from(stored: StoredAt) -> Self {
        Self {
            date: stored.date,
            received_at: stored.received_at,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct DigestDto {
    date: String,
    received_at: Option<String>,
    sections: Vec<SectionDto>,
}

impl From<DigestView> for DigestDto {
    fn from(view: DigestView) -> Self {
        Self {
            date: view.date,
            received_at: view.received_at,
            sections: view
                .digest
                .sections
                .into_iter()
                .map(SectionDto::from)
                .collect(),
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SectionDto {
    kind: String,
    title: Option<String>,
    blocks: Vec<BlockDto>,
}

impl From<Section> for SectionDto {
    fn from(section: Section) -> Self {
        Self {
            kind: section.kind,
            title: section.title,
            blocks: section.blocks.into_iter().map(BlockDto::from).collect(),
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BlockDto {
    kind: String,
    text: String,
    note_path: Option<String>,
}

impl From<Block> for BlockDto {
    fn from(block: Block) -> Self {
        Self {
            kind: block.kind,
            text: block.text,
            note_path: block.note_path,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct HarnessProposalBatchInputDto {
    date: Option<String>,
    kind: Option<String>,
    proposals: Option<Vec<HarnessProposalInputDto>>,
}

impl From<HarnessProposalBatchInputDto> for HarnessProposalBatchInput {
    fn from(input: HarnessProposalBatchInputDto) -> Self {
        Self {
            date: input.date,
            kind: input.kind,
            proposals: input
                .proposals
                .map(|proposals| proposals.into_iter().map(Into::into).collect()),
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HarnessProposalInputDto {
    slug: Option<String>,
    insight_name: Option<String>,
    verdict: Option<String>,
    category: Option<String>,
    summary: Option<String>,
    challenge_verdict: Option<String>,
    challenge_note: Option<String>,
    detail_path: Option<String>,
    detail_md: Option<String>,
}

impl From<HarnessProposalInputDto> for HarnessProposalInput {
    fn from(input: HarnessProposalInputDto) -> Self {
        Self {
            slug: input.slug,
            insight_name: input.insight_name,
            verdict: input.verdict,
            category: input.category,
            summary: input.summary,
            challenge_verdict: input.challenge_verdict,
            challenge_note: input.challenge_note,
            detail_path: input.detail_path,
            detail_md: input.detail_md,
        }
    }
}

#[derive(Debug, Deserialize)]
pub(super) struct HarnessDecisionInputDto {
    pub(super) status: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct HarnessApplyResultInputDto {
    state: Option<String>,
    snapshot_path: Option<String>,
    error: Option<String>,
}

impl From<HarnessApplyResultInputDto> for ApplyResultInput {
    fn from(input: HarnessApplyResultInputDto) -> Self {
        Self {
            state: input.state,
            snapshot_path: input.snapshot_path,
            error: input.error,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct HarnessProposalListDto {
    date: String,
    received_at: Option<String>,
    proposals: Vec<HarnessProposalDto>,
}

impl From<HarnessProposalList> for HarnessProposalListDto {
    fn from(list: HarnessProposalList) -> Self {
        Self {
            date: list.date,
            received_at: list.received_at,
            proposals: list
                .proposals
                .into_iter()
                .map(HarnessProposalDto::from)
                .collect(),
        }
    }
}

#[derive(Debug, Serialize)]
pub(super) struct HarnessProposalsDto {
    proposals: Vec<HarnessProposalDto>,
}

impl From<Vec<StoredHarnessProposal>> for HarnessProposalsDto {
    fn from(proposals: Vec<StoredHarnessProposal>) -> Self {
        Self {
            proposals: proposals
                .into_iter()
                .map(HarnessProposalDto::from)
                .collect(),
        }
    }
}

#[derive(Debug, Serialize)]
pub(super) struct HarnessProposalResponseDto {
    proposal: HarnessProposalDto,
}

impl From<StoredHarnessProposal> for HarnessProposalResponseDto {
    fn from(proposal: StoredHarnessProposal) -> Self {
        Self {
            proposal: proposal.into(),
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct HarnessProposalDto {
    id: i64,
    date: String,
    kind: &'static str,
    slug: String,
    insight_name: String,
    verdict: &'static str,
    category: Option<String>,
    summary: String,
    challenge_verdict: Option<&'static str>,
    challenge_note: Option<String>,
    detail_path: Option<String>,
    detail_md: String,
    status: &'static str,
    decided_at: Option<String>,
    apply_state: &'static str,
    applied_at: Option<String>,
    error: Option<String>,
    snapshot_path: Option<String>,
}

impl From<StoredHarnessProposal> for HarnessProposalDto {
    fn from(proposal: StoredHarnessProposal) -> Self {
        Self {
            id: proposal.id,
            date: proposal.date,
            kind: proposal.kind.as_str(),
            slug: proposal.slug,
            insight_name: proposal.insight_name,
            verdict: proposal.verdict.as_str(),
            category: proposal.category,
            summary: proposal.summary,
            challenge_verdict: proposal
                .challenge_verdict
                .map(crate::domain::harness::ChallengeVerdict::as_str),
            challenge_note: proposal.challenge_note,
            detail_path: proposal.detail_path,
            detail_md: proposal.detail_md,
            status: proposal.status.as_str(),
            decided_at: proposal.decided_at,
            apply_state: proposal.apply_state.as_str(),
            applied_at: proposal.applied_at,
            error: proposal.apply_error,
            snapshot_path: proposal.snapshot_path,
        }
    }
}
