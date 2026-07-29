use std::collections::HashSet;

use serde::{Deserialize, Serialize};
use thiserror::Error;

pub const MAX_LEARNING_SET_BYTES: usize = 256 * 1024;

const DEFAULT_SOURCE: &str = "theme";
const DEFAULT_KIND: &str = "quiz";

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct LearningSet {
    pub theme: String,
    pub source: String,
    pub lesson_md: String,
    pub problems: Vec<LearningProblem>,
    pub closing_md: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct LearningProblem {
    pub no: u32,
    pub kind: String,
    pub question_md: String,
    pub answer_md: String,
    pub workdir: Option<String>,
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct LearningSetInput {
    pub theme: Option<String>,
    pub source: Option<String>,
    pub lesson_md: Option<String>,
    pub problems: Option<Vec<LearningProblemInput>>,
    pub closing_md: Option<String>,
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct LearningProblemInput {
    pub no: Option<u32>,
    pub kind: Option<String>,
    pub question_md: Option<String>,
    pub answer_md: Option<String>,
    pub workdir: Option<String>,
}

#[derive(Debug, Error, Eq, PartialEq)]
pub enum LearningValidationError {
    #[error("{0} is required")]
    Required(&'static str),
    #[error("problems must contain between 1 and 10 items")]
    InvalidProblemCount,
    #[error("problem no {0} is duplicated")]
    DuplicateProblemNo(u32),
    #[error("source must be one of: theme, memo")]
    InvalidSource,
    #[error("problem kind must be one of: quiz, code")]
    InvalidKind,
    #[error("learning set must not exceed {MAX_LEARNING_SET_BYTES} bytes")]
    TooLarge,
    #[error("learning set could not be serialized")]
    Serialization,
}

impl LearningSetInput {
    pub fn validate(self) -> Result<LearningSet, LearningValidationError> {
        let theme = required(self.theme, "theme")?;
        let lesson_md = required(self.lesson_md, "lessonMd")?;
        let problems = self
            .problems
            .ok_or(LearningValidationError::Required("problems"))?;
        if !(1..=10).contains(&problems.len()) {
            return Err(LearningValidationError::InvalidProblemCount);
        }

        let source = self.source.unwrap_or_else(|| DEFAULT_SOURCE.to_owned());
        if !matches!(source.as_str(), "theme" | "memo") {
            return Err(LearningValidationError::InvalidSource);
        }

        let mut problem_numbers = HashSet::with_capacity(problems.len());
        let problems = problems
            .into_iter()
            .map(|problem| {
                let no = problem
                    .no
                    .ok_or(LearningValidationError::Required("problems[].no"))?;
                if !problem_numbers.insert(no) {
                    return Err(LearningValidationError::DuplicateProblemNo(no));
                }

                let kind = problem.kind.unwrap_or_else(|| DEFAULT_KIND.to_owned());
                if !matches!(kind.as_str(), "quiz" | "code") {
                    return Err(LearningValidationError::InvalidKind);
                }

                Ok(LearningProblem {
                    no,
                    kind,
                    question_md: required(problem.question_md, "problems[].questionMd")?,
                    answer_md: required(problem.answer_md, "problems[].answerMd")?,
                    workdir: problem.workdir,
                })
            })
            .collect::<Result<Vec<_>, _>>()?;

        let learning_set = LearningSet {
            theme,
            source,
            lesson_md,
            problems,
            closing_md: self.closing_md,
        };
        let size = serde_json::to_vec(&learning_set)
            .map_err(|_| LearningValidationError::Serialization)?
            .len();
        if size > MAX_LEARNING_SET_BYTES {
            return Err(LearningValidationError::TooLarge);
        }

        Ok(learning_set)
    }
}

fn required(value: Option<String>, field: &'static str) -> Result<String, LearningValidationError> {
    value
        .filter(|value| !value.trim().is_empty())
        .ok_or(LearningValidationError::Required(field))
}

#[cfg(test)]
mod tests {
    use super::{
        LearningProblemInput, LearningSetInput, LearningValidationError, MAX_LEARNING_SET_BYTES,
    };

    fn valid_input() -> LearningSetInput {
        LearningSetInput {
            theme: Some("SQLite".to_owned()),
            source: None,
            lesson_md: Some("lesson".to_owned()),
            problems: Some(vec![LearningProblemInput {
                no: Some(1),
                kind: None,
                question_md: Some("question".to_owned()),
                answer_md: Some("answer".to_owned()),
                workdir: None,
            }]),
            closing_md: None,
        }
    }

    #[test]
    fn validates_required_fields_and_applies_defaults() {
        let learning_set = valid_input().validate().expect("valid set should pass");
        assert_eq!(learning_set.source, "theme");
        assert_eq!(learning_set.problems[0].kind, "quiz");

        for invalid in [
            LearningSetInput {
                theme: None,
                ..valid_input()
            },
            LearningSetInput {
                lesson_md: Some(" ".to_owned()),
                ..valid_input()
            },
            LearningSetInput {
                problems: None,
                ..valid_input()
            },
            LearningSetInput {
                problems: Some(vec![LearningProblemInput {
                    question_md: None,
                    ..valid_input().problems.expect("fixture has problems")[0].clone()
                }]),
                ..valid_input()
            },
        ] {
            assert!(matches!(
                invalid.validate(),
                Err(LearningValidationError::Required(_))
            ));
        }
    }

    #[test]
    fn rejects_empty_too_many_and_duplicate_problems() {
        let empty = LearningSetInput {
            problems: Some(Vec::new()),
            ..valid_input()
        };
        assert_eq!(
            empty.validate(),
            Err(LearningValidationError::InvalidProblemCount)
        );

        let problem = valid_input().problems.expect("fixture has problems")[0].clone();
        let too_many = LearningSetInput {
            problems: Some(vec![problem.clone(); 11]),
            ..valid_input()
        };
        assert_eq!(
            too_many.validate(),
            Err(LearningValidationError::InvalidProblemCount)
        );

        let duplicate = LearningSetInput {
            problems: Some(vec![problem.clone(), problem]),
            ..valid_input()
        };
        assert_eq!(
            duplicate.validate(),
            Err(LearningValidationError::DuplicateProblemNo(1))
        );
    }

    #[test]
    fn rejects_unknown_source_and_problem_kind() {
        let invalid_source = LearningSetInput {
            source: Some("other".to_owned()),
            ..valid_input()
        };
        assert_eq!(
            invalid_source.validate(),
            Err(LearningValidationError::InvalidSource)
        );

        let invalid_kind = LearningSetInput {
            problems: Some(vec![LearningProblemInput {
                kind: Some("essay".to_owned()),
                ..valid_input().problems.expect("fixture has problems")[0].clone()
            }]),
            ..valid_input()
        };
        assert_eq!(
            invalid_kind.validate(),
            Err(LearningValidationError::InvalidKind)
        );
    }

    #[test]
    fn rejects_serialized_sets_over_256_kib() {
        let oversized = LearningSetInput {
            lesson_md: Some("x".repeat(MAX_LEARNING_SET_BYTES)),
            ..valid_input()
        };
        assert_eq!(oversized.validate(), Err(LearningValidationError::TooLarge));
    }
}
