use std::sync::Arc;

use axum::{
    Router, middleware,
    response::Response,
    routing::{get, post},
};

use crate::{
    config::Config,
    infra::assets,
    usecase::{
        get_day::GetDay,
        get_summary::GetSummary,
        manage_digest::ManageDigest,
        manage_harness::ManageHarness,
        manage_routines::ManageRoutines,
        ports::{RoutineRepository, TaskRepository},
        toggle_check::ToggleCheck,
    },
};

mod dto;
mod error;
mod handlers;

pub struct AppState {
    pub get_day: Arc<GetDay>,
    pub toggle_check: Arc<ToggleCheck>,
    pub get_summary: Arc<GetSummary>,
    pub manage_routines: Arc<ManageRoutines>,
    pub manage_digest: Arc<ManageDigest>,
    pub manage_harness: Arc<ManageHarness>,
    pub routine_repository: Arc<dyn RoutineRepository>,
    pub task_repository: Arc<dyn TaskRepository>,
    pub config: Arc<Config>,
}

pub fn router(state: Arc<AppState>) -> Router {
    let api_routes = Router::new()
        .route("/health", get(handlers::health))
        .route("/days/{date}", get(handlers::get_day))
        .route(
            "/days/{date}/checks/{task_id}",
            post(handlers::toggle_check),
        )
        .route("/summary", get(handlers::get_summary))
        .route("/digests", post(handlers::save_digest))
        .route("/digests/{date}", get(handlers::get_digest))
        .route(
            "/harness/proposals",
            get(handlers::get_harness_proposals).post(handlers::save_harness_proposals),
        )
        .route(
            "/harness/proposals/{id}/decision",
            post(handlers::save_harness_decision),
        )
        .route(
            "/harness/proposals/{id}/apply-result",
            post(handlers::save_harness_apply_result),
        )
        .route(
            "/routines",
            get(handlers::list_routines).post(handlers::create_routine),
        )
        .route(
            "/routines/{id}",
            axum::routing::put(handlers::update_routine).delete(handlers::delete_routine),
        )
        .fallback(handlers::not_found)
        .layer(middleware::map_response(no_store));

    Router::new()
        .nest("/api", api_routes)
        .with_state(state)
        .fallback(assets::serve)
}

async fn no_store(mut response: Response) -> Response {
    response.headers_mut().insert(
        axum::http::header::CACHE_CONTROL,
        axum::http::HeaderValue::from_static("no-store"),
    );
    response
}

#[cfg(test)]
mod tests;
