use std::collections::HashSet;

use chrono::NaiveDate;
use sha1_smol::Sha1;

use super::error::DomainError;

pub const MAX_INTAKE_BODY_BYTES: usize = 256 * 1024;
const MAX_ITEMS: usize = 60;
const MAX_TEXT_BYTES: usize = 2 * 1024;
const MAX_NOTE_CHARS: usize = 200;
const MAX_APPLY_ERROR_CHARS: usize = 1000;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum IntakeLane {
    Todo,
    Thought,
    Tone,
}
impl IntakeLane {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Todo => "todo",
            Self::Thought => "thought",
            Self::Tone => "tone",
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum IntakeStatus {
    Proposed,
    Approved,
    Rejected,
}
impl IntakeStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Proposed => "proposed",
            Self::Approved => "approved",
            Self::Rejected => "rejected",
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum IntakeApplyState {
    Pending,
    Applied,
    Failed,
}
impl IntakeApplyState {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Pending => "pending",
            Self::Applied => "applied",
            Self::Failed => "failed",
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct IntakeBatchInput {
    pub date: Option<String>,
    pub source_path: Option<String>,
    pub source_note: Option<String>,
    pub items: Option<Vec<IntakeItemInput>>,
}
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct IntakeItemInput {
    pub lane: Option<String>,
    pub text: Option<String>,
    pub note: Option<String>,
    pub line_no: Option<i64>,
}
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct IntakeBatch {
    pub date: String,
    pub source_path: String,
    pub source_note: Option<String>,
    pub items: Vec<IntakeItem>,
}
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct IntakeItem {
    pub slug: String,
    pub lane: IntakeLane,
    pub text: String,
    pub note: Option<String>,
    pub line_no: Option<i64>,
}
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct IntakeApplyResultInput {
    pub state: Option<String>,
    pub result_path: Option<String>,
    pub result_url: Option<String>,
    pub error: Option<String>,
}
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct IntakeApplyResult {
    pub state: IntakeApplyState,
    pub result_path: Option<String>,
    pub result_url: Option<String>,
    pub error: Option<String>,
}

pub fn compute_slug(date: &str, lane: IntakeLane, text: &str) -> String {
    Sha1::from(format!("{date}|{}|{text}", lane.as_str()))
        .digest()
        .to_string()[..12]
        .to_owned()
}

pub fn validate_batch(
    input: IntakeBatchInput,
    body_size: usize,
) -> Result<IntakeBatch, DomainError> {
    if body_size > MAX_INTAKE_BODY_BYTES {
        return candidate_error(format!(
            "body must not exceed {MAX_INTAKE_BODY_BYTES} bytes"
        ));
    }
    let date = required(input.date, "date")?;
    if date != "today" && NaiveDate::parse_from_str(&date, "%Y-%m-%d").is_err() {
        return candidate_error("date must be today or a valid YYYY-MM-DD");
    }
    let source_path = required(input.source_path, "sourcePath")?;
    let items = input
        .items
        .ok_or_else(|| DomainError::InvalidIntakeCandidate("items is required".to_owned()))?;
    if items.len() > MAX_ITEMS {
        return candidate_error(format!("items must contain at most {MAX_ITEMS} items"));
    }
    let mut slugs = HashSet::with_capacity(items.len());
    let mut validated = Vec::with_capacity(items.len());
    for item in items {
        let lane = match item.lane.as_deref() {
            Some("todo") => IntakeLane::Todo,
            Some("thought") => IntakeLane::Thought,
            Some("tone") => IntakeLane::Tone,
            Some(_) => return candidate_error("lane must be todo, thought, or tone"),
            None => return candidate_error("lane is required"),
        };
        let text = required(item.text, "text")?;
        if text.len() > MAX_TEXT_BYTES {
            return candidate_error(format!("text must not exceed {MAX_TEXT_BYTES} bytes"));
        }
        if item
            .note
            .as_ref()
            .is_some_and(|v| v.chars().count() > MAX_NOTE_CHARS)
        {
            return candidate_error(format!("note must not exceed {MAX_NOTE_CHARS} characters"));
        }
        let slug = compute_slug(&date, lane, &text);
        if !slugs.insert(slug.clone()) {
            return candidate_error(format!("duplicate slug: {slug}"));
        }
        validated.push(IntakeItem {
            slug,
            lane,
            text,
            note: item.note,
            line_no: item.line_no,
        });
    }
    Ok(IntakeBatch {
        date,
        source_path,
        source_note: input.source_note,
        items: validated,
    })
}

pub fn validate_decision(
    apply_state: IntakeApplyState,
    requested: &str,
) -> Result<IntakeStatus, DomainError> {
    if apply_state != IntakeApplyState::Pending {
        return transition_error("a decision requires apply_state pending");
    }
    match requested {
        "proposed" => Ok(IntakeStatus::Proposed),
        "approved" => Ok(IntakeStatus::Approved),
        "rejected" => Ok(IntakeStatus::Rejected),
        _ => transition_error("decision status must be proposed, approved, or rejected"),
    }
}

pub fn validate_apply_result(
    status: IntakeStatus,
    input: IntakeApplyResultInput,
) -> Result<IntakeApplyResult, DomainError> {
    if status != IntakeStatus::Approved {
        return transition_error("apply result requires status approved");
    }
    let state = match input.state.as_deref() {
        Some("applied") => IntakeApplyState::Applied,
        Some("failed") => IntakeApplyState::Failed,
        Some(_) => return transition_error("apply result state must be applied or failed"),
        None => return transition_error("apply result state is required"),
    };
    let error = if state == IntakeApplyState::Failed {
        let value = input
            .error
            .filter(|v| !v.trim().is_empty())
            .ok_or_else(|| DomainError::InvalidIntakeTransition("error is required".to_owned()))?;
        if value.chars().count() > MAX_APPLY_ERROR_CHARS {
            return transition_error(format!(
                "error must not exceed {MAX_APPLY_ERROR_CHARS} characters"
            ));
        }
        Some(value)
    } else {
        None
    };
    Ok(IntakeApplyResult {
        state,
        result_path: input.result_path,
        result_url: input.result_url,
        error,
    })
}

fn required(value: Option<String>, field: &str) -> Result<String, DomainError> {
    value
        .filter(|v| !v.trim().is_empty())
        .ok_or_else(|| DomainError::InvalidIntakeCandidate(format!("{field} is required")))
}
fn candidate_error<T>(message: impl Into<String>) -> Result<T, DomainError> {
    Err(DomainError::InvalidIntakeCandidate(message.into()))
}
fn transition_error<T>(message: impl Into<String>) -> Result<T, DomainError> {
    Err(DomainError::InvalidIntakeTransition(message.into()))
}

#[cfg(test)]
mod tests {
    use super::*;
    fn input(items: Vec<IntakeItemInput>) -> IntakeBatchInput {
        IntakeBatchInput {
            date: Some("2026-08-28".into()),
            source_path: Some("90_Meta/daily_intake/2026-08-28.md".into()),
            source_note: None,
            items: Some(items),
        }
    }
    fn item(lane: &str, text: &str) -> IntakeItemInput {
        IntakeItemInput {
            lane: Some(lane.into()),
            text: Some(text.into()),
            note: None,
            line_no: None,
        }
    }
    #[test]
    fn slug_matches_contract() {
        assert_eq!(
            compute_slug("2026-08-28", IntakeLane::Thought, "hello"),
            "336a1d891128"
        );
    }
    #[test]
    fn empty_is_valid_and_missing_or_invalid_values_fail() {
        assert!(validate_batch(input(vec![]), 10).is_ok());
        assert!(
            validate_batch(
                IntakeBatchInput {
                    date: None,
                    ..input(vec![])
                },
                10
            )
            .is_err()
        );
        assert!(
            validate_batch(
                IntakeBatchInput {
                    source_path: None,
                    ..input(vec![])
                },
                10
            )
            .is_err()
        );
        assert!(
            validate_batch(
                IntakeBatchInput {
                    items: None,
                    ..input(vec![])
                },
                10
            )
            .is_err()
        );
        assert!(
            validate_batch(
                input(vec![IntakeItemInput {
                    lane: None,
                    ..item("todo", "x")
                }]),
                10
            )
            .is_err()
        );
        assert!(
            validate_batch(
                input(vec![IntakeItemInput {
                    text: None,
                    ..item("todo", "x")
                }]),
                10
            )
            .is_err()
        );
        assert!(validate_batch(input(vec![item("bad", "x")]), 10).is_err());
        assert!(
            validate_batch(
                input((0..61).map(|i| item("todo", &i.to_string())).collect()),
                10
            )
            .is_err()
        );
        assert!(
            validate_batch(input(vec![item("todo", "same"), item("todo", "same")]), 10).is_err()
        );
        assert!(validate_batch(input(vec![item("todo", &"x".repeat(2049))]), 10).is_err());
        assert!(
            validate_batch(
                input(vec![IntakeItemInput {
                    note: Some("x".repeat(201)),
                    ..item("thought", "x")
                }]),
                10
            )
            .is_err()
        );
        assert!(validate_batch(input(vec![]), MAX_INTAKE_BODY_BYTES + 1).is_err());
    }
    #[test]
    fn transitions_enforce_guards_and_allow_decision_round_trips() {
        for status in ["proposed", "approved", "rejected"] {
            assert!(validate_decision(IntakeApplyState::Pending, status).is_ok());
        }
        assert!(validate_decision(IntakeApplyState::Applied, "approved").is_err());
        assert!(
            validate_apply_result(
                IntakeStatus::Proposed,
                IntakeApplyResultInput {
                    state: Some("applied".into()),
                    result_path: None,
                    result_url: None,
                    error: None
                }
            )
            .is_err()
        );
        assert!(
            validate_apply_result(
                IntakeStatus::Approved,
                IntakeApplyResultInput {
                    state: Some("failed".into()),
                    result_path: None,
                    result_url: None,
                    error: None
                }
            )
            .is_err()
        );
    }
}
