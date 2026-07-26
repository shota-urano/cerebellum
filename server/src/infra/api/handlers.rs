use std::sync::Arc;

use axum::{
    Json,
    extract::{
        Path, Query, State,
        rejection::{PathRejection, QueryRejection},
    },
};
use serde::Deserialize;

use super::{
    AppState,
    dto::{DayDto, SummaryDto},
    error::ApiError,
};

pub(super) async fn get_day(
    State(state): State<Arc<AppState>>,
    path: Result<Path<String>, PathRejection>,
) -> Result<Json<DayDto>, ApiError> {
    let Path(date) = path.map_err(|error| ApiError::bad_request(error.to_string()))?;
    let usecase = Arc::clone(&state.get_day);
    let snapshot = tokio::task::spawn_blocking(move || usecase.execute(&date))
        .await
        .map_err(ApiError::from_join)??;

    Ok(Json(snapshot.into()))
}

pub(super) async fn toggle_check(
    State(state): State<Arc<AppState>>,
    path: Result<Path<(String, String)>, PathRejection>,
) -> Result<Json<DayDto>, ApiError> {
    let Path((date, task_id)) = path.map_err(|error| ApiError::bad_request(error.to_string()))?;
    let usecase = Arc::clone(&state.toggle_check);
    let snapshot = tokio::task::spawn_blocking(move || usecase.execute(&date, &task_id))
        .await
        .map_err(ApiError::from_join)??;

    Ok(Json(snapshot.into()))
}

pub(super) async fn get_summary(
    State(state): State<Arc<AppState>>,
    query: Result<Query<SummaryQuery>, QueryRejection>,
) -> Result<Json<SummaryDto>, ApiError> {
    let Query(query) = query.map_err(|error| ApiError::bad_request(error.to_string()))?;
    let usecase = Arc::clone(&state.get_summary);
    let days = tokio::task::spawn_blocking(move || usecase.execute(query.days))
        .await
        .map_err(ApiError::from_join)??;

    Ok(Json(days.into()))
}

pub(super) async fn not_found() -> ApiError {
    ApiError::not_found("API path not found")
}

#[derive(Debug, Deserialize)]
pub(super) struct SummaryQuery {
    days: Option<u32>,
}
