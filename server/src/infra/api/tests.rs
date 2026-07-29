use std::{path::PathBuf, sync::Arc};

use axum::{
    body::{Body, to_bytes},
    http::{
        Request, StatusCode,
        header::{CACHE_CONTROL, CONTENT_TYPE},
    },
    response::Response,
};
use chrono::{DateTime, FixedOffset};
use serde_json::{Value, json};
use tower::ServiceExt;

use super::{AppState, error::ApiError, router};
use crate::{
    adapters::sqlite_repo::SqliteTaskRepository,
    config::Config,
    domain::routine::RoutineFields,
    usecase::{
        error::UsecaseError,
        get_day::GetDay,
        get_summary::GetSummary,
        manage_digest::ManageDigest,
        manage_routines::ManageRoutines,
        ports::{Clock, DigestRepository, RoutineRepository, TaskRepository},
        toggle_check::ToggleCheck,
    },
};

struct FakeClock;

impl Clock for FakeClock {
    fn now(&self) -> DateTime<FixedOffset> {
        DateTime::parse_from_rfc3339("2026-07-25T08:01:00+09:00")
            .expect("fixed test time should parse")
    }
}

fn test_app() -> axum::Router {
    test_app_with_routines(true)
}

fn test_app_with_routines(seed_routines: bool) -> axum::Router {
    let repository = Arc::new(
        SqliteTaskRepository::open(std::path::Path::new(":memory:"))
            .expect("in-memory SQLite should initialize"),
    );
    if seed_routines {
        for fields in [
            RoutineFields {
                detail_ref: None,
                interval: "毎日".to_owned(),
                time: "8:30".to_owned(),
                effort: "10分".to_owned(),
                tool: "slack".to_owned(),
                content: "daily later".to_owned(),
            },
            RoutineFields {
                detail_ref: None,
                interval: "毎日".to_owned(),
                time: "7:30".to_owned(),
                effort: String::new(),
                tool: "slack".to_owned(),
                content: "daily earlier".to_owned(),
            },
        ] {
            repository
                .insert_routine(&fields, "2026-07-24T12:00:00+09:00")
                .expect("test routine should insert");
        }
    }
    let routine_repository: Arc<dyn RoutineRepository> = repository.clone();
    let digest_repository: Arc<dyn DigestRepository> = repository.clone();
    let task_repository: Arc<dyn TaskRepository> = repository;
    let clock: Arc<dyn Clock> = Arc::new(FakeClock);
    let manage_routines = Arc::new(ManageRoutines::new(
        Arc::clone(&routine_repository),
        Arc::clone(&clock),
    ));
    let manage_digest = Arc::new(ManageDigest::new(digest_repository, Arc::clone(&clock)));

    router(Arc::new(AppState {
        get_day: Arc::new(GetDay::new(
            Arc::clone(&routine_repository),
            Arc::clone(&task_repository),
            Arc::clone(&clock),
        )),
        toggle_check: Arc::new(ToggleCheck::new(
            Arc::clone(&routine_repository),
            Arc::clone(&task_repository),
            Arc::clone(&clock),
        )),
        get_summary: Arc::new(GetSummary::new(
            Arc::clone(&task_repository),
            Arc::clone(&clock),
        )),
        manage_routines,
        manage_digest,
        routine_repository,
        task_repository,
        config: Arc::new(Config {
            port: 48210,
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

async fn call_json(app: axum::Router, method: &str, uri: &str, body: Value) -> Response {
    app.oneshot(
        Request::builder()
            .method(method)
            .uri(uri)
            .header(CONTENT_TYPE, "application/json")
            .body(Body::from(body.to_string()))
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
            "db": "ok",
            "routines": 2,
            "version": env!("CARGO_PKG_VERSION")
        })
    );

    let empty_response = call(test_app_with_routines(false), "GET", "/api/health").await;
    assert_eq!(empty_response.status(), StatusCode::OK);
    assert_eq!(empty_response.headers()[CACHE_CONTROL], "no-store");
    assert_eq!(
        json_body(empty_response).await,
        json!({
            "db": "ok",
            "routines": 0,
            "version": env!("CARGO_PKG_VERSION")
        })
    );
}

#[tokio::test]
async fn empty_routine_master_serves_a_taskless_today() {
    let response = call(test_app_with_routines(false), "GET", "/api/days/today").await;
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        json_body(response).await["progress"],
        json!({ "done": 0, "total": 0 })
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

#[tokio::test]
async fn routine_crud_and_errors_follow_the_http_contract() {
    let app = test_app_with_routines(false);
    let create_payload = json!({
        "interval": " 毎日 ",
        "time": " 7:30 ",
        "effort": " 10分 ",
        "tool": " slack ",
        "content": " 対象<br>続き "
    });

    let create_response =
        call_json(app.clone(), "POST", "/api/routines", create_payload.clone()).await;
    assert_eq!(create_response.status(), StatusCode::OK);
    assert_eq!(create_response.headers()[CACHE_CONTROL], "no-store");
    assert_eq!(
        json_body(create_response).await,
        json!({
            "routine": {
                "id": 1,
                "detailRef": null,
                "interval": "毎日",
                "time": "7:30",
                "effort": "10分",
                "tool": "slack",
                "content": "対象<br>続き",
                "active": true,
                "updatedAt": "2026-07-25T08:01:00+09:00"
            }
        })
    );

    let conflict_response = call_json(app.clone(), "POST", "/api/routines", create_payload).await;
    assert_eq!(conflict_response.status(), StatusCode::CONFLICT);
    assert_eq!(conflict_response.headers()[CACHE_CONTROL], "no-store");
    assert_eq!(
        json_body(conflict_response).await["error"]["code"],
        "conflict"
    );

    let invalid_response = call_json(
        app.clone(),
        "POST",
        "/api/routines",
        json!({
            "interval": "毎日",
            "time": "7:3",
            "effort": "",
            "tool": "",
            "content": "invalid"
        }),
    )
    .await;
    assert_eq!(invalid_response.status(), StatusCode::BAD_REQUEST);
    assert_eq!(
        json_body(invalid_response).await["error"]["code"],
        "bad_request"
    );

    let unknown_response = call_json(
        app.clone(),
        "PUT",
        "/api/routines/999",
        json!({
            "interval": "平日",
            "time": "8:00",
            "effort": "",
            "tool": "obsidian",
            "content": "unknown"
        }),
    )
    .await;
    assert_eq!(unknown_response.status(), StatusCode::NOT_FOUND);
    assert_eq!(
        json_body(unknown_response).await["error"]["code"],
        "not_found"
    );

    let list_response = call(app.clone(), "GET", "/api/routines").await;
    assert_eq!(list_response.status(), StatusCode::OK);
    let listed = json_body(list_response).await;
    assert_eq!(listed["routines"].as_array().map(Vec::len), Some(1));
    assert_eq!(listed["routines"][0]["id"], 1);
    assert_eq!(listed["routines"][0]["active"], true);

    let update_response = call_json(
        app.clone(),
        "PUT",
        "/api/routines/1",
        json!({
            "interval": "平日",
            "time": "",
            "effort": "15分",
            "tool": "obsidian",
            "content": "更新後"
        }),
    )
    .await;
    assert_eq!(update_response.status(), StatusCode::OK);
    let updated = json_body(update_response).await;
    assert_eq!(updated["routine"]["id"], 1);
    assert_eq!(updated["routine"]["interval"], "平日");
    assert_eq!(updated["routine"]["time"], "");
    assert_eq!(updated["routine"]["content"], "更新後");
    assert_eq!(updated["routine"]["active"], true);

    let delete_response = call(app.clone(), "DELETE", "/api/routines/1").await;
    assert_eq!(delete_response.status(), StatusCode::OK);
    let deleted = json_body(delete_response).await;
    assert_eq!(deleted["routine"]["id"], 1);
    assert_eq!(deleted["routine"]["active"], false);

    let active_list = call(app.clone(), "GET", "/api/routines").await;
    assert_eq!(active_list.status(), StatusCode::OK);
    assert_eq!(json_body(active_list).await, json!({ "routines": [] }));

    let full_list = call(app, "GET", "/api/routines?includeInactive=true").await;
    assert_eq!(full_list.status(), StatusCode::OK);
    let full = json_body(full_list).await;
    assert_eq!(full["routines"].as_array().map(Vec::len), Some(1));
    assert_eq!(full["routines"][0]["active"], false);
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
            UsecaseError::Conflict("duplicate".to_owned()),
            StatusCode::CONFLICT,
            "conflict",
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

/// docs/specs/11-digest.md §3.1・§3.3 と docs/specs/03-api.md §3 の契約。
/// 未受信の日は 404 ではなく空セクションで 200 を返すことが要点。
#[tokio::test]
async fn digest_round_trip_parses_sections_and_reports_missing_days_as_empty() {
    let app = test_app();

    let missing = call(app.clone(), "GET", "/api/digests/2026-07-20").await;
    assert_eq!(missing.status(), StatusCode::OK);
    let body = json_body(missing).await;
    assert_eq!(body["date"], "2026-07-20");
    assert_eq!(body["receivedAt"], Value::Null);
    assert_eq!(body["sections"].as_array().map(Vec::len), Some(0));

    let saved = call_json(
        app.clone(),
        "POST",
        "/api/digests",
        json!({
            "date": "today",
            "body": ":brain: *つながり*\n起点: 起点の一行\n→ 連鎖 — `20_Insights/a.md`\n\n:bulb: *アイデア*\n• *案*\n  詳細行\n",
        }),
    )
    .await;
    assert_eq!(saved.status(), StatusCode::OK);
    let saved = json_body(saved).await;
    assert_eq!(saved["date"], "2026-07-25");

    let fetched = json_body(call(app, "GET", "/api/digests/today").await).await;
    assert_eq!(fetched["date"], "2026-07-25");
    assert!(fetched["receivedAt"].is_string());
    assert_eq!(fetched["sections"][0]["kind"], "connection");
    assert_eq!(fetched["sections"][0]["title"], ":brain: *つながり*");
    assert_eq!(fetched["sections"][0]["blocks"][0]["kind"], "lead");
    assert_eq!(fetched["sections"][0]["blocks"][1]["kind"], "chain");
    assert_eq!(
        fetched["sections"][0]["blocks"][1]["notePath"],
        "20_Insights/a.md"
    );
    assert_eq!(fetched["sections"][1]["kind"], "idea");
    assert!(
        fetched["sections"][1]["blocks"][0]["text"]
            .as_str()
            .expect("bullet text should be a string")
            .contains("詳細行"),
        "indented continuation should fold into the bullet"
    );
}

#[tokio::test]
async fn digest_rejects_empty_bodies_and_bad_dates() {
    let empty = call_json(
        test_app(),
        "POST",
        "/api/digests",
        json!({ "date": "today", "body": "   " }),
    )
    .await;
    assert_eq!(empty.status(), StatusCode::BAD_REQUEST);
    assert_eq!(json_body(empty).await["error"]["code"], "bad_request");

    let bad_date = call_json(
        test_app(),
        "POST",
        "/api/digests",
        json!({ "date": "2026-7-1", "body": "x" }),
    )
    .await;
    assert_eq!(bad_date.status(), StatusCode::BAD_REQUEST);
}

/// detail_ref は 02-data-model.md §6 の閉じた語彙のみ。DayResponse まで運ばれることも見る
#[tokio::test]
async fn detail_ref_is_validated_and_reaches_the_day_response() {
    let app = test_app();

    let invalid = call_json(
        app.clone(),
        "POST",
        "/api/routines",
        json!({
            "interval": "毎日", "time": "6:00", "effort": "", "tool": "",
            "content": "詳細つき", "detailRef": "learning.unknown",
        }),
    )
    .await;
    assert_eq!(invalid.status(), StatusCode::BAD_REQUEST);
    assert_eq!(json_body(invalid).await["error"]["code"], "bad_request");

    let created = call_json(
        app.clone(),
        "POST",
        "/api/routines",
        json!({
            "interval": "毎日", "time": "6:00", "effort": "", "tool": "",
            "content": "詳細つき", "detailRef": "learning.session",
        }),
    )
    .await;
    assert_eq!(created.status(), StatusCode::OK);
    assert_eq!(
        json_body(created).await["routine"]["detailRef"],
        "learning.session"
    );

    let day = json_body(call(app, "GET", "/api/days/today").await).await;
    let with_detail = day["tasks"]
        .as_array()
        .expect("tasks should be an array")
        .iter()
        .find(|task| task["content"] == "詳細つき")
        .expect("the created routine should appear in today's snapshot");
    assert_eq!(with_detail["detailRef"], "learning.session");
    let without_detail = day["tasks"]
        .as_array()
        .expect("tasks should be an array")
        .iter()
        .find(|task| task["content"] == "daily earlier")
        .expect("seeded routine should appear too");
    assert_eq!(without_detail["detailRef"], Value::Null);
}
