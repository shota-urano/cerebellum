use serde::{Deserialize, Serialize};

use crate::domain::{
    day::{DaySnapshot, Progress, SummaryDay},
    digest::{Block, Section},
    harness::{ApplyResultInput, HarnessProposalBatchInput, HarnessProposalInput},
    intake::{IntakeApplyResultInput, IntakeBatchInput, IntakeItemInput},
    learning::{
        LearningGrade, LearningGradeInput, LearningGradeValue, LearningProblem,
        LearningProblemInput, LearningResultInput, LearningSetInput,
    },
    routine::{Routine, RoutineFields},
    task::CheckedTask,
};
use crate::usecase::{
    manage_digest::{DigestView, StoredAt},
    manage_harness::HarnessProposalList,
    manage_intake::{IntakeList, IntakeSaved},
    manage_learning::{LearningResultView, LearningSetView, LearningStoredAt},
    ports::{StoredHarnessProposal, StoredIntakeCandidate},
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

// ---- 学習セット（docs/specs/03-api.md §3・docs/specs/14-learning.md）----

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct LearningInputDto {
    pub(super) date: String,
    theme: Option<String>,
    source: Option<String>,
    lesson_md: Option<String>,
    problems: Option<Vec<LearningProblemInputDto>>,
    closing_md: Option<String>,
}

impl From<LearningInputDto> for LearningSetInput {
    fn from(input: LearningInputDto) -> Self {
        Self {
            theme: input.theme,
            source: input.source,
            lesson_md: input.lesson_md,
            problems: input
                .problems
                .map(|problems| problems.into_iter().map(Into::into).collect()),
            closing_md: input.closing_md,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LearningProblemInputDto {
    no: Option<u32>,
    kind: Option<String>,
    question_md: Option<String>,
    answer_md: Option<String>,
    answer_type: Option<String>,
    expected: Option<String>,
    choices: Option<Vec<String>>,
    workdir: Option<String>,
}

impl From<LearningProblemInputDto> for LearningProblemInput {
    fn from(input: LearningProblemInputDto) -> Self {
        Self {
            no: input.no,
            kind: input.kind,
            question_md: input.question_md,
            answer_md: input.answer_md,
            answer_type: input.answer_type,
            expected: input.expected,
            choices: input.choices,
            workdir: input.workdir,
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
pub(super) struct LearningStoredDto {
    date: String,
    received_at: String,
}

impl From<LearningStoredAt> for LearningStoredDto {
    fn from(stored: LearningStoredAt) -> Self {
        Self {
            date: stored.date,
            received_at: stored.received_at,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct LearningSetDto {
    date: String,
    received_at: String,
    theme: String,
    source: String,
    lesson_md: String,
    problems: Vec<LearningProblemDto>,
    closing_md: Option<String>,
}

impl From<LearningSetView> for LearningSetDto {
    fn from(view: LearningSetView) -> Self {
        Self {
            date: view.date,
            received_at: view.received_at,
            theme: view.learning_set.theme,
            source: view.learning_set.source,
            lesson_md: view.learning_set.lesson_md,
            problems: view
                .learning_set
                .problems
                .into_iter()
                .map(Into::into)
                .collect(),
            closing_md: view.learning_set.closing_md,
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
struct LearningProblemDto {
    no: u32,
    kind: String,
    question_md: String,
    answer_md: String,
    answer_type: Option<String>,
    expected: Option<String>,
    choices: Option<Vec<String>>,
    workdir: Option<String>,
}

impl From<LearningProblem> for LearningProblemDto {
    fn from(problem: LearningProblem) -> Self {
        Self {
            no: problem.no,
            kind: problem.kind,
            question_md: problem.question_md,
            answer_md: problem.answer_md,
            answer_type: problem.answer_type,
            expected: problem.expected,
            choices: problem.choices,
            workdir: problem.workdir,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct LearningResultInputDto {
    grades: Option<Vec<LearningGradeInputDto>>,
    feeling: Option<String>,
}

impl From<LearningResultInputDto> for LearningResultInput {
    fn from(input: LearningResultInputDto) -> Self {
        Self {
            grades: input
                .grades
                .map(|grades| grades.into_iter().map(Into::into).collect()),
            feeling: input.feeling,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LearningGradeInputDto {
    no: Option<u32>,
    grade: Option<String>,
    answer: Option<String>,
}

impl From<LearningGradeInputDto> for LearningGradeInput {
    fn from(input: LearningGradeInputDto) -> Self {
        Self {
            no: input.no,
            grade: input.grade,
            answer: input.answer,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct LearningResultDto {
    date: String,
    grades: Vec<LearningGradeDto>,
    feeling: String,
    completed_at: String,
}

impl From<LearningResultView> for LearningResultDto {
    fn from(view: LearningResultView) -> Self {
        Self {
            date: view.date,
            grades: view.result.grades.into_iter().map(Into::into).collect(),
            feeling: view.result.feeling,
            completed_at: view.completed_at,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct LearningGradeDto {
    no: u32,
    grade: LearningGradeValue,
    #[serde(skip_serializing_if = "Option::is_none")]
    answer: Option<String>,
}

impl From<LearningGrade> for LearningGradeDto {
    fn from(grade: LearningGrade) -> Self {
        Self {
            no: grade.no,
            grade: grade.grade,
            answer: grade.answer,
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct IntakeBatchInputDto {
    date: Option<String>,
    source_path: Option<String>,
    source_note: Option<String>,
    items: Option<Vec<IntakeItemInputDto>>,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct IntakeItemInputDto {
    lane: Option<String>,
    text: Option<String>,
    note: Option<String>,
    line_no: Option<i64>,
}
impl From<IntakeBatchInputDto> for IntakeBatchInput {
    fn from(v: IntakeBatchInputDto) -> Self {
        Self {
            date: v.date,
            source_path: v.source_path,
            source_note: v.source_note,
            items: v.items.map(|xs| xs.into_iter().map(Into::into).collect()),
        }
    }
}
impl From<IntakeItemInputDto> for IntakeItemInput {
    fn from(v: IntakeItemInputDto) -> Self {
        Self {
            lane: v.lane,
            text: v.text,
            note: v.note,
            line_no: v.line_no,
        }
    }
}

#[derive(Debug, Deserialize)]
pub(super) struct IntakeDecisionInputDto {
    pub(super) status: String,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct IntakeApplyResultInputDto {
    state: Option<String>,
    result_path: Option<String>,
    result_url: Option<String>,
    error: Option<String>,
}
impl From<IntakeApplyResultInputDto> for IntakeApplyResultInput {
    fn from(v: IntakeApplyResultInputDto) -> Self {
        Self {
            state: v.state,
            result_path: v.result_path,
            result_url: v.result_url,
            error: v.error,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct IntakeSavedDto {
    date: String,
    received_at: String,
    item_count: usize,
    items: Vec<IntakeCandidateDto>,
}
impl From<IntakeSaved> for IntakeSavedDto {
    fn from(v: IntakeSaved) -> Self {
        Self {
            date: v.date,
            received_at: v.received_at,
            item_count: v.item_count,
            items: v.items.into_iter().map(Into::into).collect(),
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct IntakeListDto {
    items: Vec<IntakeCandidateDto>,
    latest_date: Option<String>,
    latest_received_at: Option<String>,
    latest_item_count: Option<usize>,
}
impl From<IntakeList> for IntakeListDto {
    fn from(v: IntakeList) -> Self {
        let (latest_date, latest_received_at, latest_item_count) = match v.latest {
            Some(r) => (Some(r.date), Some(r.received_at), Some(r.item_count)),
            None => (None, None, None),
        };
        Self {
            items: v.items.into_iter().map(Into::into).collect(),
            latest_date,
            latest_received_at,
            latest_item_count,
        }
    }
}

#[derive(Debug, Serialize)]
pub(super) struct IntakeResponseDto {
    item: IntakeCandidateDto,
}
impl From<StoredIntakeCandidate> for IntakeResponseDto {
    fn from(v: StoredIntakeCandidate) -> Self {
        Self { item: v.into() }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct IntakeCandidateDto {
    id: i64,
    date: String,
    slug: String,
    lane: &'static str,
    text: String,
    note: Option<String>,
    line_no: Option<i64>,
    source_path: String,
    source_note: Option<String>,
    status: &'static str,
    decided_at: Option<String>,
    apply_state: &'static str,
    applied_at: Option<String>,
    error: Option<String>,
    result_path: Option<String>,
    result_url: Option<String>,
    received_at: String,
}
impl From<StoredIntakeCandidate> for IntakeCandidateDto {
    fn from(v: StoredIntakeCandidate) -> Self {
        Self {
            id: v.id,
            date: v.date,
            slug: v.slug,
            lane: v.lane.as_str(),
            text: v.text,
            note: v.note,
            line_no: v.line_no,
            source_path: v.source_path,
            source_note: v.source_note,
            status: v.status.as_str(),
            decided_at: v.decided_at,
            apply_state: v.apply_state.as_str(),
            applied_at: v.applied_at,
            error: v.apply_error,
            result_path: v.result_path,
            result_url: v.result_url,
            received_at: v.received_at,
        }
    }
}
