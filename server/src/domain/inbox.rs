use std::{collections::HashSet, str::FromStr};

use chrono::NaiveDate;
use serde_json::Value;

use super::error::DomainError;

pub const MAX_INBOX_BODY_BYTES: usize = 1024 * 1024;
pub const MAX_BODY_MD_BYTES: usize = 128 * 1024;
pub const MAX_PAYLOAD_BYTES: usize = 16 * 1024;

const MAX_ITEMS: usize = 100;
const MIN_OPTIONS: usize = 2;
const MAX_OPTIONS: usize = 10;
const MAX_TITLE_CHARS: usize = 200;
const MAX_APPLY_ERROR_CHARS: usize = 1000;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum InboxKind {
    Approve,
    Choose,
    Read,
    Alert,
}

impl InboxKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Approve => "approve",
            Self::Choose => "choose",
            Self::Read => "read",
            Self::Alert => "alert",
        }
    }
}

impl FromStr for InboxKind {
    type Err = DomainError;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value {
            "approve" => Ok(Self::Approve),
            "choose" => Ok(Self::Choose),
            "read" => Ok(Self::Read),
            "alert" => Ok(Self::Alert),
            _ => inbox_error("kind must be approve, choose, read, or alert"),
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum InboxStatus {
    Open,
    Approved,
    Rejected,
    Chosen,
    Read,
    Acknowledged,
}

impl InboxStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Open => "open",
            Self::Approved => "approved",
            Self::Rejected => "rejected",
            Self::Chosen => "chosen",
            Self::Read => "read",
            Self::Acknowledged => "acknowledged",
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum InboxApplyState {
    None,
    Pending,
    Applied,
    Failed,
}

impl InboxApplyState {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::None => "none",
            Self::Pending => "pending",
            Self::Applied => "applied",
            Self::Failed => "failed",
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct InboxBatchInput {
    pub source: Option<String>,
    pub date: Option<String>,
    pub items: Option<Vec<InboxItemInput>>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct InboxItemInput {
    pub slug: Option<String>,
    pub kind: Option<String>,
    pub title: Option<String>,
    pub body_md: Option<String>,
    pub options: Option<Vec<InboxOptionInput>>,
    pub ref_path: Option<String>,
    pub payload: Option<Value>,
    pub expires_at: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct InboxOptionInput {
    pub id: Option<String>,
    pub label: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct InboxBatch {
    pub source: String,
    pub date: String,
    pub items: Vec<InboxItem>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct InboxItem {
    pub slug: String,
    pub kind: InboxKind,
    pub title: String,
    pub body_md: Option<String>,
    pub options: Option<Vec<InboxOption>>,
    pub ref_path: Option<String>,
    pub payload: Option<Value>,
    pub expires_at: Option<String>,
    pub status: InboxStatus,
    pub apply_state: InboxApplyState,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct InboxOption {
    pub id: String,
    pub label: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct InboxDecisionInput {
    pub status: Option<String>,
    pub choice: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct InboxDecision {
    pub status: InboxStatus,
    pub choice: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct InboxApplyResultInput {
    pub state: Option<String>,
    pub result_path: Option<String>,
    pub result_url: Option<String>,
    pub error: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct InboxApplyResult {
    pub state: InboxApplyState,
    pub result_path: Option<String>,
    pub result_url: Option<String>,
    pub error: Option<String>,
}

pub fn validate_batch(input: InboxBatchInput, body_size: usize) -> Result<InboxBatch, DomainError> {
    if body_size > MAX_INBOX_BODY_BYTES {
        return inbox_error(format!("body must not exceed {MAX_INBOX_BODY_BYTES} bytes"));
    }

    let source = required(input.source, "source")?;
    let date = required(input.date, "date")?;
    if date != "today" && NaiveDate::parse_from_str(&date, "%Y-%m-%d").is_err() {
        return inbox_error("date must be today or a valid YYYY-MM-DD");
    }
    let items = input
        .items
        .ok_or_else(|| DomainError::InvalidInboxItem("items is required".to_owned()))?;
    if items.len() > MAX_ITEMS {
        return inbox_error(format!("items must contain at most {MAX_ITEMS} items"));
    }

    let mut slugs = HashSet::with_capacity(items.len());
    let mut validated = Vec::with_capacity(items.len());
    for item in items {
        let item = validate_item(item)?;
        if !slugs.insert(item.slug.clone()) {
            return inbox_error(format!("duplicate slug: {}", item.slug));
        }
        validated.push(item);
    }

    Ok(InboxBatch {
        source,
        date,
        items: validated,
    })
}

pub fn validate_decision(
    kind: InboxKind,
    apply_state: InboxApplyState,
    options: Option<&[InboxOption]>,
    input: InboxDecisionInput,
) -> Result<InboxDecision, DomainError> {
    if apply_state != InboxApplyState::Pending {
        return transition_error("a decision requires apply_state pending");
    }

    let requested = required_transition(input.status, "status")?;
    let status = match (kind, requested.as_str()) {
        (InboxKind::Approve, "approved") => InboxStatus::Approved,
        (InboxKind::Approve, "rejected") => InboxStatus::Rejected,
        (InboxKind::Approve, "open") => InboxStatus::Open,
        (InboxKind::Choose, "chosen") => InboxStatus::Chosen,
        (InboxKind::Choose, "rejected") => InboxStatus::Rejected,
        (InboxKind::Choose, "open") => InboxStatus::Open,
        (InboxKind::Read, "read") => InboxStatus::Read,
        (InboxKind::Read, "open") => InboxStatus::Open,
        (InboxKind::Alert, "acknowledged") => InboxStatus::Acknowledged,
        (InboxKind::Alert, "open") => InboxStatus::Open,
        _ => return transition_error("status is not allowed for this kind"),
    };

    let choice = if status == InboxStatus::Chosen {
        let choice = required_transition(input.choice, "choice")?;
        if !options
            .unwrap_or_default()
            .iter()
            .any(|option| option.id == choice)
        {
            return transition_error("choice must match an option id");
        }
        Some(choice)
    } else {
        None
    };

    Ok(InboxDecision { status, choice })
}

pub fn validate_apply_result(
    status: InboxStatus,
    apply_state: InboxApplyState,
    input: InboxApplyResultInput,
) -> Result<InboxApplyResult, DomainError> {
    if !matches!(status, InboxStatus::Approved | InboxStatus::Chosen) {
        return transition_error("apply result requires status approved or chosen");
    }
    if apply_state == InboxApplyState::None {
        return transition_error("apply result requires an applicable item");
    }

    let state = match required_transition(input.state, "state")?.as_str() {
        "applied" => InboxApplyState::Applied,
        "failed" => InboxApplyState::Failed,
        _ => return transition_error("apply result state must be applied or failed"),
    };
    let error = if state == InboxApplyState::Failed {
        let error = required_transition(input.error, "error")?;
        if error.chars().count() > MAX_APPLY_ERROR_CHARS {
            return transition_error(format!(
                "error must not exceed {MAX_APPLY_ERROR_CHARS} characters"
            ));
        }
        Some(error)
    } else {
        None
    };

    Ok(InboxApplyResult {
        state,
        result_path: input.result_path,
        result_url: input.result_url,
        error,
    })
}

fn validate_item(input: InboxItemInput) -> Result<InboxItem, DomainError> {
    let slug = required(input.slug, "slug")?;
    let kind = required(input.kind, "kind")?.parse()?;
    let title = required(input.title, "title")?;
    if title.chars().count() > MAX_TITLE_CHARS {
        return inbox_error(format!(
            "title must not exceed {MAX_TITLE_CHARS} characters"
        ));
    }
    if input
        .body_md
        .as_ref()
        .is_some_and(|body_md| body_md.len() > MAX_BODY_MD_BYTES)
    {
        return inbox_error(format!("bodyMd must not exceed {MAX_BODY_MD_BYTES} bytes"));
    }
    if input.payload.as_ref().is_some_and(|payload| {
        serde_json::to_vec(payload).is_ok_and(|serialized| serialized.len() > MAX_PAYLOAD_BYTES)
    }) {
        return inbox_error(format!("payload must not exceed {MAX_PAYLOAD_BYTES} bytes"));
    }

    let options = match (kind, input.options) {
        (InboxKind::Choose, Some(options))
            if (MIN_OPTIONS..=MAX_OPTIONS).contains(&options.len()) =>
        {
            Some(
                options
                    .into_iter()
                    .map(|option| {
                        Ok(InboxOption {
                            id: required(option.id, "options[].id")?,
                            label: required(option.label, "options[].label")?,
                        })
                    })
                    .collect::<Result<Vec<_>, DomainError>>()?,
            )
        }
        (InboxKind::Choose, _) => {
            return inbox_error(format!(
                "options must contain between {MIN_OPTIONS} and {MAX_OPTIONS} items for choose"
            ));
        }
        (_, Some(_)) => return inbox_error("options are only allowed for choose"),
        (_, None) => None,
    };
    let (status, apply_state) = initial_state(kind);

    Ok(InboxItem {
        slug,
        kind,
        title,
        body_md: input.body_md,
        options,
        ref_path: input.ref_path,
        payload: input.payload,
        expires_at: input.expires_at,
        status,
        apply_state,
    })
}

pub fn initial_state(kind: InboxKind) -> (InboxStatus, InboxApplyState) {
    let apply_state = match kind {
        InboxKind::Approve | InboxKind::Choose => InboxApplyState::Pending,
        InboxKind::Read | InboxKind::Alert => InboxApplyState::None,
    };
    (InboxStatus::Open, apply_state)
}

fn required(value: Option<String>, field: &str) -> Result<String, DomainError> {
    value
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| DomainError::InvalidInboxItem(format!("{field} is required")))
}

fn required_transition(value: Option<String>, field: &str) -> Result<String, DomainError> {
    value
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| DomainError::InvalidInboxTransition(format!("{field} is required")))
}

fn inbox_error<T>(message: impl Into<String>) -> Result<T, DomainError> {
    Err(DomainError::InvalidInboxItem(message.into()))
}

fn transition_error<T>(message: impl Into<String>) -> Result<T, DomainError> {
    Err(DomainError::InvalidInboxTransition(message.into()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn option(id: &str) -> InboxOptionInput {
        InboxOptionInput {
            id: Some(id.to_owned()),
            label: Some(format!("label {id}")),
        }
    }

    fn item(kind: &str) -> InboxItemInput {
        InboxItemInput {
            slug: Some(format!("{kind}-item")),
            kind: Some(kind.to_owned()),
            title: Some("Title".to_owned()),
            body_md: None,
            options: (kind == "choose").then(|| vec![option("one"), option("two")]),
            ref_path: None,
            payload: None,
            expires_at: None,
        }
    }

    fn batch(items: Vec<InboxItemInput>) -> InboxBatchInput {
        InboxBatchInput {
            source: Some("night-harness".to_owned()),
            date: Some("2026-09-02".to_owned()),
            items: Some(items),
        }
    }

    fn valid_options() -> Vec<InboxOption> {
        vec![
            InboxOption {
                id: "one".to_owned(),
                label: "One".to_owned(),
            },
            InboxOption {
                id: "two".to_owned(),
                label: "Two".to_owned(),
            },
        ]
    }

    #[test]
    fn kind_round_trips_between_string_and_type() {
        for (value, kind) in [
            ("approve", InboxKind::Approve),
            ("choose", InboxKind::Choose),
            ("read", InboxKind::Read),
            ("alert", InboxKind::Alert),
        ] {
            assert_eq!(value.parse::<InboxKind>(), Ok(kind));
            assert_eq!(kind.as_str(), value);
        }
    }

    #[test]
    fn batch_accepts_empty_items_and_rejects_required_or_invalid_values() {
        assert!(validate_batch(batch(vec![]), 0).is_ok());
        for invalid in [
            InboxBatchInput {
                source: None,
                ..batch(vec![])
            },
            InboxBatchInput {
                date: None,
                ..batch(vec![])
            },
            InboxBatchInput {
                date: Some("2026-02-30".to_owned()),
                ..batch(vec![])
            },
            InboxBatchInput {
                items: None,
                ..batch(vec![])
            },
            batch(vec![InboxItemInput {
                slug: None,
                ..item("approve")
            }]),
            batch(vec![InboxItemInput {
                kind: None,
                ..item("approve")
            }]),
            batch(vec![InboxItemInput {
                title: None,
                ..item("approve")
            }]),
            batch(vec![item("invalid")]),
        ] {
            assert!(validate_batch(invalid, 0).is_err());
        }
    }

    #[test]
    fn batch_rejects_count_duplicate_slug_and_size_limits() {
        let items = (0..101)
            .map(|number| InboxItemInput {
                slug: Some(number.to_string()),
                ..item("approve")
            })
            .collect();
        assert!(validate_batch(batch(items), 0).is_err());
        assert!(validate_batch(batch(vec![item("approve"), item("approve")]), 0).is_err());
        assert!(validate_batch(batch(vec![]), MAX_INBOX_BODY_BYTES + 1).is_err());
        assert!(
            validate_batch(
                batch(vec![InboxItemInput {
                    body_md: Some("x".repeat(MAX_BODY_MD_BYTES + 1)),
                    ..item("approve")
                }]),
                0,
            )
            .is_err()
        );
        assert!(
            validate_batch(
                batch(vec![InboxItemInput {
                    payload: Some(Value::String("x".repeat(MAX_PAYLOAD_BYTES))),
                    ..item("approve")
                }]),
                0,
            )
            .is_err()
        );
    }

    #[test]
    fn validates_options_title_and_initial_states() {
        assert!(
            validate_batch(
                batch(vec![InboxItemInput {
                    options: Some(vec![]),
                    ..item("approve")
                }]),
                0,
            )
            .is_err()
        );
        assert!(
            validate_batch(
                batch(vec![InboxItemInput {
                    options: Some(vec![option("one")]),
                    ..item("choose")
                }]),
                0,
            )
            .is_err()
        );
        assert!(
            validate_batch(
                batch(vec![InboxItemInput {
                    title: Some("x".repeat(MAX_TITLE_CHARS + 1)),
                    ..item("approve")
                }]),
                0,
            )
            .is_err()
        );
        for (kind, expected_apply_state) in [
            ("approve", InboxApplyState::Pending),
            ("choose", InboxApplyState::Pending),
            ("read", InboxApplyState::None),
            ("alert", InboxApplyState::None),
        ] {
            let item = validate_batch(batch(vec![item(kind)]), 0)
                .expect("valid item")
                .items
                .remove(0);
            assert_eq!(item.status, InboxStatus::Open);
            assert_eq!(item.apply_state, expected_apply_state);
        }
    }

    #[test]
    fn decisions_allow_only_each_kind_status_table_combination() {
        let expected = [
            (
                InboxKind::Approve,
                ["approved", "rejected", "open"].as_slice(),
            ),
            (InboxKind::Choose, ["chosen", "rejected", "open"].as_slice()),
            (InboxKind::Read, ["read", "open"].as_slice()),
            (InboxKind::Alert, ["acknowledged", "open"].as_slice()),
        ];
        let statuses = [
            "open",
            "approved",
            "rejected",
            "chosen",
            "read",
            "acknowledged",
        ];
        for (kind, allowed) in expected {
            for status in statuses {
                let choice = (status == "chosen").then(|| "one".to_owned());
                assert_eq!(
                    validate_decision(
                        kind,
                        InboxApplyState::Pending,
                        Some(&valid_options()),
                        InboxDecisionInput {
                            status: Some(status.to_owned()),
                            choice,
                        },
                    )
                    .is_ok(),
                    allowed.contains(&status),
                    "{kind:?} / {status}",
                );
            }
        }
    }

    #[test]
    fn decisions_require_a_pending_item_and_valid_choice() {
        assert!(
            validate_decision(
                InboxKind::Approve,
                InboxApplyState::Applied,
                None,
                InboxDecisionInput {
                    status: Some("open".to_owned()),
                    choice: None,
                },
            )
            .is_err()
        );
        assert!(
            validate_decision(
                InboxKind::Choose,
                InboxApplyState::Pending,
                Some(&valid_options()),
                InboxDecisionInput {
                    status: Some("chosen".to_owned()),
                    choice: Some("missing".to_owned()),
                },
            )
            .is_err()
        );
    }

    #[test]
    fn apply_results_validate_state_error_and_item_eligibility() {
        for state in ["applied", "failed"] {
            assert!(
                validate_apply_result(
                    InboxStatus::Approved,
                    InboxApplyState::Pending,
                    InboxApplyResultInput {
                        state: Some(state.to_owned()),
                        result_path: None,
                        result_url: None,
                        error: (state == "failed").then(|| "failure".to_owned()),
                    },
                )
                .is_ok()
            );
        }
        assert!(
            validate_apply_result(
                InboxStatus::Approved,
                InboxApplyState::Pending,
                InboxApplyResultInput {
                    state: Some("failed".to_owned()),
                    result_path: None,
                    result_url: None,
                    error: None,
                },
            )
            .is_err()
        );
        assert!(
            validate_apply_result(
                InboxStatus::Approved,
                InboxApplyState::Pending,
                InboxApplyResultInput {
                    state: Some("failed".to_owned()),
                    result_path: None,
                    result_url: None,
                    error: Some("x".repeat(MAX_APPLY_ERROR_CHARS + 1)),
                },
            )
            .is_err()
        );
        for status in [
            InboxStatus::Open,
            InboxStatus::Rejected,
            InboxStatus::Read,
            InboxStatus::Acknowledged,
        ] {
            assert!(
                validate_apply_result(
                    status,
                    InboxApplyState::Pending,
                    InboxApplyResultInput {
                        state: Some("applied".to_owned()),
                        result_path: None,
                        result_url: None,
                        error: None,
                    },
                )
                .is_err()
            );
        }
        assert!(
            validate_apply_result(
                InboxStatus::Approved,
                InboxApplyState::None,
                InboxApplyResultInput {
                    state: Some("applied".to_owned()),
                    result_path: None,
                    result_url: None,
                    error: None,
                },
            )
            .is_err()
        );
    }
}
