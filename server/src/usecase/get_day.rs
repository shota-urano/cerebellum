use std::sync::Arc;

use chrono::{Datelike, NaiveDate, Weekday};

use crate::domain::{
    day::{DaySnapshot, Progress},
    routine::routine_rows_for_day,
    task::{CheckedTask, Task, task_id},
};

use super::{
    error::UsecaseError,
    ports::{Clock, RepositoryError, TaskRepository, VaultReader},
};

pub type GetDayDependencies<'a> = (
    &'a Arc<dyn VaultReader>,
    &'a Arc<dyn TaskRepository>,
    &'a Arc<dyn Clock>,
);

pub struct GetDay {
    vault_reader: Arc<dyn VaultReader>,
    task_repository: Arc<dyn TaskRepository>,
    clock: Arc<dyn Clock>,
}

impl GetDay {
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

    pub fn dependencies(&self) -> GetDayDependencies<'_> {
        (&self.vault_reader, &self.task_repository, &self.clock)
    }

    pub fn execute(&self, date: &str) -> Result<DaySnapshot, UsecaseError> {
        let today = self.clock.now().date_naive();
        let date = resolve_date(date, today)?;

        if date == today {
            ensure_snapshot(
                self.vault_reader.as_ref(),
                self.task_repository.as_ref(),
                date,
            )?;
        }

        load_snapshot(self.task_repository.as_ref(), date, today)
    }
}

pub(crate) fn resolve_date(date: &str, today: NaiveDate) -> Result<NaiveDate, UsecaseError> {
    if date == "today" {
        return Ok(today);
    }

    let bytes = date.as_bytes();
    let has_date_shape = bytes.len() == 10
        && bytes[4] == b'-'
        && bytes[7] == b'-'
        && bytes
            .iter()
            .enumerate()
            .all(|(index, byte)| matches!(index, 4 | 7) || byte.is_ascii_digit());
    if !has_date_shape {
        return Err(UsecaseError::BadRequest(format!("invalid date: {date}")));
    }

    NaiveDate::parse_from_str(date, "%Y-%m-%d")
        .map_err(|_| UsecaseError::BadRequest(format!("invalid date: {date}")))
}

pub(crate) fn ensure_snapshot(
    vault_reader: &dyn VaultReader,
    task_repository: &dyn TaskRepository,
    date: NaiveDate,
) -> Result<(), UsecaseError> {
    let date_string = date.format("%Y-%m-%d").to_string();
    if task_repository
        .snapshot_exists(&date_string)
        .map_err(repository_error)?
    {
        return Ok(());
    }

    let markdown = vault_reader
        .read_routine_markdown()
        .map_err(UsecaseError::VaultUnavailable)?;
    let tasks = routine_rows_for_day(&markdown, date.weekday().num_days_from_monday())
        .into_iter()
        .enumerate()
        .map(|(sort_no, row)| Task {
            id: task_id(&row.interval, &row.time, &row.content),
            interval: row.interval,
            time: row.time,
            effort: row.effort,
            tool: row.tool,
            content: row.content,
            sort_no,
        })
        .collect::<Vec<_>>();

    task_repository
        .insert_snapshot(&date_string, &tasks)
        .map_err(repository_error)
}

pub(crate) fn load_snapshot(
    task_repository: &dyn TaskRepository,
    date: NaiveDate,
    today: NaiveDate,
) -> Result<DaySnapshot, UsecaseError> {
    let date_string = date.format("%Y-%m-%d").to_string();
    let tasks = task_repository
        .get_tasks(&date_string)
        .map_err(repository_error)?;
    Ok(day_snapshot(date_string, date, date != today, tasks))
}

fn day_snapshot(
    date_string: String,
    date: NaiveDate,
    readonly: bool,
    tasks: Vec<CheckedTask>,
) -> DaySnapshot {
    let done = tasks.iter().filter(|task| task.done).count();
    let total = tasks.len();

    DaySnapshot {
        date: date_string,
        weekday: weekday_label(date.weekday()),
        readonly,
        progress: Progress { done, total },
        tasks,
    }
}

fn weekday_label(weekday: Weekday) -> char {
    match weekday {
        Weekday::Mon => '月',
        Weekday::Tue => '火',
        Weekday::Wed => '水',
        Weekday::Thu => '木',
        Weekday::Fri => '金',
        Weekday::Sat => '土',
        Weekday::Sun => '日',
    }
}

pub(crate) fn repository_error(error: RepositoryError) -> UsecaseError {
    UsecaseError::Internal(Box::new(error))
}
