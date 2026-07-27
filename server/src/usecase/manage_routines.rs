use std::sync::Arc;

use crate::domain::routine::{Routine, RoutineFields};

use super::{
    error::UsecaseError,
    ports::{Clock, RoutineRepository, RoutineRepositoryError},
};

pub struct ManageRoutines {
    repository: Arc<dyn RoutineRepository>,
    clock: Arc<dyn Clock>,
}

impl ManageRoutines {
    pub fn new(repository: Arc<dyn RoutineRepository>, clock: Arc<dyn Clock>) -> Self {
        Self { repository, clock }
    }

    pub fn list(&self, include_inactive: bool) -> Result<Vec<Routine>, UsecaseError> {
        let mut routines = self
            .repository
            .list_routines(include_inactive)
            .map_err(repository_error)?;
        routines.sort_by_key(|routine| routine.id);
        Ok(routines)
    }

    pub fn create(&self, input: RoutineFields) -> Result<Routine, UsecaseError> {
        let fields = validate(input)?;
        let timestamp = self.clock.now().to_rfc3339();
        self.repository
            .insert_routine(&fields, &timestamp)
            .map_err(repository_error)
    }

    pub fn update(&self, id: i64, input: RoutineFields) -> Result<Routine, UsecaseError> {
        let fields = validate(input)?;
        let timestamp = self.clock.now().to_rfc3339();
        self.repository
            .update_routine(id, &fields, &timestamp)
            .map_err(repository_error)?
            .ok_or_else(|| UsecaseError::NotFound(format!("routine {id}")))
    }

    pub fn delete(&self, id: i64) -> Result<Routine, UsecaseError> {
        let timestamp = self.clock.now().to_rfc3339();
        self.repository
            .deactivate_routine(id, &timestamp)
            .map_err(repository_error)?
            .ok_or_else(|| UsecaseError::NotFound(format!("routine {id}")))
    }
}

fn validate(input: RoutineFields) -> Result<RoutineFields, UsecaseError> {
    let fields = RoutineFields {
        interval: input.interval.trim().to_owned(),
        time: input.time.trim().to_owned(),
        effort: input.effort.trim().to_owned(),
        tool: input.tool.trim().to_owned(),
        content: input.content.trim().to_owned(),
    };

    if fields.interval.is_empty() {
        return Err(UsecaseError::BadRequest(
            "interval must not be empty".to_owned(),
        ));
    }
    if fields.content.is_empty() {
        return Err(UsecaseError::BadRequest(
            "content must not be empty".to_owned(),
        ));
    }
    if !valid_time(&fields.time) {
        return Err(UsecaseError::BadRequest(
            "time must be empty or match H:MM or HH:MM".to_owned(),
        ));
    }

    Ok(fields)
}

fn valid_time(time: &str) -> bool {
    if time.is_empty() {
        return true;
    }

    let Some((hour, minute)) = time.split_once(':') else {
        return false;
    };
    !hour.contains(':')
        && (1..=2).contains(&hour.len())
        && hour.bytes().all(|byte| byte.is_ascii_digit())
        && minute.len() == 2
        && minute.bytes().all(|byte| byte.is_ascii_digit())
}

fn repository_error(error: RoutineRepositoryError) -> UsecaseError {
    match error {
        RoutineRepositoryError::Conflict => {
            UsecaseError::Conflict("an active routine with the same identity exists".to_owned())
        }
        error @ RoutineRepositoryError::Internal { .. } => UsecaseError::Internal(Box::new(error)),
    }
}
