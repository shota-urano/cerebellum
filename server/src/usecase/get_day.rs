use std::{collections::HashMap, sync::Arc};

use chrono::{Datelike, NaiveDate, Weekday};

use crate::domain::{
    day::{DaySnapshot, Progress},
    due::{due_today, sort_rows_by_time},
    routine::RoutineRow,
    task::{CheckedTask, Task, task_id},
};

use super::{
    error::UsecaseError,
    ports::{Clock, RepositoryError, RoutineRepository, RoutineRepositoryError, TaskRepository},
};

pub type GetDayDependencies<'a> = (
    &'a Arc<dyn RoutineRepository>,
    &'a Arc<dyn TaskRepository>,
    &'a Arc<dyn Clock>,
);

pub struct GetDay {
    routine_repository: Arc<dyn RoutineRepository>,
    task_repository: Arc<dyn TaskRepository>,
    clock: Arc<dyn Clock>,
}

impl GetDay {
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

    pub fn dependencies(&self) -> GetDayDependencies<'_> {
        (&self.routine_repository, &self.task_repository, &self.clock)
    }

    pub fn execute(&self, date: &str) -> Result<DaySnapshot, UsecaseError> {
        let today = self.clock.now().date_naive();
        let date = resolve_date(date, today)?;

        if date == today {
            ensure_snapshot(
                self.routine_repository.as_ref(),
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
    routine_repository: &dyn RoutineRepository,
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

    let weekday = date.weekday().num_days_from_monday();
    let due_routines = routine_repository
        .list_routines(false)
        .map_err(routine_repository_error)?
        .into_iter()
        .filter(|routine| due_today(&routine.interval, weekday))
        .collect::<Vec<_>>();

    // detail_ref は task_id と同じ材料（間隔・時刻・内容）で引き当てる。
    // routines_identity（docs/specs/02-data-model.md §2）が有効行の一意性を保証するので衝突しない。
    // こうすると RoutineRow を拡張せずに済み、ソート仕様（同 04 §3.3）に触れなくてよい
    let detail_refs: HashMap<String, String> = due_routines
        .iter()
        .filter_map(|routine| {
            routine.detail_ref.as_ref().map(|detail_ref| {
                (
                    task_id(&routine.interval, &routine.time, &routine.content),
                    detail_ref.clone(),
                )
            })
        })
        .collect();

    let mut rows = due_routines
        .into_iter()
        .map(|routine| RoutineRow {
            interval: routine.interval,
            time: routine.time,
            effort: routine.effort,
            tool: routine.tool,
            content: routine.content,
        })
        .collect::<Vec<_>>();
    sort_rows_by_time(&mut rows);

    let tasks = rows
        .into_iter()
        .enumerate()
        .map(|(sort_no, row)| {
            let id = task_id(&row.interval, &row.time, &row.content);
            let detail_ref = detail_refs.get(&id).cloned();
            Task {
                id,
                interval: row.interval,
                time: row.time,
                effort: row.effort,
                tool: row.tool,
                content: row.content,
                sort_no,
                detail_ref,
            }
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

fn routine_repository_error(error: RoutineRepositoryError) -> UsecaseError {
    UsecaseError::Internal(Box::new(error))
}
