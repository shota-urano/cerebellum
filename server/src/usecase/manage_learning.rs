use std::sync::Arc;

use crate::domain::learning::{LearningSet, LearningSetInput};

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
}
