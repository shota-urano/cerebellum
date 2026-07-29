use std::{collections::HashSet, sync::Arc};

use crate::domain::learning::{
    LearningGrade, LearningResult, LearningResultInput, LearningSet, LearningSetInput,
};

use super::{
    error::UsecaseError,
    get_day::{repository_error, resolve_date},
    ports::{Clock, LearningRepository},
};

pub struct ManageLearning {
    repository: Arc<dyn LearningRepository>,
    clock: Arc<dyn Clock>,
}

pub struct LearningStoredAt {
    pub date: String,
    pub received_at: String,
}

pub struct LearningSetView {
    pub date: String,
    pub received_at: String,
    pub learning_set: LearningSet,
}

pub struct LearningResultView {
    pub date: String,
    pub completed_at: String,
    pub result: LearningResult,
}

impl ManageLearning {
    pub fn new(repository: Arc<dyn LearningRepository>, clock: Arc<dyn Clock>) -> Self {
        Self { repository, clock }
    }

    pub fn save_learning_set(
        &self,
        date: &str,
        input: LearningSetInput,
    ) -> Result<LearningStoredAt, UsecaseError> {
        let today = self.clock.now().date_naive();
        let date = resolve_date(date, today)?.format("%Y-%m-%d").to_string();
        let learning_set = input
            .validate()
            .map_err(|error| UsecaseError::BadRequest(error.to_string()))?;
        let raw = serde_json::to_string(&learning_set)
            .map_err(|error| UsecaseError::Internal(Box::new(error)))?;
        let received_at = self.clock.now().to_rfc3339();

        self.repository
            .save_learning_set(&date, &raw, &received_at)
            .map_err(repository_error)?;

        Ok(LearningStoredAt { date, received_at })
    }

    pub fn get_learning_set(&self, date: &str) -> Result<LearningSetView, UsecaseError> {
        let today = self.clock.now().date_naive();
        let date = resolve_date(date, today)?.format("%Y-%m-%d").to_string();
        let stored = self
            .repository
            .get_learning_set(&date)
            .map_err(repository_error)?
            .ok_or_else(|| UsecaseError::NotFound(date.clone()))?;
        let learning_set = serde_json::from_str(&stored.raw)
            .map_err(|error| UsecaseError::Internal(Box::new(error)))?;

        Ok(LearningSetView {
            date,
            received_at: stored.received_at,
            learning_set,
        })
    }

    pub fn save_learning_result(
        &self,
        date: &str,
        input: LearningResultInput,
    ) -> Result<LearningResultView, UsecaseError> {
        let today = self.clock.now().date_naive();
        let date = resolve_date(date, today)?.format("%Y-%m-%d").to_string();
        let learning_set = self.load_learning_set(&date)?;
        let problem_numbers = learning_set
            .problems
            .iter()
            .map(|problem| problem.no)
            .collect::<HashSet<_>>();
        let result = input
            .validate(&problem_numbers)
            .map_err(|error| UsecaseError::BadRequest(error.to_string()))?;
        let grades = serde_json::to_string(&result.grades)
            .map_err(|error| UsecaseError::Internal(Box::new(error)))?;
        let completed_at = self.clock.now().to_rfc3339();

        self.repository
            .save_learning_result(&date, &grades, &result.feeling, &completed_at)
            .map_err(repository_error)?;

        Ok(LearningResultView {
            date,
            completed_at,
            result,
        })
    }

    pub fn get_learning_result(&self, date: &str) -> Result<LearningResultView, UsecaseError> {
        let today = self.clock.now().date_naive();
        let date = resolve_date(date, today)?.format("%Y-%m-%d").to_string();
        let stored = self
            .repository
            .get_learning_result(&date)
            .map_err(repository_error)?
            .ok_or_else(|| UsecaseError::NotFound(date.clone()))?;
        let grades = serde_json::from_str::<Vec<LearningGrade>>(&stored.grades)
            .map_err(|error| UsecaseError::Internal(Box::new(error)))?;

        Ok(LearningResultView {
            date,
            completed_at: stored.completed_at,
            result: LearningResult {
                grades,
                feeling: stored.feeling,
            },
        })
    }

    fn load_learning_set(&self, date: &str) -> Result<LearningSet, UsecaseError> {
        let stored = self
            .repository
            .get_learning_set(date)
            .map_err(repository_error)?
            .ok_or_else(|| UsecaseError::NotFound(date.to_owned()))?;
        serde_json::from_str(&stored.raw).map_err(|error| UsecaseError::Internal(Box::new(error)))
    }
}
