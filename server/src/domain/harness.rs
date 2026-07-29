use std::collections::HashSet;

use super::error::DomainError;

pub const MAX_PROPOSAL_BODY_BYTES: usize = 512 * 1024;
pub const MAX_DETAIL_MD_BYTES: usize = 128 * 1024;

const MAX_PROPOSALS: usize = 30;
const MAX_SUMMARY_CHARS: usize = 200;
const MAX_CHALLENGE_NOTE_CHARS: usize = 300;
const MAX_APPLY_ERROR_CHARS: usize = 1000;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum HarnessKind {
    Daily,
    Prune,
    ModelSwitch,
}

impl HarnessKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Daily => "daily",
            Self::Prune => "prune",
            Self::ModelSwitch => "model_switch",
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum HarnessVerdict {
    Adopt,
    Experiment,
    Killed,
}

impl HarnessVerdict {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Adopt => "adopt",
            Self::Experiment => "experiment",
            Self::Killed => "killed",
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ChallengeVerdict {
    Hold,
    Weaken,
    Refute,
}

impl ChallengeVerdict {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Hold => "hold",
            Self::Weaken => "weaken",
            Self::Refute => "refute",
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum HarnessStatus {
    Proposed,
    Approved,
    Rejected,
    Killed,
}

impl HarnessStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Proposed => "proposed",
            Self::Approved => "approved",
            Self::Rejected => "rejected",
            Self::Killed => "killed",
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ApplyState {
    Pending,
    Applied,
    Failed,
}

impl ApplyState {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Pending => "pending",
            Self::Applied => "applied",
            Self::Failed => "failed",
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct HarnessProposalBatchInput {
    pub date: Option<String>,
    pub kind: Option<String>,
    pub proposals: Option<Vec<HarnessProposalInput>>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct HarnessProposalInput {
    pub slug: Option<String>,
    pub insight_name: Option<String>,
    pub verdict: Option<String>,
    pub category: Option<String>,
    pub summary: Option<String>,
    pub challenge_verdict: Option<String>,
    pub challenge_note: Option<String>,
    pub detail_path: Option<String>,
    pub detail_md: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct HarnessProposalBatch {
    pub date: String,
    pub kind: HarnessKind,
    pub proposals: Vec<HarnessProposal>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct HarnessProposal {
    pub slug: String,
    pub insight_name: String,
    pub verdict: HarnessVerdict,
    pub category: Option<String>,
    pub summary: String,
    pub challenge_verdict: Option<ChallengeVerdict>,
    pub challenge_note: Option<String>,
    pub detail_path: Option<String>,
    pub detail_md: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ApplyResultInput {
    pub state: Option<String>,
    pub snapshot_path: Option<String>,
    pub error: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ApplyResult {
    pub state: ApplyState,
    pub snapshot_path: Option<String>,
    pub error: Option<String>,
}

pub fn validate_proposal_batch(
    input: HarnessProposalBatchInput,
    body_size: usize,
) -> Result<HarnessProposalBatch, DomainError> {
    if body_size > MAX_PROPOSAL_BODY_BYTES {
        return proposal_error(format!(
            "body must not exceed {MAX_PROPOSAL_BODY_BYTES} bytes"
        ));
    }

    let date = required(input.date, "date")?;
    if !is_valid_date_input(&date) {
        return proposal_error("date must be today or a valid YYYY-MM-DD");
    }

    let kind = match input.kind.as_deref().unwrap_or("daily") {
        "daily" => HarnessKind::Daily,
        "prune" => HarnessKind::Prune,
        "model_switch" => HarnessKind::ModelSwitch,
        _ => return proposal_error("kind must be daily, prune, or model_switch"),
    };

    let proposals = input
        .proposals
        .ok_or_else(|| DomainError::InvalidHarnessProposal("proposals is required".to_owned()))?;
    if proposals.is_empty() || proposals.len() > MAX_PROPOSALS {
        return proposal_error(format!(
            "proposals must contain between 1 and {MAX_PROPOSALS} items"
        ));
    }

    let mut slugs = HashSet::with_capacity(proposals.len());
    let mut validated = Vec::with_capacity(proposals.len());
    for proposal in proposals {
        let proposal = validate_proposal(proposal)?;
        if !slugs.insert(proposal.slug.clone()) {
            return proposal_error(format!("duplicate slug: {}", proposal.slug));
        }
        validated.push(proposal);
    }

    Ok(HarnessProposalBatch {
        date,
        kind,
        proposals: validated,
    })
}

pub fn validate_decision(
    current_status: HarnessStatus,
    apply_state: ApplyState,
    requested_status: &str,
) -> Result<HarnessStatus, DomainError> {
    if current_status == HarnessStatus::Killed {
        return transition_error("killed proposals cannot receive a decision");
    }
    if apply_state != ApplyState::Pending {
        return transition_error("a decision requires apply_state pending");
    }

    match requested_status {
        "proposed" => Ok(HarnessStatus::Proposed),
        "approved" => Ok(HarnessStatus::Approved),
        "rejected" => Ok(HarnessStatus::Rejected),
        _ => transition_error("decision status must be proposed, approved, or rejected"),
    }
}

pub fn validate_apply_result(
    current_status: HarnessStatus,
    input: ApplyResultInput,
) -> Result<ApplyResult, DomainError> {
    if current_status != HarnessStatus::Approved {
        return transition_error("apply result requires status approved");
    }

    let state = match input.state.as_deref() {
        Some("applied") => ApplyState::Applied,
        Some("failed") => ApplyState::Failed,
        Some(_) => return transition_error("apply result state must be applied or failed"),
        None => return transition_error("apply result state is required"),
    };

    let error = match state {
        ApplyState::Failed => {
            let error = required_transition(input.error, "error")?;
            if error.chars().count() > MAX_APPLY_ERROR_CHARS {
                return transition_error(format!(
                    "error must not exceed {MAX_APPLY_ERROR_CHARS} characters"
                ));
            }
            Some(error)
        }
        ApplyState::Applied => None,
        ApplyState::Pending => unreachable!("pending is not an apply-result state"),
    };

    Ok(ApplyResult {
        state,
        snapshot_path: input.snapshot_path,
        error,
    })
}

fn validate_proposal(input: HarnessProposalInput) -> Result<HarnessProposal, DomainError> {
    let slug = required(input.slug, "slug")?;
    let insight_name = required(input.insight_name, "insightName")?;
    let verdict = match required(input.verdict, "verdict")?.as_str() {
        "adopt" => HarnessVerdict::Adopt,
        "experiment" => HarnessVerdict::Experiment,
        "killed" => HarnessVerdict::Killed,
        _ => return proposal_error("verdict must be adopt, experiment, or killed"),
    };
    let summary = required(input.summary, "summary")?;
    if summary.chars().count() > MAX_SUMMARY_CHARS {
        return proposal_error(format!(
            "summary must not exceed {MAX_SUMMARY_CHARS} characters"
        ));
    }

    let challenge_verdict = match input.challenge_verdict.as_deref() {
        Some("hold") => Some(ChallengeVerdict::Hold),
        Some("weaken") => Some(ChallengeVerdict::Weaken),
        Some("refute") => Some(ChallengeVerdict::Refute),
        Some(_) => {
            return proposal_error("challengeVerdict must be hold, weaken, or refute");
        }
        None => None,
    };
    if matches!(verdict, HarnessVerdict::Adopt | HarnessVerdict::Experiment)
        && challenge_verdict.is_none()
    {
        return proposal_error("challengeVerdict is required for adopt and experiment proposals");
    }

    if let Some(note) = &input.challenge_note
        && note.chars().count() > MAX_CHALLENGE_NOTE_CHARS
    {
        return proposal_error(format!(
            "challengeNote must not exceed {MAX_CHALLENGE_NOTE_CHARS} characters"
        ));
    }

    let detail_md = required(input.detail_md, "detailMd")?;
    if detail_md.len() > MAX_DETAIL_MD_BYTES {
        return proposal_error(format!(
            "detailMd must not exceed {MAX_DETAIL_MD_BYTES} bytes"
        ));
    }

    Ok(HarnessProposal {
        slug,
        insight_name,
        verdict,
        category: input.category,
        summary,
        challenge_verdict,
        challenge_note: input.challenge_note,
        detail_path: input.detail_path,
        detail_md,
    })
}

fn required(value: Option<String>, name: &str) -> Result<String, DomainError> {
    match value {
        Some(value) if !value.trim().is_empty() => Ok(value),
        _ => proposal_error(format!("{name} is required")),
    }
}

fn required_transition(value: Option<String>, name: &str) -> Result<String, DomainError> {
    match value {
        Some(value) if !value.trim().is_empty() => Ok(value),
        _ => transition_error(format!("{name} is required")),
    }
}

fn proposal_error<T>(message: impl Into<String>) -> Result<T, DomainError> {
    Err(DomainError::InvalidHarnessProposal(message.into()))
}

fn transition_error<T>(message: impl Into<String>) -> Result<T, DomainError> {
    Err(DomainError::InvalidHarnessTransition(message.into()))
}

fn is_valid_date_input(value: &str) -> bool {
    if value == "today" {
        return true;
    }

    let bytes = value.as_bytes();
    if bytes.len() != 10
        || bytes[4] != b'-'
        || bytes[7] != b'-'
        || bytes
            .iter()
            .enumerate()
            .any(|(index, byte)| index != 4 && index != 7 && !byte.is_ascii_digit())
    {
        return false;
    }

    let year = parse_digits(&bytes[0..4]);
    let month = parse_digits(&bytes[5..7]);
    let day = parse_digits(&bytes[8..10]);
    let max_day = match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if year.is_multiple_of(400) || (year.is_multiple_of(4) && !year.is_multiple_of(100)) => {
            29
        }
        2 => 28,
        _ => return false,
    };
    (1..=max_day).contains(&day)
}

fn parse_digits(bytes: &[u8]) -> u32 {
    bytes
        .iter()
        .fold(0, |value, byte| value * 10 + u32::from(byte - b'0'))
}

#[cfg(test)]
mod tests {
    use super::{
        ApplyResultInput, ApplyState, ChallengeVerdict, HarnessKind, HarnessProposalBatchInput,
        HarnessProposalInput, HarnessStatus, HarnessVerdict, MAX_DETAIL_MD_BYTES,
        MAX_PROPOSAL_BODY_BYTES, validate_apply_result, validate_decision, validate_proposal_batch,
    };

    fn proposal() -> HarnessProposalInput {
        HarnessProposalInput {
            slug: Some("search-state".to_owned()),
            insight_name: Some("External search state".to_owned()),
            verdict: Some("experiment".to_owned()),
            category: Some("experiment".to_owned()),
            summary: Some("Try external search state".to_owned()),
            challenge_verdict: Some("weaken".to_owned()),
            challenge_note: Some("Added a measurable threshold".to_owned()),
            detail_path: Some("harness/proposal.md".to_owned()),
            detail_md: Some("# Proposal".to_owned()),
        }
    }

    fn batch(proposals: Vec<HarnessProposalInput>) -> HarnessProposalBatchInput {
        HarnessProposalBatchInput {
            date: Some("2026-07-29".to_owned()),
            kind: None,
            proposals: Some(proposals),
        }
    }

    fn proposals_with_unique_slugs(count: usize) -> Vec<HarnessProposalInput> {
        (0..count)
            .map(|index| {
                let mut item = proposal();
                item.slug = Some(format!("proposal-{index}"));
                item
            })
            .collect()
    }

    fn assert_invalid(input: HarnessProposalBatchInput) {
        assert!(validate_proposal_batch(input, 1).is_err());
    }

    #[test]
    fn validates_a_complete_batch_and_defaults_kind_to_daily() {
        let validated = validate_proposal_batch(batch(vec![proposal()]), 1).unwrap();
        assert_eq!(validated.date, "2026-07-29");
        assert_eq!(validated.kind, HarnessKind::Daily);
        assert_eq!(validated.proposals[0].verdict, HarnessVerdict::Experiment);
        assert_eq!(
            validated.proposals[0].challenge_verdict,
            Some(ChallengeVerdict::Weaken)
        );
    }

    #[test]
    fn rejects_each_missing_required_field() {
        let mut missing_date = batch(vec![proposal()]);
        missing_date.date = None;
        assert_invalid(missing_date);

        let missing_proposals = HarnessProposalBatchInput {
            date: Some("2026-07-29".to_owned()),
            kind: None,
            proposals: None,
        };
        assert_invalid(missing_proposals);

        for clear in [
            |proposal: &mut HarnessProposalInput| proposal.slug = None,
            |proposal: &mut HarnessProposalInput| proposal.insight_name = None,
            |proposal: &mut HarnessProposalInput| proposal.verdict = None,
            |proposal: &mut HarnessProposalInput| proposal.summary = None,
            |proposal: &mut HarnessProposalInput| proposal.detail_md = None,
        ] {
            let mut item = proposal();
            clear(&mut item);
            assert_invalid(batch(vec![item]));
        }
    }

    #[test]
    fn rejects_empty_proposals() {
        assert_invalid(batch(Vec::new()));
    }

    #[test]
    fn rejects_more_than_30_unique_proposals() {
        assert_invalid(batch(proposals_with_unique_slugs(31)));
    }

    #[test]
    fn accepts_30_unique_proposals() {
        let validated = validate_proposal_batch(batch(proposals_with_unique_slugs(30)), 1).unwrap();
        assert_eq!(validated.proposals.len(), 30);
    }

    #[test]
    fn rejects_duplicate_slugs() {
        assert_invalid(batch(vec![proposal(), proposal()]));
    }

    #[test]
    fn rejects_a_body_over_512_kib() {
        assert!(
            validate_proposal_batch(batch(vec![proposal()]), MAX_PROPOSAL_BODY_BYTES + 1).is_err()
        );
        assert!(validate_proposal_batch(batch(vec![proposal()]), MAX_PROPOSAL_BODY_BYTES).is_ok());
    }

    #[test]
    fn rejects_detail_md_over_128_kib() {
        let mut item = proposal();
        item.detail_md = Some("a".repeat(MAX_DETAIL_MD_BYTES + 1));
        assert_invalid(batch(vec![item]));

        let mut at_limit = proposal();
        at_limit.detail_md = Some("a".repeat(MAX_DETAIL_MD_BYTES));
        assert!(validate_proposal_batch(batch(vec![at_limit]), 1).is_ok());
    }

    #[test]
    fn rejects_invalid_vocabularies() {
        let mut invalid_kind = batch(vec![proposal()]);
        invalid_kind.kind = Some("weekly".to_owned());
        assert_invalid(invalid_kind);

        let mut invalid_verdict = proposal();
        invalid_verdict.verdict = Some("maybe".to_owned());
        assert_invalid(batch(vec![invalid_verdict]));

        let mut invalid_challenge = proposal();
        invalid_challenge.challenge_verdict = Some("unknown".to_owned());
        assert_invalid(batch(vec![invalid_challenge]));
    }

    #[test]
    fn accepts_supported_explicit_kinds() {
        for (kind, expected) in [
            ("prune", HarnessKind::Prune),
            ("model_switch", HarnessKind::ModelSwitch),
        ] {
            let mut input = batch(vec![proposal()]);
            input.kind = Some(kind.to_owned());
            let validated = validate_proposal_batch(input, 1).unwrap();
            assert_eq!(validated.kind, expected);
        }
    }

    #[test]
    fn requires_challenge_verdict_for_adopt_and_experiment() {
        for verdict in ["adopt", "experiment"] {
            let mut item = proposal();
            item.verdict = Some(verdict.to_owned());
            item.challenge_verdict = None;
            assert_invalid(batch(vec![item]));
        }

        let mut killed = proposal();
        killed.verdict = Some("killed".to_owned());
        killed.challenge_verdict = None;
        assert!(validate_proposal_batch(batch(vec![killed]), 1).is_ok());
    }

    #[test]
    fn rejects_text_over_character_limits() {
        let mut long_summary = proposal();
        long_summary.summary = Some("界".repeat(201));
        assert_invalid(batch(vec![long_summary]));

        let mut long_challenge_note = proposal();
        long_challenge_note.challenge_note = Some("界".repeat(301));
        assert_invalid(batch(vec![long_challenge_note]));
    }

    #[test]
    fn accepts_summary_at_200_character_limit() {
        let summary = "界".repeat(200);
        let mut item = proposal();
        item.summary = Some(summary.clone());

        let validated = validate_proposal_batch(batch(vec![item]), 1).unwrap();
        assert_eq!(validated.proposals[0].summary, summary);
        assert_eq!(validated.proposals[0].summary.chars().count(), 200);
    }

    #[test]
    fn rejects_invalid_dates() {
        for date in ["2026-7-29", "2026-02-29", "2026-13-01", "tomorrow"] {
            let mut input = batch(vec![proposal()]);
            input.date = Some(date.to_owned());
            assert_invalid(input);
        }

        let mut leap_day = batch(vec![proposal()]);
        leap_day.date = Some("2028-02-29".to_owned());
        assert!(validate_proposal_batch(leap_day, 1).is_ok());

        let mut today = batch(vec![proposal()]);
        today.date = Some("today".to_owned());
        assert!(validate_proposal_batch(today, 1).is_ok());
    }

    #[test]
    fn rejects_a_decision_for_a_killed_proposal() {
        assert!(validate_decision(HarnessStatus::Killed, ApplyState::Pending, "approved").is_err());
    }

    #[test]
    fn rejects_a_decision_after_application_started() {
        for state in [ApplyState::Applied, ApplyState::Failed] {
            assert!(validate_decision(HarnessStatus::Proposed, state, "approved").is_err());
        }
    }

    #[test]
    fn allows_decisions_to_move_back_and_forth() {
        let approved =
            validate_decision(HarnessStatus::Proposed, ApplyState::Pending, "approved").unwrap();
        assert_eq!(
            validate_decision(approved, ApplyState::Pending, "proposed").unwrap(),
            HarnessStatus::Proposed
        );

        let rejected =
            validate_decision(HarnessStatus::Proposed, ApplyState::Pending, "rejected").unwrap();
        assert_eq!(
            validate_decision(rejected, ApplyState::Pending, "proposed").unwrap(),
            HarnessStatus::Proposed
        );
    }

    #[test]
    fn rejects_an_apply_result_unless_status_is_approved() {
        for status in [
            HarnessStatus::Proposed,
            HarnessStatus::Rejected,
            HarnessStatus::Killed,
        ] {
            assert!(
                validate_apply_result(
                    status,
                    ApplyResultInput {
                        state: Some("applied".to_owned()),
                        snapshot_path: None,
                        error: None,
                    }
                )
                .is_err()
            );
        }
    }

    #[test]
    fn failed_apply_result_requires_a_bounded_error() {
        for error in [None, Some(String::new()), Some("界".repeat(1001))] {
            assert!(
                validate_apply_result(
                    HarnessStatus::Approved,
                    ApplyResultInput {
                        state: Some("failed".to_owned()),
                        snapshot_path: None,
                        error,
                    }
                )
                .is_err()
            );
        }

        let result = validate_apply_result(
            HarnessStatus::Approved,
            ApplyResultInput {
                state: Some("failed".to_owned()),
                snapshot_path: None,
                error: Some("界".repeat(1000)),
            },
        )
        .unwrap();
        assert_eq!(result.state, ApplyState::Failed);
    }

    #[test]
    fn applied_result_drops_an_irrelevant_error() {
        let result = validate_apply_result(
            HarnessStatus::Approved,
            ApplyResultInput {
                state: Some("applied".to_owned()),
                snapshot_path: Some("archive/snapshot".to_owned()),
                error: Some("old failure".to_owned()),
            },
        )
        .unwrap();
        assert_eq!(result.state, ApplyState::Applied);
        assert_eq!(result.snapshot_path.as_deref(), Some("archive/snapshot"));
        assert!(result.error.is_none());
    }
}
