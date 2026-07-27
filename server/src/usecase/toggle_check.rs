use std::sync::Arc;

use crate::domain::day::DaySnapshot;

use super::{
    error::UsecaseError,
    get_day::{ensure_snapshot, load_snapshot, repository_error, resolve_date},
    ports::{Clock, RoutineRepository, TaskRepository},
};

pub type ToggleCheckDependencies<'a> = (
    &'a Arc<dyn RoutineRepository>,
    &'a Arc<dyn TaskRepository>,
    &'a Arc<dyn Clock>,
);

pub struct ToggleCheck {
    routine_repository: Arc<dyn RoutineRepository>,
    task_repository: Arc<dyn TaskRepository>,
    clock: Arc<dyn Clock>,
}

impl ToggleCheck {
    pub fn new(
        routine_repository: Arc<dyn RoutineRepository>,
        task_repository: Arc<dyn TaskRepository>,
        clock: Arc<dyn Clock>,
    ) -> Self {
        Self {
            routine_repository,
            task_repository,
            clock,
        }
    }

    pub fn dependencies(&self) -> ToggleCheckDependencies<'_> {
        (&self.routine_repository, &self.task_repository, &self.clock)
    }

    pub fn execute(&self, date: &str, task_id: &str) -> Result<DaySnapshot, UsecaseError> {
        let now = self.clock.now();
        let today = now.date_naive();
        let date = resolve_date(date, today)?;

        if date != today {
            return Err(UsecaseError::ReadonlyDay(
                date.format("%Y-%m-%d").to_string(),
            ));
        }

        ensure_snapshot(
            self.routine_repository.as_ref(),
            self.task_repository.as_ref(),
            date,
        )?;

        let date_string = date.format("%Y-%m-%d").to_string();
        let task_exists = self
            .task_repository
            .get_tasks(&date_string)
            .map_err(repository_error)?
            .iter()
            .any(|checked_task| checked_task.task.id == task_id);
        if !task_exists {
            return Err(UsecaseError::NotFound(task_id.to_owned()));
        }

        self.task_repository
            .toggle_check(&date_string, task_id, now)
            .map_err(repository_error)?;

        load_snapshot(self.task_repository.as_ref(), date, today)
    }
}
