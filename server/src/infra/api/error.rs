use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde::Serialize;
use tokio::task::JoinError;

use crate::usecase::error::UsecaseError;

#[derive(Debug)]
pub(super) struct ApiError {
    pub(super) status: StatusCode,
    pub(super) code: &'static str,
    message: String,
}

impl ApiError {
    pub(super) fn bad_request(message: impl Into<String>) -> Self {
        Self::new(StatusCode::BAD_REQUEST, "bad_request", message)
    }

    pub(super) fn not_found(message: impl Into<String>) -> Self {
        Self::new(StatusCode::NOT_FOUND, "not_found", message)
    }

    pub(super) fn from_join(_: JoinError) -> Self {
        Self::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal",
            "internal error",
        )
    }

    fn new(status: StatusCode, code: &'static str, message: impl Into<String>) -> Self {
        Self {
            status,
            code,
            message: message.into(),
        }
    }
}

impl From<UsecaseError> for ApiError {
    fn from(error: UsecaseError) -> Self {
        match error {
            error @ UsecaseError::BadRequest(_) => {
                Self::new(StatusCode::BAD_REQUEST, "bad_request", error.to_string())
            }
            error @ UsecaseError::ReadonlyDay(_) => {
                Self::new(StatusCode::FORBIDDEN, "readonly_day", error.to_string())
            }
            error @ UsecaseError::NotFound(_) => {
                Self::new(StatusCode::NOT_FOUND, "not_found", error.to_string())
            }
            error @ UsecaseError::Internal(_) => Self::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "internal",
                error.to_string(),
            ),
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (
            self.status,
            Json(ErrorResponse {
                error: ErrorBody {
                    code: self.code,
                    message: self.message,
                },
            }),
        )
            .into_response()
    }
}

#[derive(Debug, Serialize)]
struct ErrorResponse {
    error: ErrorBody,
}

#[derive(Debug, Serialize)]
struct ErrorBody {
    code: &'static str,
    message: String,
}
