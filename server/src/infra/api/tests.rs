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
        manage_harness::ManageHarness,
        manage_intake::ManageIntake,
        manage_learning::ManageLearning,
        manage_routines::ManageRoutines,
        ports::{
            Clock, DigestRepository, HarnessRepository, IntakeRepository, LearningRepository,
            RoutineRepository, TaskRepository,
        },
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
    let learning_repository: Arc<dyn LearningRepository> = repository.clone();
    let harness_repository: Arc<dyn HarnessRepository> = repository.clone();
    let intake_repository: Arc<dyn IntakeRepository> = repository.clone();
    let task_repository: Arc<dyn TaskRepository> = repository;
    let clock: Arc<dyn Clock> = Arc::new(FakeClock);
    let manage_routines = Arc::new(ManageRoutines::new(
        Arc::clone(&routine_repository),
        Arc::clone(&clock),
    ));
    let manage_digest = Arc::new(ManageDigest::new(digest_repository, Arc::clone(&clock)));
    let manage_learning = Arc::new(ManageLearning::new(learning_repository, Arc::clone(&clock)));
    let manage_harness = Arc::new(ManageHarness::new(harness_repository, Arc::clone(&clock)));
    let manage_intake = Arc::new(ManageIntake::new(intake_repository, Arc::clone(&clock)));

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
        manage_learning,
        manage_harness,
        manage_intake,
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
    call_json_body(app, method, uri, body.to_string()).await
}

async fn call_json_body(app: axum::Router, method: &str, uri: &str, body: String) -> Response {
    app.oneshot(
        Request::builder()
            .method(method)
            .uri(uri)
            .header(CONTENT_TYPE, "application/json")
            .body(Body::from(body))
            .expect("test request should build"),
    )
    .await
    .expect("router should respond")
}

fn learning_set_body_with_size(size: usize) -> String {
    let mut payload = json!({
        "date": "today",
        "theme": "theme",
        "lessonMd": "",
        "problems": [{ "no": 1, "questionMd": "q", "answerMd": "a" }]
    });
    let base_size = payload.to_string().len();
    assert!(base_size < size, "target size must fit a valid payload");
    payload["lessonMd"] = Value::String("x".repeat(size - base_size));

    let body = payload.to_string();
    assert_eq!(body.len(), size);
    body
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

#[tokio::test]
async fn learning_set_round_trip_resolves_today_applies_defaults_and_upserts() {
    let app = test_app();

    let first = call_json(
        app.clone(),
        "POST",
        "/api/learning/sets",
        json!({
            "date": "today",
            "theme": "SQLite",
            "lessonMd": "# WAL",
            "problems": [{
                "no": 1,
                "questionMd": "WAL とは？",
                "answerMd": "write-ahead log"
            }]
        }),
    )
    .await;
    assert_eq!(first.status(), StatusCode::OK);
    assert_eq!(first.headers()[CACHE_CONTROL], "no-store");
    assert_eq!(
        json_body(first).await,
        json!({
            "date": "2026-07-25",
            "receivedAt": "2026-07-25T08:01:00+09:00"
        })
    );

    let fetched = call(app.clone(), "GET", "/api/learning/sets/today").await;
    assert_eq!(fetched.status(), StatusCode::OK);
    assert_eq!(
        json_body(fetched).await,
        json!({
            "date": "2026-07-25",
            "receivedAt": "2026-07-25T08:01:00+09:00",
            "theme": "SQLite",
            "source": "theme",
            "lessonMd": "# WAL",
            "problems": [{
                "no": 1,
                "kind": "quiz",
                "questionMd": "WAL とは？",
                "answerMd": "write-ahead log",
                "answerType": null,
                "expected": null,
                "choices": null,
                "workdir": null
            }],
            "closingMd": null
        })
    );

    let replacement = call_json(
        app.clone(),
        "POST",
        "/api/learning/sets",
        json!({
            "date": "2026-07-25",
            "theme": "Rust",
            "source": "memo",
            "lessonMd": "# Ownership",
            "problems": [{
                "no": 2,
                "kind": "code",
                "questionMd": "借用を直す",
                "answerMd": "参照を使う",
                "workdir": "/tmp/learning/p2"
            }],
            "closingMd": "まとめ"
        }),
    )
    .await;
    assert_eq!(replacement.status(), StatusCode::OK);

    let replaced = json_body(call(app, "GET", "/api/learning/sets/2026-07-25").await).await;
    assert_eq!(replaced["theme"], "Rust");
    assert_eq!(replaced["source"], "memo");
    assert_eq!(replaced["problems"].as_array().map(Vec::len), Some(1));
    assert_eq!(replaced["problems"][0]["no"], 2);
    assert_eq!(replaced["problems"][0]["kind"], "code");
    assert_eq!(replaced["problems"][0]["workdir"], "/tmp/learning/p2");
    assert_eq!(replaced["closingMd"], "まとめ");
}

#[tokio::test]
async fn learning_set_accepts_and_returns_automatic_grading_fields() {
    let app = test_app();
    let response = call_json(
        app.clone(),
        "POST",
        "/api/learning/sets",
        json!({
            "date": "today",
            "theme": "automatic grading",
            "lessonMd": "lesson",
            "problems": [
                {
                    "no": 1,
                    "questionMd": "choose",
                    "answerMd": "B",
                    "answerType": "choice",
                    "expected": "B",
                    "choices": ["A", "B"]
                },
                {
                    "no": 2,
                    "questionMd": "calculate",
                    "answerMd": "-12.5",
                    "answerType": "number",
                    "expected": " -12.50 ",
                    "choices": null
                },
                {
                    "no": 3,
                    "questionMd": "name",
                    "answerMd": "WAL",
                    "answerType": "text",
                    "expected": "WAL"
                }
            ]
        }),
    )
    .await;
    assert_eq!(response.status(), StatusCode::OK);

    let fetched = json_body(call(app, "GET", "/api/learning/sets/today").await).await;
    assert_eq!(fetched["problems"][0]["answerType"], "choice");
    assert_eq!(fetched["problems"][0]["expected"], "B");
    assert_eq!(fetched["problems"][0]["choices"], json!(["A", "B"]));
    assert_eq!(fetched["problems"][1]["answerType"], "number");
    assert_eq!(fetched["problems"][1]["expected"], " -12.50 ");
    assert_eq!(fetched["problems"][1]["choices"], Value::Null);
    assert_eq!(fetched["problems"][2]["answerType"], "text");
    assert_eq!(fetched["problems"][2]["expected"], "WAL");
    assert_eq!(fetched["problems"][2]["choices"], Value::Null);
}

#[tokio::test]
async fn learning_set_rejects_invalid_automatic_grading_fields_without_saving() {
    let app = test_app();
    let invalid_problems = [
        json!({
            "no": 1, "questionMd": "q", "answerMd": "a",
            "answerType": "boolean", "expected": "true"
        }),
        json!({
            "no": 1, "questionMd": "q", "answerMd": "a",
            "answerType": "choice", "choices": ["A", "B"]
        }),
        json!({
            "no": 1, "questionMd": "q", "answerMd": "a",
            "answerType": "text", "expected": ""
        }),
        json!({
            "no": 1, "questionMd": "q", "answerMd": "a",
            "answerType": "text", "expected": "   "
        }),
        json!({
            "no": 1, "questionMd": "q", "answerMd": "a",
            "answerType": "choice", "expected": "A"
        }),
        json!({
            "no": 1, "questionMd": "q", "answerMd": "a",
            "answerType": "choice", "expected": "A", "choices": ["A"]
        }),
        json!({
            "no": 1, "questionMd": "q", "answerMd": "a",
            "answerType": "choice", "expected": "A",
            "choices": ["A", "B", "C", "D", "E", "F", "G"]
        }),
        json!({
            "no": 1, "questionMd": "q", "answerMd": "a",
            "answerType": "choice", "expected": "A", "choices": ["A", "A"]
        }),
        json!({
            "no": 1, "questionMd": "q", "answerMd": "a",
            "answerType": "choice", "expected": "C", "choices": ["A", "B"]
        }),
        json!({
            "no": 1, "questionMd": "q", "answerMd": "a",
            "answerType": "text", "expected": "A", "choices": []
        }),
        json!({
            "no": 1, "questionMd": "q", "answerMd": "a",
            "answerType": "number", "expected": "not-a-number"
        }),
    ];

    for problem in invalid_problems {
        let response = call_json(
            app.clone(),
            "POST",
            "/api/learning/sets",
            json!({
                "date": "today",
                "theme": "theme",
                "lessonMd": "lesson",
                "problems": [problem]
            }),
        )
        .await;
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        assert_eq!(json_body(response).await["error"]["code"], "bad_request");
    }

    let missing = call(app, "GET", "/api/learning/sets/today").await;
    assert_eq!(missing.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn learning_set_rejects_missing_required_fields_empty_problems_and_duplicates() {
    let app = test_app();
    let valid_problem = json!({
        "no": 1,
        "questionMd": "question",
        "answerMd": "answer"
    });
    let invalid_payloads = [
        json!({
            "theme": "theme",
            "lessonMd": "lesson",
            "problems": [valid_problem.clone()]
        }),
        json!({
            "date": "today",
            "lessonMd": "lesson",
            "problems": [valid_problem.clone()]
        }),
        json!({
            "date": "today",
            "theme": "theme",
            "problems": [valid_problem.clone()]
        }),
        json!({
            "date": "today",
            "theme": "theme",
            "lessonMd": "lesson"
        }),
        json!({
            "date": "today",
            "theme": "theme",
            "lessonMd": "lesson",
            "problems": []
        }),
        json!({
            "date": "today",
            "theme": "theme",
            "lessonMd": "lesson",
            "problems": [
                valid_problem.clone(),
                { "no": 1, "questionMd": "q2", "answerMd": "a2" }
            ]
        }),
        json!({
            "date": "today",
            "theme": "theme",
            "lessonMd": "lesson",
            "problems": [{ "questionMd": "q", "answerMd": "a" }]
        }),
        json!({
            "date": "today",
            "theme": "theme",
            "lessonMd": "lesson",
            "problems": [{ "no": 1, "answerMd": "a" }]
        }),
        json!({
            "date": "today",
            "theme": "theme",
            "lessonMd": "lesson",
            "problems": [{ "no": 1, "questionMd": "q" }]
        }),
    ];

    for payload in invalid_payloads {
        let response = call_json(app.clone(), "POST", "/api/learning/sets", payload).await;
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        assert_eq!(json_body(response).await["error"]["code"], "bad_request");
    }

    let missing = call(app, "GET", "/api/learning/sets/today").await;
    assert_eq!(missing.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn learning_set_rejects_unknown_vocab_bad_dates_and_oversized_bodies() {
    for payload in [
        json!({
            "date": "today",
            "theme": "theme",
            "source": "unknown",
            "lessonMd": "lesson",
            "problems": [{ "no": 1, "questionMd": "q", "answerMd": "a" }]
        }),
        json!({
            "date": "today",
            "theme": "theme",
            "lessonMd": "lesson",
            "problems": [{
                "no": 1,
                "kind": "essay",
                "questionMd": "q",
                "answerMd": "a"
            }]
        }),
        json!({
            "date": "2026-7-25",
            "theme": "theme",
            "lessonMd": "lesson",
            "problems": [{ "no": 1, "questionMd": "q", "answerMd": "a" }]
        }),
    ] {
        let response = call_json(test_app(), "POST", "/api/learning/sets", payload).await;
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        assert_eq!(json_body(response).await["error"]["code"], "bad_request");
    }

    let oversized = call_json_body(
        test_app(),
        "POST",
        "/api/learning/sets",
        learning_set_body_with_size(256 * 1024 + 1),
    )
    .await;
    assert_eq!(oversized.status(), StatusCode::BAD_REQUEST);
    assert_eq!(json_body(oversized).await["error"]["code"], "bad_request");

    let bad_get = call(test_app(), "GET", "/api/learning/sets/tomorrow").await;
    assert_eq!(bad_get.status(), StatusCode::BAD_REQUEST);
    assert_eq!(json_body(bad_get).await["error"]["code"], "bad_request");
}

#[tokio::test]
async fn learning_set_accepts_body_at_256_kib() {
    let response = call_json_body(
        test_app(),
        "POST",
        "/api/learning/sets",
        learning_set_body_with_size(256 * 1024),
    )
    .await;

    assert_eq!(response.status(), StatusCode::OK);
}

#[tokio::test]
async fn learning_set_accepts_exactly_ten_problems() {
    let problems = (1..=10)
        .map(|no| {
            json!({
                "no": no,
                "questionMd": format!("question {no}"),
                "answerMd": format!("answer {no}")
            })
        })
        .collect::<Vec<_>>();
    let response = call_json(
        test_app(),
        "POST",
        "/api/learning/sets",
        json!({
            "date": "today",
            "theme": "theme",
            "lessonMd": "lesson",
            "problems": problems
        }),
    )
    .await;

    assert_eq!(response.status(), StatusCode::OK);
}

#[tokio::test]
async fn learning_set_returns_not_found_for_dates_without_an_import() {
    let response = call(test_app(), "GET", "/api/learning/sets/2026-07-24").await;
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
    assert_eq!(response.headers()[CACHE_CONTROL], "no-store");
    assert_eq!(json_body(response).await["error"]["code"], "not_found");
}

async fn import_learning_set_for_result(app: axum::Router) {
    let response = call_json(
        app,
        "POST",
        "/api/learning/sets",
        json!({
            "date": "today",
            "theme": "SQLite",
            "lessonMd": "lesson",
            "problems": [
                { "no": 1, "questionMd": "q1", "answerMd": "a1" },
                { "no": 2, "questionMd": "q2", "answerMd": "a2" },
                { "no": 3, "questionMd": "q3", "answerMd": "a3" }
            ]
        }),
    )
    .await;
    assert_eq!(response.status(), StatusCode::OK);
}

#[tokio::test]
async fn learning_result_accepts_partial_grading_and_upserts_the_complete_result() {
    let app = test_app();
    import_learning_set_for_result(app.clone()).await;

    let partial = call_json(
        app.clone(),
        "POST",
        "/api/learning/sets/today/result",
        json!({
            "grades": [{ "no": 1, "grade": "o", "answer": "first answer" }],
            "feeling": ""
        }),
    )
    .await;
    assert_eq!(partial.status(), StatusCode::OK);
    assert_eq!(partial.headers()[CACHE_CONTROL], "no-store");
    assert_eq!(
        json_body(partial).await,
        json!({
            "date": "2026-07-25",
            "grades": [{ "no": 1, "grade": "o", "answer": "first answer" }],
            "feeling": "",
            "completedAt": "2026-07-25T08:01:00+09:00"
        })
    );

    let replacement = call_json(
        app.clone(),
        "POST",
        "/api/learning/sets/2026-07-25/result",
        json!({
            "grades": [
                { "no": 1, "grade": "o", "answer": "replaced answer" },
                { "no": 2, "grade": "d", "answer": "" },
                { "no": 3, "grade": "x" }
            ],
            "feeling": "やり直した"
        }),
    )
    .await;
    assert_eq!(replacement.status(), StatusCode::OK);

    let fetched = call(app, "GET", "/api/learning/sets/2026-07-25/result").await;
    assert_eq!(fetched.status(), StatusCode::OK);
    assert_eq!(
        json_body(fetched).await,
        json!({
            "date": "2026-07-25",
            "grades": [
                { "no": 1, "grade": "o", "answer": "replaced answer" },
                { "no": 2, "grade": "d", "answer": "" },
                { "no": 3, "grade": "x" }
            ],
            "feeling": "やり直した",
            "completedAt": "2026-07-25T08:01:00+09:00"
        })
    );
}

#[tokio::test]
async fn learning_result_rejects_unknown_grades_problem_numbers_and_long_feelings() {
    let app = test_app();
    import_learning_set_for_result(app.clone()).await;

    for payload in [
        json!({
            "grades": [{ "no": 1, "grade": "triangle" }],
            "feeling": ""
        }),
        json!({
            "grades": [{ "no": 99, "grade": "o" }],
            "feeling": ""
        }),
        json!({
            "grades": [{ "no": 1, "grade": "o" }],
            "feeling": "界".repeat(2001)
        }),
        json!({
            "grades": [{ "no": 1, "grade": "o", "answer": "界".repeat(501) }],
            "feeling": ""
        }),
    ] {
        let response = call_json(
            app.clone(),
            "POST",
            "/api/learning/sets/today/result",
            payload,
        )
        .await;
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        assert_eq!(json_body(response).await["error"]["code"], "bad_request");
    }

    let missing = call(app, "GET", "/api/learning/sets/today/result").await;
    assert_eq!(missing.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn learning_result_returns_not_found_without_a_set_or_a_recorded_result() {
    let app = test_app();

    let post_without_set = call_json(
        app.clone(),
        "POST",
        "/api/learning/sets/today/result",
        json!({
            "grades": [],
            "feeling": ""
        }),
    )
    .await;
    assert_eq!(post_without_set.status(), StatusCode::NOT_FOUND);
    assert_eq!(
        json_body(post_without_set).await["error"]["code"],
        "not_found"
    );

    import_learning_set_for_result(app.clone()).await;
    let get_without_result = call(app, "GET", "/api/learning/sets/today/result").await;
    assert_eq!(get_without_result.status(), StatusCode::NOT_FOUND);
    assert_eq!(get_without_result.headers()[CACHE_CONTROL], "no-store");
    assert_eq!(
        json_body(get_without_result).await["error"]["code"],
        "not_found"
    );
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

fn harness_batch(date: &str, slug: &str, verdict: &str) -> Value {
    let challenge = if verdict == "killed" {
        Value::Null
    } else {
        json!("weaken")
    };
    json!({
        "date": date,
        "kind": "daily",
        "proposals": [{
            "slug": slug,
            "insightName": format!("{slug} insight"),
            "verdict": verdict,
            "category": "⑥実験（新機軸）",
            "summary": format!("{slug} summary"),
            "challengeVerdict": challenge,
            "challengeNote": "条件を狭めれば成立する",
            "detailPath": format!("40_Projects/harness/判定/{date}-{slug}.md"),
            "detailMd": format!("# {slug}\n\n全文"),
        }],
    })
}

/// docs/specs/17-harness-approval.md §2〜§3.4 の HTTP 契約。
#[tokio::test]
async fn harness_round_trip_covers_both_query_modes_and_oldest_first_order() {
    let app = test_app();

    let current = call_json(
        app.clone(),
        "POST",
        "/api/harness/proposals",
        harness_batch("today", "current", "experiment"),
    )
    .await;
    assert_eq!(current.status(), StatusCode::OK);
    let current = json_body(current).await;
    assert_eq!(current["date"], "2026-07-25");
    assert!(current["receivedAt"].is_string());
    assert_eq!(current["proposals"][0]["kind"], "daily");
    assert_eq!(current["proposals"][0]["challengeVerdict"], "weaken");
    assert_eq!(
        current["proposals"][0]["challengeNote"],
        "条件を狭めれば成立する"
    );
    assert_eq!(current["proposals"][0]["applyState"], "pending");
    let current_id = current["proposals"][0]["id"]
        .as_i64()
        .expect("proposal id should be numeric");

    let listed = call(app.clone(), "GET", "/api/harness/proposals?date=2026-07-25").await;
    assert_eq!(listed.status(), StatusCode::OK);
    assert_eq!(json_body(listed).await, current);

    let older = call_json(
        app.clone(),
        "POST",
        "/api/harness/proposals",
        harness_batch("2026-07-24", "older", "adopt"),
    )
    .await;
    assert_eq!(older.status(), StatusCode::OK);
    let older_id = json_body(older).await["proposals"][0]["id"]
        .as_i64()
        .expect("older proposal id should be numeric");

    for id in [current_id, older_id] {
        let decision = call_json(
            app.clone(),
            "POST",
            &format!("/api/harness/proposals/{id}/decision"),
            json!({ "status": "approved" }),
        )
        .await;
        assert_eq!(decision.status(), StatusCode::OK);
        let decision = json_body(decision).await;
        assert_eq!(decision["proposal"]["status"], "approved");
        assert!(decision["proposal"]["decidedAt"].is_string());
    }

    let pending = call(
        app.clone(),
        "GET",
        "/api/harness/proposals?status=approved&applyState=pending",
    )
    .await;
    assert_eq!(pending.status(), StatusCode::OK);
    let pending = json_body(pending).await;
    assert_eq!(pending["proposals"][0]["id"], older_id);
    assert_eq!(pending["proposals"][1]["id"], current_id);

    let conflict = call_json(
        app.clone(),
        "POST",
        "/api/harness/proposals",
        harness_batch("today", "replacement", "adopt"),
    )
    .await;
    assert_eq!(conflict.status(), StatusCode::CONFLICT);
    assert_eq!(json_body(conflict).await["error"]["code"], "conflict");

    let applied = call_json(
        app.clone(),
        "POST",
        &format!("/api/harness/proposals/{older_id}/apply-result"),
        json!({
            "state": "applied",
            "snapshotPath": "40_Projects/harness/archive/2026-07-25-older/",
        }),
    )
    .await;
    assert_eq!(applied.status(), StatusCode::OK);
    let applied = json_body(applied).await;
    assert_eq!(applied["proposal"]["applyState"], "applied");
    assert_eq!(
        applied["proposal"]["snapshotPath"],
        "40_Projects/harness/archive/2026-07-25-older/"
    );
    assert_eq!(applied["proposal"]["error"], Value::Null);

    let pending_after_apply = json_body(
        call(
            app,
            "GET",
            "/api/harness/proposals?status=approved&applyState=pending",
        )
        .await,
    )
    .await;
    assert_eq!(
        pending_after_apply["proposals"].as_array().unwrap().len(),
        1
    );
    assert_eq!(pending_after_apply["proposals"][0]["id"], current_id);
}

#[tokio::test]
async fn harness_failed_query_lists_newest_first_and_drops_applied_retries() {
    let app = test_app();
    let mut ids = Vec::new();

    for (date, slug) in [
        ("2026-07-24", "oldest"),
        ("2026-07-26", "newest"),
        ("2026-07-25", "middle"),
    ] {
        let saved = call_json(
            app.clone(),
            "POST",
            "/api/harness/proposals",
            harness_batch(date, slug, "adopt"),
        )
        .await;
        assert_eq!(saved.status(), StatusCode::OK);
        let id = json_body(saved).await["proposals"][0]["id"]
            .as_i64()
            .expect("proposal id should be numeric");

        let decision = call_json(
            app.clone(),
            "POST",
            &format!("/api/harness/proposals/{id}/decision"),
            json!({ "status": "approved" }),
        )
        .await;
        assert_eq!(decision.status(), StatusCode::OK);

        let failed = call_json(
            app.clone(),
            "POST",
            &format!("/api/harness/proposals/{id}/apply-result"),
            json!({ "state": "failed", "error": format!("{slug} failed") }),
        )
        .await;
        assert_eq!(failed.status(), StatusCode::OK);
        ids.push((slug, id));
    }

    let failed = call(
        app.clone(),
        "GET",
        "/api/harness/proposals?applyState=failed",
    )
    .await;
    assert_eq!(failed.status(), StatusCode::OK);
    let failed = json_body(failed).await;
    assert_eq!(
        failed["proposals"]
            .as_array()
            .expect("proposals should be an array")
            .iter()
            .map(|proposal| proposal["slug"].as_str().expect("slug should be a string"))
            .collect::<Vec<_>>(),
        vec!["newest", "middle", "oldest"]
    );

    let middle_id = ids
        .iter()
        .find_map(|(slug, id)| (*slug == "middle").then_some(*id))
        .expect("middle id should exist");
    let applied = call_json(
        app.clone(),
        "POST",
        &format!("/api/harness/proposals/{middle_id}/apply-result"),
        json!({
            "state": "applied",
            "snapshotPath": "40_Projects/harness/archive/2026-07-26-middle/",
        }),
    )
    .await;
    assert_eq!(applied.status(), StatusCode::OK);

    let remaining =
        json_body(call(app, "GET", "/api/harness/proposals?applyState=failed").await).await;
    assert_eq!(
        remaining["proposals"]
            .as_array()
            .expect("proposals should be an array")
            .iter()
            .map(|proposal| proposal["slug"].as_str().expect("slug should be a string"))
            .collect::<Vec<_>>(),
        vec!["newest", "oldest"]
    );
}

/// docs/specs/17-harness-approval.md §3.5・§6 の 200/400/404 契約。
#[tokio::test]
async fn harness_missing_day_and_error_table_are_mapped_at_http_boundary() {
    let app = test_app();

    let missing = call(app.clone(), "GET", "/api/harness/proposals?date=today").await;
    assert_eq!(missing.status(), StatusCode::OK);
    assert_eq!(
        json_body(missing).await,
        json!({
            "date": "2026-07-25",
            "receivedAt": null,
            "proposals": [],
        })
    );

    let default_today = call(app.clone(), "GET", "/api/harness/proposals").await;
    assert_eq!(default_today.status(), StatusCode::OK);
    assert_eq!(json_body(default_today).await["receivedAt"], Value::Null);

    let bad_body = call_json(
        app.clone(),
        "POST",
        "/api/harness/proposals",
        harness_batch("not-a-date", "invalid", "adopt"),
    )
    .await;
    assert_eq!(bad_body.status(), StatusCode::BAD_REQUEST);
    assert_eq!(json_body(bad_body).await["error"]["code"], "bad_request");

    let bad_query = call(app.clone(), "GET", "/api/harness/proposals?status=approved").await;
    assert_eq!(bad_query.status(), StatusCode::BAD_REQUEST);
    assert_eq!(json_body(bad_query).await["error"]["code"], "bad_request");

    for path in [
        "/api/harness/proposals/999/decision",
        "/api/harness/proposals/999/apply-result",
    ] {
        let body = if path.ends_with("decision") {
            json!({ "status": "approved" })
        } else {
            json!({ "state": "applied" })
        };
        let missing_id = call_json(app.clone(), "POST", path, body).await;
        assert_eq!(missing_id.status(), StatusCode::NOT_FOUND);
        assert_eq!(json_body(missing_id).await["error"]["code"], "not_found");
    }

    let killed = call_json(
        app.clone(),
        "POST",
        "/api/harness/proposals",
        harness_batch("today", "killed", "killed"),
    )
    .await;
    assert_eq!(killed.status(), StatusCode::OK);
    let killed_id = json_body(killed).await["proposals"][0]["id"]
        .as_i64()
        .expect("killed proposal id should be numeric");
    let invalid_transition = call_json(
        app,
        "POST",
        &format!("/api/harness/proposals/{killed_id}/decision"),
        json!({ "status": "approved" }),
    )
    .await;
    assert_eq!(invalid_transition.status(), StatusCode::BAD_REQUEST);
    assert_eq!(
        json_body(invalid_transition).await["error"]["code"],
        "bad_request"
    );
}

fn intake_batch(date: &str, items: Value) -> Value {
    json!({"date":date,"sourcePath":format!("90_Meta/daily_intake/{date}.md"),"sourceNote":format!("01_Daily/{date}.md"),"items":items})
}

#[tokio::test]
async fn intake_round_trip_empty_receipt_ordering_and_apply_retry() {
    let app = test_app();
    let initial = call(app.clone(), "GET", "/api/intake/candidates?status=proposed").await;
    assert_eq!(initial.status(), StatusCode::OK);
    let initial = json_body(initial).await;
    assert_eq!(
        initial,
        json!({"items":[],"latestDate":null,"latestReceivedAt":null,"latestItemCount":null})
    );

    let empty = call_json(
        app.clone(),
        "POST",
        "/api/intake/candidates",
        intake_batch("2026-08-27", json!([])),
    )
    .await;
    assert_eq!(empty.status(), StatusCode::OK);
    assert_eq!(json_body(empty).await["itemCount"], 0);
    let after_empty =
        json_body(call(app.clone(), "GET", "/api/intake/candidates?status=proposed").await).await;
    assert_eq!(after_empty["latestDate"], "2026-08-27");
    assert_eq!(after_empty["latestItemCount"], 0);

    let older = call_json(
        app.clone(),
        "POST",
        "/api/intake/candidates",
        intake_batch(
            "2026-08-28",
            json!([{"lane":"thought","text":"older thought","note":"opaque note","lineNo":12}]),
        ),
    )
    .await;
    assert_eq!(older.status(), StatusCode::OK);
    let older = json_body(older).await;
    let older_id = older["items"][0]["id"].as_i64().unwrap();
    assert_eq!(
        older["items"][0]["slug"],
        crate::domain::intake::compute_slug(
            "2026-08-28",
            crate::domain::intake::IntakeLane::Thought,
            "older thought"
        )
    );
    assert_eq!(
        older["items"][0]["sourcePath"],
        "90_Meta/daily_intake/2026-08-28.md"
    );
    let newer = call_json(
        app.clone(),
        "POST",
        "/api/intake/candidates",
        intake_batch("2026-08-29", json!([{"lane":"todo","text":"newer todo"}])),
    )
    .await;
    let newer_id = json_body(newer).await["items"][0]["id"].as_i64().unwrap();
    let proposed =
        json_body(call(app.clone(), "GET", "/api/intake/candidates?status=proposed").await).await;
    assert_eq!(proposed["items"][0]["id"], newer_id);
    assert_eq!(proposed["items"][1]["id"], older_id);

    for id in [newer_id, older_id] {
        let response = call_json(
            app.clone(),
            "POST",
            &format!("/api/intake/candidates/{id}/decision"),
            json!({"status":"approved"}),
        )
        .await;
        assert_eq!(response.status(), StatusCode::OK);
    }
    let pending = json_body(
        call(
            app.clone(),
            "GET",
            "/api/intake/candidates?status=approved&applyState=pending",
        )
        .await,
    )
    .await;
    assert_eq!(pending["items"][0]["id"], older_id);
    assert_eq!(pending["items"][1]["id"], newer_id);
    let failed=call_json(app.clone(),"POST",&format!("/api/intake/candidates/{older_id}/apply-result"),json!({"state":"failed","error":"not found","resultPath":"opaque/path.md","resultUrl":"https://linear.example/ABC-1"})).await;
    assert_eq!(failed.status(), StatusCode::OK);
    let failed = json_body(failed).await;
    assert_eq!(failed["item"]["applyState"], "failed");
    assert_eq!(failed["item"]["resultUrl"], "https://linear.example/ABC-1");
    let failed_list = json_body(
        call(
            app.clone(),
            "GET",
            "/api/intake/candidates?applyState=failed",
        )
        .await,
    )
    .await;
    assert_eq!(failed_list["items"][0]["id"], older_id);
    let applied = call_json(
        app.clone(),
        "POST",
        &format!("/api/intake/candidates/{older_id}/apply-result"),
        json!({"state":"applied","resultPath":"opaque/final.md"}),
    )
    .await;
    assert_eq!(applied.status(), StatusCode::OK);
    let applied = json_body(applied).await;
    assert_eq!(applied["item"]["applyState"], "applied");
    assert_eq!(applied["item"]["error"], Value::Null);
    assert!(json_body(call(app,"GET","/api/intake/candidates?applyState=failed").await).await["items"].as_array().unwrap().is_empty());
}

#[tokio::test]
async fn intake_replacement_guards_and_http_errors() {
    let app = test_app();
    let first = call_json(
        app.clone(),
        "POST",
        "/api/intake/candidates",
        intake_batch("today", json!([{"lane":"tone","text":"one"}])),
    )
    .await;
    let _original_id = json_body(first).await["items"][0]["id"].as_i64().unwrap();
    let replacement = call_json(
        app.clone(),
        "POST",
        "/api/intake/candidates",
        intake_batch("today", json!([{"lane":"tone","text":"two"}])),
    )
    .await;
    assert_eq!(replacement.status(), StatusCode::OK);
    let id = json_body(replacement).await["items"][0]["id"]
        .as_i64()
        .unwrap();
    assert_ne!(id, 0);
    assert_eq!(
        call_json(
            app.clone(),
            "POST",
            &format!("/api/intake/candidates/{id}/decision"),
            json!({"status":"rejected"})
        )
        .await
        .status(),
        StatusCode::OK
    );
    assert_eq!(
        call_json(
            app.clone(),
            "POST",
            "/api/intake/candidates",
            intake_batch("today", json!([]))
        )
        .await
        .status(),
        StatusCode::CONFLICT
    );
    assert_eq!(
        call_json(
            app.clone(),
            "POST",
            "/api/intake/candidates/99999/decision",
            json!({"status":"approved"})
        )
        .await
        .status(),
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        call_json(
            app.clone(),
            "POST",
            &format!("/api/intake/candidates/{id}/apply-result"),
            json!({"state":"applied"})
        )
        .await
        .status(),
        StatusCode::BAD_REQUEST
    );
    for uri in [
        "/api/intake/candidates",
        "/api/intake/candidates?date=today",
        "/api/intake/candidates?status=approved",
        "/api/intake/candidates?applyState=pending",
        "/api/intake/candidates?status=bad",
    ] {
        assert_eq!(
            call(app.clone(), "GET", uri).await.status(),
            StatusCode::BAD_REQUEST,
            "{uri}"
        );
    }
    assert_eq!(
        call_json(
            app,
            "POST",
            "/api/intake/candidates",
            intake_batch("bad", json!([]))
        )
        .await
        .status(),
        StatusCode::BAD_REQUEST
    );
}

/// docs/specs/03-api.md §3 の一覧クエリ許可形。
#[tokio::test]
async fn harness_list_rejects_unknown_and_mixed_query_parameters() {
    let app = test_app();

    for path in [
        "/api/harness/proposals?date=today&foo=bar",
        "/api/harness/proposals?status=approved&aplyState=pending",
        "/api/harness/proposals?date=today&status=approved&applyState=pending",
        "/api/harness/proposals?date=today&applyState=failed",
        "/api/harness/proposals?status=approved&applyState=failed",
        "/api/harness/proposals?applyState=pending",
        "/api/harness/proposals?applyState=applied",
    ] {
        let response = call(app.clone(), "GET", path).await;
        assert_eq!(response.status(), StatusCode::BAD_REQUEST, "{path}");
        let body = json_body(response).await;
        assert_eq!(body["error"]["code"], "bad_request", "{path}");
        assert!(
            body["error"]["message"]
                .as_str()
                .is_some_and(|message| !message.is_empty()),
            "{path}"
        );
    }
}
