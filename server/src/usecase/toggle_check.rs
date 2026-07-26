use std::sync::Arc;

use crate::domain::day::DaySnapshot;

use super::{
    error::UsecaseError,
    get_day::{ensure_snapshot, load_snapshot, repository_error, resolve_date},
    ports::{Clock, TaskRepository, VaultReader},
};

pub type ToggleCheckDependencies<'a> = (
    &'a Arc<dyn VaultReader>,
    &'a Arc<dyn TaskRepository>,
    &'a Arc<dyn Clock>,
);

pub struct ToggleCheck {
    vault_reader: Arc<dyn VaultReader>,
    task_repository: Arc<dyn TaskRepository>,
    clock: Arc<dyn Clock>,
}

impl ToggleCheck {
    pub fn new(
        vault_reader: Arc<dyn VaultReader>,
        task_repository: Arc<dyn TaskRepository>,
        clock: Arc<dyn Clock>,
    ) -> Self {
        Self {
            vault_reader,
            task_repository,
            clock,
        }
    }

    pub fn dependencies(&self) -> ToggleCheckDependencies<'_> {
        (&self.vault_reader, &self.task_repository, &self.clock)
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
            self.vault_reader.as_ref(),
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
