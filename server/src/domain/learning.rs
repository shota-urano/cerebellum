use std::collections::HashSet;

use serde::{Deserialize, Serialize};
use thiserror::Error;

pub const MAX_LEARNING_SET_BYTES: usize = 256 * 1024;
pub const MAX_LEARNING_FEELING_CHARS: usize = 2000;
pub const MAX_LEARNING_ANSWER_CHARS: usize = 500;

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
    pub answer_type: Option<String>,
    pub expected: Option<String>,
    pub choices: Option<Vec<String>>,
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
    pub answer_type: Option<String>,
    pub expected: Option<String>,
    pub choices: Option<Vec<String>>,
    pub workdir: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct LearningResult {
    pub grades: Vec<LearningGrade>,
    pub feeling: String,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct LearningGrade {
    pub no: u32,
    pub grade: LearningGradeValue,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub answer: Option<String>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LearningGradeValue {
    O,
    D,
    X,
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct LearningResultInput {
    pub grades: Option<Vec<LearningGradeInput>>,
    pub feeling: Option<String>,
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct LearningGradeInput {
    pub no: Option<u32>,
    pub grade: Option<String>,
    pub answer: Option<String>,
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
    #[error("answerType must be one of: choice, number, text")]
    InvalidAnswerType,
    #[error("choices must contain between 2 and 6 items for choice problems")]
    InvalidChoiceCount,
    #[error("choices must not contain duplicates")]
    DuplicateChoice,
    #[error("expected must exactly match one of choices")]
    ExpectedNotInChoices,
    #[error("choices must be omitted unless answerType is choice")]
    UnexpectedChoices,
    #[error("expected must be numeric when answerType is number")]
    InvalidNumberExpected,
    #[error("grades is required")]
    GradesRequired,
    #[error("grades[].no is required")]
    GradeNoRequired,
    #[error("grades[].grade is required")]
    GradeRequired,
    #[error("grade must be one of: o, d, x")]
    InvalidGrade,
    #[error("problem no {0} does not exist in the learning set")]
    UnknownProblemNo(u32),
    #[error("feeling is required")]
    FeelingRequired,
    #[error("feeling must not exceed {MAX_LEARNING_FEELING_CHARS} characters")]
    FeelingTooLong,
    #[error("grades[].answer must not exceed {MAX_LEARNING_ANSWER_CHARS} characters")]
    AnswerTooLong,
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

                match problem.answer_type.as_deref() {
                    Some("choice") => {
                        let expected =
                            required_ref(problem.expected.as_ref(), "problems[].expected")?;
                        let choices = problem
                            .choices
                            .as_ref()
                            .ok_or(LearningValidationError::InvalidChoiceCount)?;
                        if !(2..=6).contains(&choices.len()) {
                            return Err(LearningValidationError::InvalidChoiceCount);
                        }
                        if choices.iter().collect::<HashSet<_>>().len() != choices.len() {
                            return Err(LearningValidationError::DuplicateChoice);
                        }
                        if !choices.iter().any(|choice| choice == expected) {
                            return Err(LearningValidationError::ExpectedNotInChoices);
                        }
                    }
                    Some("number") => {
                        let expected =
                            required_ref(problem.expected.as_ref(), "problems[].expected")?;
                        if problem.choices.is_some() {
                            return Err(LearningValidationError::UnexpectedChoices);
                        }
                        if expected
                            .trim()
                            .parse::<f64>()
                            .map_or(true, |number| !number.is_finite())
                        {
                            return Err(LearningValidationError::InvalidNumberExpected);
                        }
                    }
                    Some("text") => {
                        required_ref(problem.expected.as_ref(), "problems[].expected")?;
                        if problem.choices.is_some() {
                            return Err(LearningValidationError::UnexpectedChoices);
                        }
                    }
                    Some(_) => return Err(LearningValidationError::InvalidAnswerType),
                    None => {
                        if problem.choices.is_some() {
                            return Err(LearningValidationError::UnexpectedChoices);
                        }
                    }
                }

                Ok(LearningProblem {
                    no,
                    kind,
                    question_md: required(problem.question_md, "problems[].questionMd")?,
                    answer_md: required(problem.answer_md, "problems[].answerMd")?,
                    answer_type: problem.answer_type,
                    expected: problem.expected,
                    choices: problem.choices,
                    workdir: problem.workdir,
                })
            })
            .collect::<Result<Vec<_>, _>>()?;

        Ok(LearningSet {
            theme,
            source,
            lesson_md,
            problems,
            closing_md: self.closing_md,
        })
    }
}

impl LearningResultInput {
    pub fn validate(
        self,
        problem_numbers: &HashSet<u32>,
    ) -> Result<LearningResult, LearningValidationError> {
        let grades = self
            .grades
            .ok_or(LearningValidationError::GradesRequired)?
            .into_iter()
            .map(|input| {
                let no = input.no.ok_or(LearningValidationError::GradeNoRequired)?;
                if !problem_numbers.contains(&no) {
                    return Err(LearningValidationError::UnknownProblemNo(no));
                }
                let grade = match input
                    .grade
                    .ok_or(LearningValidationError::GradeRequired)?
                    .as_str()
                {
                    "o" => LearningGradeValue::O,
                    "d" => LearningGradeValue::D,
                    "x" => LearningGradeValue::X,
                    _ => return Err(LearningValidationError::InvalidGrade),
                };
                if input
                    .answer
                    .as_ref()
                    .is_some_and(|answer| answer.chars().count() > MAX_LEARNING_ANSWER_CHARS)
                {
                    return Err(LearningValidationError::AnswerTooLong);
                }

                Ok(LearningGrade {
                    no,
                    grade,
                    answer: input.answer,
                })
            })
            .collect::<Result<Vec<_>, _>>()?;
        let feeling = self
            .feeling
            .ok_or(LearningValidationError::FeelingRequired)?;
        if feeling.chars().count() > MAX_LEARNING_FEELING_CHARS {
            return Err(LearningValidationError::FeelingTooLong);
        }

        Ok(LearningResult { grades, feeling })
    }
}

fn required(value: Option<String>, field: &'static str) -> Result<String, LearningValidationError> {
    value
        .filter(|value| !value.trim().is_empty())
        .ok_or(LearningValidationError::Required(field))
}

fn required_ref<'a>(
    value: Option<&'a String>,
    field: &'static str,
) -> Result<&'a str, LearningValidationError> {
    value
        .map(String::as_str)
        .filter(|value| !value.trim().is_empty())
        .ok_or(LearningValidationError::Required(field))
}

#[cfg(test)]
mod tests {
    use std::collections::HashSet;

    use super::{
        LearningGradeInput, LearningGradeValue, LearningProblemInput, LearningResultInput,
        LearningSetInput, LearningValidationError, MAX_LEARNING_ANSWER_CHARS,
        MAX_LEARNING_FEELING_CHARS,
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
                answer_type: None,
                expected: None,
                choices: None,
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
    fn validates_automatic_grading_fields() {
        let base_problem = valid_input().problems.expect("fixture has problems")[0].clone();
        let choice = LearningProblemInput {
            answer_type: Some("choice".to_owned()),
            expected: Some("B".to_owned()),
            choices: Some(vec!["A".to_owned(), "B".to_owned()]),
            ..base_problem.clone()
        };
        let learning_set = LearningSetInput {
            problems: Some(vec![choice]),
            ..valid_input()
        }
        .validate()
        .expect("valid choice problem should pass");
        assert_eq!(
            learning_set.problems[0].answer_type.as_deref(),
            Some("choice")
        );
        assert_eq!(learning_set.problems[0].expected.as_deref(), Some("B"));

        let invalid_cases = [
            (
                LearningProblemInput {
                    answer_type: Some("boolean".to_owned()),
                    ..base_problem.clone()
                },
                LearningValidationError::InvalidAnswerType,
            ),
            (
                LearningProblemInput {
                    answer_type: Some("choice".to_owned()),
                    choices: Some(vec!["A".to_owned(), "B".to_owned()]),
                    ..base_problem.clone()
                },
                LearningValidationError::Required("problems[].expected"),
            ),
            (
                LearningProblemInput {
                    answer_type: Some("choice".to_owned()),
                    expected: Some("A".to_owned()),
                    choices: Some(vec!["A".to_owned()]),
                    ..base_problem.clone()
                },
                LearningValidationError::InvalidChoiceCount,
            ),
            (
                LearningProblemInput {
                    answer_type: Some("choice".to_owned()),
                    expected: Some("A".to_owned()),
                    choices: Some(vec!["A".to_owned(), "A".to_owned()]),
                    ..base_problem.clone()
                },
                LearningValidationError::DuplicateChoice,
            ),
            (
                LearningProblemInput {
                    answer_type: Some("choice".to_owned()),
                    expected: Some("C".to_owned()),
                    choices: Some(vec!["A".to_owned(), "B".to_owned()]),
                    ..base_problem.clone()
                },
                LearningValidationError::ExpectedNotInChoices,
            ),
            (
                LearningProblemInput {
                    answer_type: Some("text".to_owned()),
                    expected: Some("A".to_owned()),
                    choices: Some(Vec::new()),
                    ..base_problem.clone()
                },
                LearningValidationError::UnexpectedChoices,
            ),
            (
                LearningProblemInput {
                    answer_type: Some("number".to_owned()),
                    expected: Some("twelve".to_owned()),
                    ..base_problem
                },
                LearningValidationError::InvalidNumberExpected,
            ),
        ];

        for (problem, expected_error) in invalid_cases {
            let error = LearningSetInput {
                problems: Some(vec![problem]),
                ..valid_input()
            }
            .validate()
            .expect_err("invalid automatic grading fields should fail");
            assert_eq!(error, expected_error);
        }
    }

    fn result_input(grades: Vec<(u32, &str)>, feeling: &str) -> LearningResultInput {
        LearningResultInput {
            grades: Some(
                grades
                    .into_iter()
                    .map(|(no, grade)| LearningGradeInput {
                        no: Some(no),
                        grade: Some(grade.to_owned()),
                        answer: None,
                    })
                    .collect(),
            ),
            feeling: Some(feeling.to_owned()),
        }
    }

    #[test]
    fn accepts_all_grade_values_partial_grading_and_empty_feeling() {
        let problem_numbers = HashSet::from([1, 2, 3, 4]);
        let result = result_input(vec![(1, "o"), (2, "d"), (3, "x")], "")
            .validate(&problem_numbers)
            .expect("valid grades should pass");

        assert_eq!(result.grades.len(), 3);
        assert_eq!(result.grades[0].grade, LearningGradeValue::O);
        assert_eq!(result.grades[1].grade, LearningGradeValue::D);
        assert_eq!(result.grades[2].grade, LearningGradeValue::X);
        assert_eq!(result.feeling, "");
    }

    #[test]
    fn rejects_unknown_grade_and_problem_number() {
        let problem_numbers = HashSet::from([1]);

        assert_eq!(
            result_input(vec![(1, "triangle")], "")
                .validate(&problem_numbers)
                .expect_err("unknown grade should fail"),
            LearningValidationError::InvalidGrade
        );
        assert_eq!(
            result_input(vec![(2, "o")], "")
                .validate(&problem_numbers)
                .expect_err("unknown problem number should fail"),
            LearningValidationError::UnknownProblemNo(2)
        );
    }

    #[test]
    fn validates_required_result_fields_and_feeling_character_limit() {
        let problem_numbers = HashSet::from([1]);

        assert_eq!(
            LearningResultInput {
                grades: None,
                feeling: Some(String::new()),
            }
            .validate(&problem_numbers),
            Err(LearningValidationError::GradesRequired)
        );
        assert_eq!(
            LearningResultInput {
                grades: Some(Vec::new()),
                feeling: None,
            }
            .validate(&problem_numbers),
            Err(LearningValidationError::FeelingRequired)
        );
        assert!(
            result_input(Vec::new(), &"界".repeat(MAX_LEARNING_FEELING_CHARS))
                .validate(&problem_numbers)
                .is_ok()
        );
        assert_eq!(
            result_input(Vec::new(), &"界".repeat(MAX_LEARNING_FEELING_CHARS + 1))
                .validate(&problem_numbers),
            Err(LearningValidationError::FeelingTooLong)
        );

        let mut at_limit = result_input(vec![(1, "o")], "");
        at_limit.grades.as_mut().expect("fixture has grades")[0].answer =
            Some("界".repeat(MAX_LEARNING_ANSWER_CHARS));
        assert!(at_limit.validate(&problem_numbers).is_ok());

        let mut over_limit = result_input(vec![(1, "o")], "");
        over_limit.grades.as_mut().expect("fixture has grades")[0].answer =
            Some("界".repeat(MAX_LEARNING_ANSWER_CHARS + 1));
        assert_eq!(
            over_limit.validate(&problem_numbers),
            Err(LearningValidationError::AnswerTooLong)
        );
    }
}
