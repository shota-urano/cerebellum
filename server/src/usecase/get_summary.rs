use std::sync::Arc;

use chrono::Duration;

use crate::domain::day::SummaryDay;

use super::{
    error::UsecaseError,
    get_day::repository_error,
    ports::{Clock, TaskRepository},
};

const DEFAULT_DAYS: u32 = 7;
const MAX_DAYS: u32 = 366;

pub struct GetSummary {
    task_repository: Arc<dyn TaskRepository>,
    clock: Arc<dyn Clock>,
}

impl GetSummary {
    pub fn new(task_repository: Arc<dyn TaskRepository>, clock: Arc<dyn Clock>) -> Self {
        Self {
            task_repository,
            clock,
        }
    }

    pub fn dependencies(&self) -> (&Arc<dyn TaskRepository>, &Arc<dyn Clock>) {
        (&self.task_repository, &self.clock)
    }

    pub fn execute(&self, days: Option<u32>) -> Result<Vec<SummaryDay>, UsecaseError> {
        let days = days.unwrap_or(DEFAULT_DAYS);
        if !(1..=MAX_DAYS).contains(&days) {
            return Err(UsecaseError::BadRequest(format!(
                "days must be between 1 and {MAX_DAYS}"
            )));
        }

        let today = self.clock.now().date_naive();
        let start_date = today - Duration::days(i64::from(days - 1));
        let mut summary = self
            .task_repository
            .get_summary(
                &start_date.format("%Y-%m-%d").to_string(),
                &today.format("%Y-%m-%d").to_string(),
            )
            .map_err(repository_error)?;
        summary.sort_by(|left, right| left.date.cmp(&right.date));
        Ok(summary)
    }
}
