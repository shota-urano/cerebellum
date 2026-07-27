use serde::{Deserialize, Serialize};

use crate::domain::{
    day::{DaySnapshot, Progress, SummaryDay},
    routine::{Routine, RoutineFields},
    task::CheckedTask,
};

#[derive(Debug, Serialize)]
pub(super) struct HealthDto {
    db: &'static str,
    routines: usize,
    version: &'static str,
}

impl HealthDto {
    pub(super) fn new(db_ok: bool, routines: usize, version: &'static str) -> Self {
        Self {
            db: status(db_ok),
            routines,
            version,
        }
    }
}

fn status(ok: bool) -> &'static str {
    if ok { "ok" } else { "ng" }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct DayDto {
    date: String,
    weekday: char,
    readonly: bool,
    progress: ProgressDto,
    tasks: Vec<TaskDto>,
}

impl From<DaySnapshot> for DayDto {
    fn from(snapshot: DaySnapshot) -> Self {
        Self {
            date: snapshot.date,
            weekday: snapshot.weekday,
            readonly: snapshot.readonly,
            progress: snapshot.progress.into(),
            tasks: snapshot.tasks.into_iter().map(TaskDto::from).collect(),
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProgressDto {
    done: usize,
    total: usize,
}

impl From<Progress> for ProgressDto {
    fn from(progress: Progress) -> Self {
        Self {
            done: progress.done,
            total: progress.total,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct TaskDto {
    id: String,
    time: String,
    effort: String,
    tool: String,
    content: String,
    done: bool,
    checked_at: Option<String>,
}

impl From<CheckedTask> for TaskDto {
    fn from(checked_task: CheckedTask) -> Self {
        let checked_at = if checked_task.done {
            checked_task.checked_at
        } else {
            None
        };

        Self {
            id: checked_task.task.id,
            time: checked_task.task.time,
            effort: checked_task.task.effort,
            tool: checked_task.task.tool,
            content: checked_task.task.content,
            done: checked_task.done,
            checked_at,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct SummaryDto {
    days: Vec<SummaryDayDto>,
}

impl From<Vec<SummaryDay>> for SummaryDto {
    fn from(days: Vec<SummaryDay>) -> Self {
        Self {
            days: days.into_iter().map(SummaryDayDto::from).collect(),
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct RoutineInputDto {
    interval: String,
    time: String,
    effort: String,
    tool: String,
    content: String,
}

impl From<RoutineInputDto> for RoutineFields {
    fn from(input: RoutineInputDto) -> Self {
        Self {
            interval: input.interval,
            time: input.time,
            effort: input.effort,
            tool: input.tool,
            content: input.content,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct RoutinesDto {
    routines: Vec<RoutineDto>,
}

impl From<Vec<Routine>> for RoutinesDto {
    fn from(routines: Vec<Routine>) -> Self {
        Self {
            routines: routines.into_iter().map(RoutineDto::from).collect(),
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct RoutineResponseDto {
    routine: RoutineDto,
}

impl From<Routine> for RoutineResponseDto {
    fn from(routine: Routine) -> Self {
        Self {
            routine: routine.into(),
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RoutineDto {
    id: i64,
    interval: String,
    time: String,
    effort: String,
    tool: String,
    content: String,
    active: bool,
    updated_at: String,
}

impl From<Routine> for RoutineDto {
    fn from(routine: Routine) -> Self {
        Self {
            id: routine.id,
            interval: routine.interval,
            time: routine.time,
            effort: routine.effort,
            tool: routine.tool,
            content: routine.content,
            active: routine.active,
            updated_at: routine.updated_at,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SummaryDayDto {
    date: String,
    done: usize,
    total: usize,
}

impl From<SummaryDay> for SummaryDayDto {
    fn from(day: SummaryDay) -> Self {
        Self {
            date: day.date,
            done: day.done,
            total: day.total,
        }
    }
}
