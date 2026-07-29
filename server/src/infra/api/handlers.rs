use std::sync::Arc;

use axum::{
    Json,
    body::{Body, to_bytes},
    extract::{
        Path, Query, Request, State,
        rejection::{JsonRejection, PathRejection, QueryRejection},
    },
};
use serde::Deserialize;

use crate::domain::harness::MAX_PROPOSAL_BODY_BYTES;
use crate::domain::learning::MAX_LEARNING_SET_BYTES;

use super::{
    AppState,
    dto::{
        DayDto, DigestDto, DigestInputDto, DigestStoredDto, HarnessApplyResultInputDto,
        HarnessDecisionInputDto, HarnessProposalBatchInputDto, HarnessProposalListDto,
        HarnessProposalResponseDto, HarnessProposalsDto, HealthDto, LearningInputDto,
        LearningResultDto, LearningResultInputDto, LearningSetDto, LearningStoredDto,
        RoutineInputDto, RoutineResponseDto, RoutinesDto, SummaryDto,
    },
    error::ApiError,
};

pub(super) async fn health(State(state): State<Arc<AppState>>) -> Json<HealthDto> {
    let routine_repository = Arc::clone(&state.routine_repository);
    let task_repository = Arc::clone(&state.task_repository);
    let version = env!("CARGO_PKG_VERSION");

    let (db_ok, routines) = tokio::task::spawn_blocking(move || {
        (
            task_repository.health_check().is_ok(),
            routine_repository.count_active_routines().unwrap_or(0),
        )
    })
    .await
    .unwrap_or((false, 0));

    Json(HealthDto::new(db_ok, routines, version))
}

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

pub(super) async fn list_routines(
    State(state): State<Arc<AppState>>,
    query: Result<Query<RoutinesQuery>, QueryRejection>,
) -> Result<Json<RoutinesDto>, ApiError> {
    let Query(query) = query.map_err(|error| ApiError::bad_request(error.to_string()))?;
    let usecase = Arc::clone(&state.manage_routines);
    let routines = tokio::task::spawn_blocking(move || usecase.list(query.include_inactive))
        .await
        .map_err(ApiError::from_join)??;

    Ok(Json(routines.into()))
}

pub(super) async fn create_routine(
    State(state): State<Arc<AppState>>,
    body: Result<Json<RoutineInputDto>, JsonRejection>,
) -> Result<Json<RoutineResponseDto>, ApiError> {
    let Json(input) = body.map_err(|error| ApiError::bad_request(error.to_string()))?;
    let usecase = Arc::clone(&state.manage_routines);
    let routine = tokio::task::spawn_blocking(move || usecase.create(input.into()))
        .await
        .map_err(ApiError::from_join)??;

    Ok(Json(routine.into()))
}

pub(super) async fn update_routine(
    State(state): State<Arc<AppState>>,
    path: Result<Path<i64>, PathRejection>,
    body: Result<Json<RoutineInputDto>, JsonRejection>,
) -> Result<Json<RoutineResponseDto>, ApiError> {
    let Path(id) = path.map_err(|error| ApiError::bad_request(error.to_string()))?;
    let Json(input) = body.map_err(|error| ApiError::bad_request(error.to_string()))?;
    let usecase = Arc::clone(&state.manage_routines);
    let routine = tokio::task::spawn_blocking(move || usecase.update(id, input.into()))
        .await
        .map_err(ApiError::from_join)??;

    Ok(Json(routine.into()))
}

pub(super) async fn delete_routine(
    State(state): State<Arc<AppState>>,
    path: Result<Path<i64>, PathRejection>,
) -> Result<Json<RoutineResponseDto>, ApiError> {
    let Path(id) = path.map_err(|error| ApiError::bad_request(error.to_string()))?;
    let usecase = Arc::clone(&state.manage_routines);
    let routine = tokio::task::spawn_blocking(move || usecase.delete(id))
        .await
        .map_err(ApiError::from_join)??;

    Ok(Json(routine.into()))
}

/// 取り込み（docs/specs/11-digest.md §3.1）。送信元は second-brain の deliver.sh
pub(super) async fn save_digest(
    State(state): State<Arc<AppState>>,
    body: Result<Json<DigestInputDto>, JsonRejection>,
) -> Result<Json<DigestStoredDto>, ApiError> {
    let Json(input) = body.map_err(|error| ApiError::bad_request(error.to_string()))?;
    let usecase = Arc::clone(&state.manage_digest);
    let stored = tokio::task::spawn_blocking(move || usecase.save(&input.date, &input.body))
        .await
        .map_err(ApiError::from_join)??;

    Ok(Json(stored.into()))
}

/// 取得（同 §3.3）。未受信の日も 200 で空セクションを返す
pub(super) async fn get_digest(
    State(state): State<Arc<AppState>>,
    path: Result<Path<String>, PathRejection>,
) -> Result<Json<DigestDto>, ApiError> {
    let Path(date) = path.map_err(|error| ApiError::bad_request(error.to_string()))?;
    let usecase = Arc::clone(&state.manage_digest);
    let view = tokio::task::spawn_blocking(move || usecase.get(&date))
        .await
        .map_err(ApiError::from_join)??;

    Ok(Json(view.into()))
}

pub(super) async fn save_learning_set(
    State(state): State<Arc<AppState>>,
    request: Request,
) -> Result<Json<LearningStoredDto>, ApiError> {
    let body = to_bytes(request.into_body(), MAX_LEARNING_SET_BYTES + 1)
        .await
        .map_err(|_| {
            ApiError::bad_request(format!(
                "body must not exceed {MAX_LEARNING_SET_BYTES} bytes"
            ))
        })?;
    if body.len() > MAX_LEARNING_SET_BYTES {
        return Err(ApiError::bad_request(format!(
            "body must not exceed {MAX_LEARNING_SET_BYTES} bytes"
        )));
    }
    let input: LearningInputDto =
        serde_json::from_slice(&body).map_err(|error| ApiError::bad_request(error.to_string()))?;
    let date = input.date.clone();
    let usecase = Arc::clone(&state.manage_learning);
    let stored =
        tokio::task::spawn_blocking(move || usecase.save_learning_set(&date, input.into()))
            .await
            .map_err(ApiError::from_join)??;

    Ok(Json(stored.into()))
}

pub(super) async fn get_learning_set(
    State(state): State<Arc<AppState>>,
    path: Result<Path<String>, PathRejection>,
) -> Result<Json<LearningSetDto>, ApiError> {
    let Path(date) = path.map_err(|error| ApiError::bad_request(error.to_string()))?;
    let usecase = Arc::clone(&state.manage_learning);
    let view = tokio::task::spawn_blocking(move || usecase.get_learning_set(&date))
        .await
        .map_err(ApiError::from_join)??;

    Ok(Json(view.into()))
}

pub(super) async fn save_learning_result(
    State(state): State<Arc<AppState>>,
    path: Result<Path<String>, PathRejection>,
    body: Result<Json<LearningResultInputDto>, JsonRejection>,
) -> Result<Json<LearningResultDto>, ApiError> {
    let Path(date) = path.map_err(|error| ApiError::bad_request(error.to_string()))?;
    let Json(input) = body.map_err(|error| ApiError::bad_request(error.to_string()))?;
    let usecase = Arc::clone(&state.manage_learning);
    let view =
        tokio::task::spawn_blocking(move || usecase.save_learning_result(&date, input.into()))
            .await
            .map_err(ApiError::from_join)??;

    Ok(Json(view.into()))
}

pub(super) async fn get_learning_result(
    State(state): State<Arc<AppState>>,
    path: Result<Path<String>, PathRejection>,
) -> Result<Json<LearningResultDto>, ApiError> {
    let Path(date) = path.map_err(|error| ApiError::bad_request(error.to_string()))?;
    let usecase = Arc::clone(&state.manage_learning);
    let view = tokio::task::spawn_blocking(move || usecase.get_learning_result(&date))
        .await
        .map_err(ApiError::from_join)??;

    Ok(Json(view.into()))
}

pub(super) async fn save_harness_proposals(
    State(state): State<Arc<AppState>>,
    request: Request,
) -> Result<Json<HarnessProposalListDto>, ApiError> {
    let body = read_harness_body(request.into_body()).await?;
    let input = serde_json::from_slice::<HarnessProposalBatchInputDto>(&body)
        .map_err(|error| ApiError::bad_request(error.to_string()))?;
    let body_size = body.len();
    let usecase = Arc::clone(&state.manage_harness);
    let proposals =
        tokio::task::spawn_blocking(move || usecase.save_proposals(input.into(), body_size))
            .await
            .map_err(ApiError::from_join)??;

    Ok(Json(proposals.into()))
}

pub(super) async fn get_harness_proposals(
    State(state): State<Arc<AppState>>,
    query: Result<Query<HarnessProposalsQuery>, QueryRejection>,
) -> Result<Json<HarnessProposalsResponse>, ApiError> {
    let Query(query) = query.map_err(|error| ApiError::bad_request(error.to_string()))?;
    let usecase = Arc::clone(&state.manage_harness);

    match (query.date, query.status, query.apply_state) {
        (date, None, None) => {
            let date = date.unwrap_or_else(|| "today".to_owned());
            let proposals = tokio::task::spawn_blocking(move || usecase.list_proposals(&date))
                .await
                .map_err(ApiError::from_join)??;
            Ok(Json(HarnessProposalsResponse::ByDate(proposals.into())))
        }
        (None, Some(status), Some(apply_state))
            if status == "approved" && apply_state == "pending" =>
        {
            let proposals = tokio::task::spawn_blocking(move || usecase.pending_approved())
                .await
                .map_err(ApiError::from_join)??;
            Ok(Json(HarnessProposalsResponse::Pending(proposals.into())))
        }
        _ => Err(ApiError::bad_request(
            "query must contain date only, or status=approved&applyState=pending",
        )),
    }
}

pub(super) async fn save_harness_decision(
    State(state): State<Arc<AppState>>,
    path: Result<Path<i64>, PathRejection>,
    body: Result<Json<HarnessDecisionInputDto>, JsonRejection>,
) -> Result<Json<HarnessProposalResponseDto>, ApiError> {
    let Path(id) = path.map_err(|error| ApiError::bad_request(error.to_string()))?;
    let Json(input) = body.map_err(|error| ApiError::bad_request(error.to_string()))?;
    let usecase = Arc::clone(&state.manage_harness);
    let proposal = tokio::task::spawn_blocking(move || usecase.save_decision(id, &input.status))
        .await
        .map_err(ApiError::from_join)??;

    Ok(Json(proposal.into()))
}

pub(super) async fn save_harness_apply_result(
    State(state): State<Arc<AppState>>,
    path: Result<Path<i64>, PathRejection>,
    body: Result<Json<HarnessApplyResultInputDto>, JsonRejection>,
) -> Result<Json<HarnessProposalResponseDto>, ApiError> {
    let Path(id) = path.map_err(|error| ApiError::bad_request(error.to_string()))?;
    let Json(input) = body.map_err(|error| ApiError::bad_request(error.to_string()))?;
    let usecase = Arc::clone(&state.manage_harness);
    let proposal = tokio::task::spawn_blocking(move || usecase.save_apply_result(id, input.into()))
        .await
        .map_err(ApiError::from_join)??;

    Ok(Json(proposal.into()))
}

async fn read_harness_body(body: Body) -> Result<axum::body::Bytes, ApiError> {
    to_bytes(body, MAX_PROPOSAL_BODY_BYTES + 1)
        .await
        .map_err(|error| ApiError::bad_request(error.to_string()))
}

pub(super) async fn not_found() -> ApiError {
    ApiError::not_found("API path not found")
}

#[derive(Debug, Deserialize)]
pub(super) struct SummaryQuery {
    days: Option<u32>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub(super) struct RoutinesQuery {
    include_inactive: bool,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default, rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct HarnessProposalsQuery {
    date: Option<String>,
    status: Option<String>,
    apply_state: Option<String>,
}

#[derive(Debug, serde::Serialize)]
#[serde(untagged)]
pub(super) enum HarnessProposalsResponse {
    ByDate(HarnessProposalListDto),
    Pending(HarnessProposalsDto),
}
