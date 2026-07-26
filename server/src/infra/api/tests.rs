use std::{
    path::PathBuf,
    sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    },
};

use axum::{
    body::{Body, to_bytes},
    http::{Request, StatusCode, header::CACHE_CONTROL},
    response::Response,
};
use chrono::{DateTime, FixedOffset};
use serde_json::{Value, json};
use tower::ServiceExt;

use super::{AppState, error::ApiError, router};
use crate::{
    adapters::sqlite_repo::SqliteTaskRepository,
    config::Config,
    usecase::{
        error::UsecaseError,
        get_day::GetDay,
        get_summary::GetSummary,
        ports::{Clock, TaskRepository, VaultReader, VaultReaderError},
        toggle_check::ToggleCheck,
    },
};

const ROUTINE_MARKDOWN: &str = r#"
| 間隔 | 時間 | 実施 | 確認ツール | 内容 |
| --- | --- | --- | --- | --- |
| 毎日 | 8:30 | 10分 | slack | daily later |
| 毎日 | 7:30 | | slack | daily earlier |
"#;

struct FakeClock;

impl Clock for FakeClock {
    fn now(&self) -> DateTime<FixedOffset> {
        DateTime::parse_from_rfc3339("2026-07-25T08:01:00+09:00")
            .expect("fixed test time should parse")
    }
}

struct FakeVaultReader {
    read_count: AtomicUsize,
    available: bool,
}

impl VaultReader for FakeVaultReader {
    fn read_routine_markdown(&self) -> Result<String, VaultReaderError> {
        self.read_count.fetch_add(1, Ordering::SeqCst);
        if self.available {
            Ok(ROUTINE_MARKDOWN.to_owned())
        } else {
            Err(VaultReaderError::new(std::io::Error::other(
                "routine markdown is unavailable",
            )))
        }
    }
}

fn test_app() -> axum::Router {
    test_app_with_vault(true)
}

fn test_app_with_vault(available: bool) -> axum::Router {
    let vault_reader: Arc<dyn VaultReader> = Arc::new(FakeVaultReader {
        read_count: AtomicUsize::new(0),
        available,
    });
    let repository: Arc<dyn TaskRepository> = Arc::new(
        SqliteTaskRepository::open(std::path::Path::new(":memory:"))
            .expect("in-memory SQLite should initialize"),
    );
    let clock: Arc<dyn Clock> = Arc::new(FakeClock);

    router(Arc::new(AppState {
        get_day: Arc::new(GetDay::new(
            Arc::clone(&vault_reader),
            Arc::clone(&repository),
            Arc::clone(&clock),
        )),
        toggle_check: Arc::new(ToggleCheck::new(
            Arc::clone(&vault_reader),
            Arc::clone(&repository),
            Arc::clone(&clock),
        )),
        get_summary: Arc::new(GetSummary::new(Arc::clone(&repository), clock)),
        vault_reader,
        task_repository: repository,
        config: Arc::new(Config {
            port: 48210,
            vault_path: PathBuf::from("/unused"),
            db_path: PathBuf::from(":memory:"),
        }),
    }))
}

async fn call(app: axum::Router, method: &str, uri: &str) -> Response {
    app.oneshot(
        Request::builder()
            .method(method)
            .uri(uri)
            .body(Body::empty())
            .expect("test request should build"),
    )
    .await
    .expect("router should respond")
}

async fn json_body(response: Response) -> Value {
    let bytes = to_bytes(response.into_body(), usize::MAX)
        .await
        .expect("response body should be readable");
    serde_json::from_slice(&bytes).expect("response body should be JSON")
}

#[tokio::test]
async fn health_is_always_200_and_reports_each_dependency() {
    let healthy_response = call(test_app(), "GET", "/api/health").await;
    assert_eq!(healthy_response.status(), StatusCode::OK);
    assert_eq!(healthy_response.headers()[CACHE_CONTROL], "no-store");
    assert_eq!(
        json_body(healthy_response).await,
        json!({
            "vault": "ok",
            "db": "ok",
            "version": env!("CARGO_PKG_VERSION")
        })
    );

    let unavailable_response = call(test_app_with_vault(false), "GET", "/api/health").await;
    assert_eq!(unavailable_response.status(), StatusCode::OK);
    assert_eq!(unavailable_response.headers()[CACHE_CONTROL], "no-store");
    assert_eq!(
        json_body(unavailable_response).await,
        json!({
            "vault": "ng",
            "db": "ok",
            "version": env!("CARGO_PKG_VERSION")
        })
    );
}

#[tokio::test]
async fn static_routes_use_asset_specific_cache_headers_and_spa_fallback() {
    let app = test_app();

    for uri in ["/", "/history", "/missing/route"] {
        let response = call(app.clone(), "GET", uri).await;
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.headers()[CACHE_CONTROL], "no-cache");
        assert_eq!(
            response.headers()[axum::http::header::CONTENT_TYPE],
            "text/html; charset=utf-8"
        );
    }

    let manifest = call(app, "GET", "/manifest.webmanifest").await;
    assert_eq!(manifest.status(), StatusCode::OK);
    assert_eq!(manifest.headers()[CACHE_CONTROL], "public, max-age=3600");
    assert_eq!(
        manifest.headers()[axum::http::header::CONTENT_TYPE],
        "application/manifest+json"
    );
}

#[tokio::test]
async fn today_get_then_toggle_then_past_toggle_returns_200_200_403() {
    let app = test_app();

    let today_response = call(app.clone(), "GET", "/api/days/today").await;
    assert_eq!(today_response.status(), StatusCode::OK);
    assert_eq!(today_response.headers()[CACHE_CONTROL], "no-store");
    let today = json_body(today_response).await;
    assert_eq!(today["date"], "2026-07-25");
    assert_eq!(today["weekday"], "土");
    assert_eq!(today["readonly"], false);
    assert_eq!(today["progress"], json!({ "done": 0, "total": 2 }));
    assert_eq!(today["tasks"][0]["checkedAt"], Value::Null);
    assert!(today["tasks"][0].get("interval").is_none());
    assert!(today["tasks"][0].get("sortNo").is_none());

    let task_id = today["tasks"][0]["id"]
        .as_str()
        .expect("task id should be a string");
    let toggle_uri = format!("/api/days/today/checks/{task_id}");
    let toggle_response = call(app.clone(), "POST", &toggle_uri).await;
    assert_eq!(toggle_response.status(), StatusCode::OK);
    assert_eq!(toggle_response.headers()[CACHE_CONTROL], "no-store");
    let toggled = json_body(toggle_response).await;
    assert_eq!(toggled["readonly"], false);
    assert_eq!(toggled["progress"], json!({ "done": 1, "total": 2 }));
    assert_eq!(toggled["tasks"][0]["done"], true);
    assert_eq!(
        toggled["tasks"][0]["checkedAt"],
        "2026-07-25T08:01:00+09:00"
    );

    let past_uri = format!("/api/days/2026-07-24/checks/{task_id}");
    let past_response = call(app, "POST", &past_uri).await;
    assert_eq!(past_response.status(), StatusCode::FORBIDDEN);
    assert_eq!(past_response.headers()[CACHE_CONTROL], "no-store");
    let error = json_body(past_response).await;
    assert_eq!(error["error"]["code"], "readonly_day");
    assert!(error["error"]["message"].is_string());
}

#[tokio::test]
async fn summary_and_api_errors_use_the_contract_shape() {
    let app = test_app();
    let today = call(app.clone(), "GET", "/api/days/today").await;
    assert_eq!(today.status(), StatusCode::OK);

    let summary_response = call(app.clone(), "GET", "/api/summary?days=7").await;
    assert_eq!(summary_response.status(), StatusCode::OK);
    assert_eq!(summary_response.headers()[CACHE_CONTROL], "no-store");
    assert_eq!(
        json_body(summary_response).await,
        json!({
            "days": [
                { "date": "2026-07-25", "done": 0, "total": 2 }
            ]
        })
    );

    for uri in ["/api/summary?days=nope", "/api", "/api/unknown"] {
        let response = call(app.clone(), "GET", uri).await;
        let expected_status = if uri.contains("summary") {
            StatusCode::BAD_REQUEST
        } else {
            StatusCode::NOT_FOUND
        };
        assert_eq!(response.status(), expected_status);
        assert_eq!(response.headers()[CACHE_CONTROL], "no-store");
        let body = json_body(response).await;
        assert!(body["error"]["code"].is_string());
        assert!(body["error"]["message"].is_string());
    }
}

#[tokio::test]
async fn unchecked_task_returns_null_checked_at_after_a_second_toggle() {
    let app = test_app();
    let today = json_body(call(app.clone(), "GET", "/api/days/today").await).await;
    let task_id = today["tasks"][0]["id"]
        .as_str()
        .expect("task id should be a string");
    let toggle_uri = format!("/api/days/today/checks/{task_id}");

    assert_eq!(
        call(app.clone(), "POST", &toggle_uri).await.status(),
        StatusCode::OK
    );
    let unchecked_response = call(app, "POST", &toggle_uri).await;
    assert_eq!(unchecked_response.status(), StatusCode::OK);
    let unchecked = json_body(unchecked_response).await;

    assert_eq!(unchecked["tasks"][0]["done"], false);
    assert_eq!(unchecked["tasks"][0]["checkedAt"], Value::Null);
}

#[test]
fn every_usecase_error_maps_mechanically_to_the_api_contract() {
    let cases = [
        (
            UsecaseError::BadRequest("bad".to_owned()),
            StatusCode::BAD_REQUEST,
            "bad_request",
        ),
        (
            UsecaseError::ReadonlyDay("2026-07-24".to_owned()),
            StatusCode::FORBIDDEN,
            "readonly_day",
        ),
        (
            UsecaseError::NotFound("missing".to_owned()),
            StatusCode::NOT_FOUND,
            "not_found",
        ),
        (
            UsecaseError::VaultUnavailable(VaultReaderError::new(std::io::Error::other(
                "unavailable",
            ))),
            StatusCode::SERVICE_UNAVAILABLE,
            "vault_unavailable",
        ),
        (
            UsecaseError::Internal(Box::new(std::io::Error::other("broken"))),
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal",
        ),
    ];

    for (usecase_error, status, code) in cases {
        let api_error = ApiError::from(usecase_error);
        assert_eq!(api_error.status, status);
        assert_eq!(api_error.code, code);
    }
}
