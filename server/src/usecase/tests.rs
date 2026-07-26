use std::{
    collections::{BTreeMap, HashMap},
    sync::{
        Arc, Mutex,
        atomic::{AtomicUsize, Ordering},
    },
};

use chrono::{DateTime, FixedOffset};

use crate::domain::{
    day::SummaryDay,
    task::{CheckedTask, Task, task_id},
};

use super::{
    error::UsecaseError,
    get_day::GetDay,
    get_summary::GetSummary,
    ports::{Clock, RepositoryError, TaskRepository, VaultReader, VaultReaderError},
    toggle_check::ToggleCheck,
};

const ROUTINE_MARKDOWN: &str = r#"
| 間隔 | 時間 | 実施 | 確認ツール | 内容 |
| --- | --- | --- | --- | --- |
| 毎日 | 8:30 | 10分 | slack | daily later |
| 日曜 | 6:00 | | obsidian | sunday only |
| 毎日 | 7:30 | | slack | daily earlier |
| 土曜 | 6:30 | | obsidian | saturday only |
"#;

struct FakeClock {
    now: DateTime<FixedOffset>,
}

impl Clock for FakeClock {
    fn now(&self) -> DateTime<FixedOffset> {
        self.now
    }
}

struct FakeVaultReader {
    markdown: Option<String>,
    read_count: AtomicUsize,
}

impl FakeVaultReader {
    fn readable(markdown: &str) -> Self {
        Self {
            markdown: Some(markdown.to_owned()),
            read_count: AtomicUsize::new(0),
        }
    }

    fn unavailable() -> Self {
        Self {
            markdown: None,
            read_count: AtomicUsize::new(0),
        }
    }

    fn read_count(&self) -> usize {
        self.read_count.load(Ordering::SeqCst)
    }
}

impl VaultReader for FakeVaultReader {
    fn read_routine_markdown(&self) -> Result<String, VaultReaderError> {
        self.read_count.fetch_add(1, Ordering::SeqCst);
        self.markdown.clone().ok_or_else(|| {
            VaultReaderError::new(std::io::Error::other("routine markdown is unavailable"))
        })
    }
}

#[derive(Default)]
struct RepoState {
    days: BTreeMap<String, Vec<Task>>,
    checks: HashMap<(String, String), (bool, String)>,
    insert_count: usize,
    toggle_count: usize,
}

#[derive(Default)]
struct InMemoryRepo {
    state: Mutex<RepoState>,
}

impl InMemoryRepo {
    fn snapshot(&self, date: &str) -> Option<Vec<Task>> {
        self.state
            .lock()
            .expect("in-memory repository lock should be available")
            .days
            .get(date)
            .cloned()
    }

    fn insert_count(&self) -> usize {
        self.state
            .lock()
            .expect("in-memory repository lock should be available")
            .insert_count
    }

    fn toggle_count(&self) -> usize {
        self.state
            .lock()
            .expect("in-memory repository lock should be available")
            .toggle_count
    }
}

impl TaskRepository for InMemoryRepo {
    fn health_check(&self) -> Result<(), RepositoryError> {
        drop(
            self.state
                .lock()
                .expect("in-memory repository lock should be available"),
        );
        Ok(())
    }

    fn snapshot_exists(&self, date: &str) -> Result<bool, RepositoryError> {
        Ok(self
            .state
            .lock()
            .expect("in-memory repository lock should be available")
            .days
            .contains_key(date))
    }

    fn insert_snapshot(&self, date: &str, tasks: &[Task]) -> Result<(), RepositoryError> {
        let mut state = self
            .state
            .lock()
            .expect("in-memory repository lock should be available");
        state.insert_count += 1;
        state
            .days
            .entry(date.to_owned())
            .or_insert_with(|| tasks.to_vec());
        Ok(())
    }

    fn get_tasks(&self, date: &str) -> Result<Vec<CheckedTask>, RepositoryError> {
        let state = self
            .state
            .lock()
            .expect("in-memory repository lock should be available");
        Ok(state
            .days
            .get(date)
            .into_iter()
            .flatten()
            .map(|task| {
                let check = state.checks.get(&(date.to_owned(), task.id.clone()));
                CheckedTask {
                    task: task.clone(),
                    done: check.is_some_and(|(done, _)| *done),
                    checked_at: check.map(|(_, checked_at)| checked_at.clone()),
                }
            })
            .collect())
    }

    fn toggle_check(
        &self,
        date: &str,
        task_id: &str,
        checked_at: DateTime<FixedOffset>,
    ) -> Result<(), RepositoryError> {
        let mut state = self
            .state
            .lock()
            .expect("in-memory repository lock should be available");
        state.toggle_count += 1;
        let check = state
            .checks
            .entry((date.to_owned(), task_id.to_owned()))
            .or_insert((false, String::new()));
        check.0 = !check.0;
        check.1 = checked_at.to_rfc3339();
        Ok(())
    }

    fn get_summary(
        &self,
        start_date: &str,
        end_date: &str,
    ) -> Result<Vec<SummaryDay>, RepositoryError> {
        let state = self
            .state
            .lock()
            .expect("in-memory repository lock should be available");
        Ok(state
            .days
            .iter()
            .rev()
            .filter(|(date, _)| date.as_str() >= start_date && date.as_str() <= end_date)
            .map(|(date, tasks)| SummaryDay {
                date: date.clone(),
                done: tasks
                    .iter()
                    .filter(|task| {
                        state
                            .checks
                            .get(&(date.clone(), task.id.clone()))
                            .is_some_and(|(done, _)| *done)
                    })
                    .count(),
                total: tasks.len(),
            })
            .collect())
    }
}

fn clock(now: &str) -> Arc<dyn Clock> {
    Arc::new(FakeClock {
        now: DateTime::parse_from_rfc3339(now).expect("fixed test time should parse"),
    })
}

fn task(id: &str, sort_no: usize) -> Task {
    Task {
        id: id.to_owned(),
        interval: "毎日".to_owned(),
        time: format!("{}:00", sort_no + 7),
        effort: String::new(),
        tool: "slack".to_owned(),
        content: id.to_owned(),
        sort_no,
    }
}

#[test]
fn today_uses_the_local_midnight_boundary_and_correct_weekday() {
    let vault = Arc::new(FakeVaultReader::readable(ROUTINE_MARKDOWN));
    let repository = Arc::new(InMemoryRepo::default());
    let before_midnight = GetDay::new(
        vault.clone(),
        repository.clone(),
        clock("2026-07-25T23:59:59+09:00"),
    );
    let after_midnight = GetDay::new(vault, repository, clock("2026-07-26T00:00:00+09:00"));

    let saturday = before_midnight
        .execute("today")
        .expect("Saturday snapshot should load");
    let sunday = after_midnight
        .execute("today")
        .expect("Sunday snapshot should load");

    assert_eq!(
        (saturday.date.as_str(), saturday.weekday),
        ("2026-07-25", '土')
    );
    assert_eq!((sunday.date.as_str(), sunday.weekday), ("2026-07-26", '日'));
    assert!(
        saturday
            .tasks
            .iter()
            .any(|task| task.task.content == "saturday only")
    );
    assert!(
        !saturday
            .tasks
            .iter()
            .any(|task| task.task.content == "sunday only")
    );
    assert!(
        sunday
            .tasks
            .iter()
            .any(|task| task.task.content == "sunday only")
    );
    assert!(
        !sunday
            .tasks
            .iter()
            .any(|task| task.task.content == "saturday only")
    );
}

#[test]
fn get_day_ensures_the_today_snapshot_once_with_fixed_sort_numbers() {
    let vault = Arc::new(FakeVaultReader::readable(ROUTINE_MARKDOWN));
    let repository = Arc::new(InMemoryRepo::default());
    let usecase = GetDay::new(
        vault.clone(),
        repository.clone(),
        clock("2026-07-25T08:01:00+09:00"),
    );

    let first = usecase
        .execute("today")
        .expect("first snapshot request should succeed");
    let second = usecase
        .execute("2026-07-25")
        .expect("repeated snapshot request should succeed");

    assert_eq!(first, second);
    assert!(!first.readonly);
    assert_eq!(first.progress.done, 0);
    assert_eq!(first.progress.total, 3);
    assert_eq!(
        first
            .tasks
            .iter()
            .map(|task| (task.task.content.as_str(), task.task.sort_no))
            .collect::<Vec<_>>(),
        vec![
            ("saturday only", 0),
            ("daily earlier", 1),
            ("daily later", 2),
        ]
    );
    assert_eq!(vault.read_count(), 1);
    assert_eq!(repository.insert_count(), 1);
}

#[test]
fn past_and_future_days_are_readonly_and_are_never_ensured() {
    let vault = Arc::new(FakeVaultReader::readable(ROUTINE_MARKDOWN));
    let repository = Arc::new(InMemoryRepo::default());
    let usecase = GetDay::new(
        vault.clone(),
        repository.clone(),
        clock("2026-07-25T08:01:00+09:00"),
    );

    for date in ["2026-07-24", "2026-07-26"] {
        let snapshot = usecase
            .execute(date)
            .expect("recordless non-today day should return an empty snapshot");
        assert_eq!(snapshot.date, date);
        assert!(snapshot.readonly);
        assert_eq!(snapshot.progress.done, 0);
        assert_eq!(snapshot.progress.total, 0);
        assert!(snapshot.tasks.is_empty());
    }

    assert_eq!(vault.read_count(), 0);
    assert_eq!(repository.insert_count(), 0);
}

#[test]
fn get_day_rejects_dates_outside_the_exact_calendar_format() {
    let vault = Arc::new(FakeVaultReader::readable(ROUTINE_MARKDOWN));
    let repository = Arc::new(InMemoryRepo::default());
    let usecase = GetDay::new(vault, repository, clock("2026-07-25T08:01:00+09:00"));

    for date in ["2026-7-25", "2026-02-30", "tomorrow"] {
        assert!(matches!(
            usecase.execute(date),
            Err(UsecaseError::BadRequest(_))
        ));
    }
}

#[test]
fn vault_failure_does_not_create_a_partial_snapshot() {
    let vault = Arc::new(FakeVaultReader::unavailable());
    let repository = Arc::new(InMemoryRepo::default());
    let usecase = GetDay::new(
        vault.clone(),
        repository.clone(),
        clock("2026-07-25T08:01:00+09:00"),
    );

    assert!(matches!(
        usecase.execute("today"),
        Err(UsecaseError::VaultUnavailable(_))
    ));
    assert_eq!(vault.read_count(), 1);
    assert_eq!(repository.insert_count(), 0);
    assert!(repository.snapshot("2026-07-25").is_none());
}

#[test]
fn toggle_ensures_today_first_then_flips_and_returns_the_day_shape() {
    let vault = Arc::new(FakeVaultReader::readable(ROUTINE_MARKDOWN));
    let repository = Arc::new(InMemoryRepo::default());
    let usecase = ToggleCheck::new(
        vault.clone(),
        repository.clone(),
        clock("2026-07-25T08:01:00+09:00"),
    );
    let id = task_id("毎日", "7:30", "daily earlier");

    let checked = usecase
        .execute("today", &id)
        .expect("first toggle should ensure and check the task");
    let checked_task = checked
        .tasks
        .iter()
        .find(|task| task.task.id == id)
        .expect("checked task should be returned");
    assert!(checked_task.done);
    assert_eq!(
        checked_task.checked_at.as_deref(),
        Some("2026-07-25T08:01:00+09:00")
    );
    assert_eq!(checked.progress.done, 1);
    assert_eq!(checked.progress.total, 3);
    assert!(!checked.readonly);
    assert_eq!(vault.read_count(), 1);
    assert_eq!(repository.insert_count(), 1);

    let unchecked = usecase
        .execute("2026-07-25", &id)
        .expect("second toggle should uncheck the task");
    assert!(
        !unchecked
            .tasks
            .iter()
            .find(|task| task.task.id == id)
            .unwrap()
            .done
    );
    assert_eq!(unchecked.progress.done, 0);
    assert_eq!(vault.read_count(), 1);
    assert_eq!(repository.insert_count(), 1);
    assert_eq!(repository.toggle_count(), 2);
}

#[test]
fn toggle_rejects_non_today_days_before_ensure() {
    let vault = Arc::new(FakeVaultReader::readable(ROUTINE_MARKDOWN));
    let repository = Arc::new(InMemoryRepo::default());
    let usecase = ToggleCheck::new(
        vault.clone(),
        repository.clone(),
        clock("2026-07-25T08:01:00+09:00"),
    );

    for date in ["2026-07-24", "2026-07-26"] {
        assert!(matches!(
            usecase.execute(date, "any-task"),
            Err(UsecaseError::ReadonlyDay(_))
        ));
    }
    assert_eq!(vault.read_count(), 0);
    assert_eq!(repository.insert_count(), 0);
    assert_eq!(repository.toggle_count(), 0);
}

#[test]
fn toggle_returns_not_found_for_a_task_outside_todays_snapshot() {
    let vault = Arc::new(FakeVaultReader::readable(ROUTINE_MARKDOWN));
    let repository = Arc::new(InMemoryRepo::default());
    let usecase = ToggleCheck::new(
        vault,
        repository.clone(),
        clock("2026-07-25T08:01:00+09:00"),
    );

    assert!(matches!(
        usecase.execute("today", "unknown"),
        Err(UsecaseError::NotFound(task_id)) if task_id == "unknown"
    ));
    assert_eq!(repository.insert_count(), 1);
    assert_eq!(repository.toggle_count(), 0);
}

#[test]
fn summary_defaults_to_seven_days_filters_the_range_and_sorts_dates() {
    let repository = Arc::new(InMemoryRepo::default());
    for (date, tasks) in [
        ("2026-07-18", vec![task("outside", 0)]),
        ("2026-07-19", vec![task("first", 0)]),
        ("2026-07-24", vec![task("second-a", 0), task("second-b", 1)]),
        ("2026-07-25", vec![task("third", 0)]),
    ] {
        repository
            .insert_snapshot(date, &tasks)
            .expect("test snapshot should insert");
    }
    repository
        .toggle_check(
            "2026-07-24",
            "second-a",
            DateTime::parse_from_rfc3339("2026-07-24T08:01:00+09:00")
                .expect("test timestamp should parse"),
        )
        .expect("test check should toggle");
    let usecase = GetSummary::new(repository, clock("2026-07-25T08:01:00+09:00"));

    assert_eq!(
        usecase.execute(None).expect("default summary should load"),
        vec![
            SummaryDay {
                date: "2026-07-19".to_owned(),
                done: 0,
                total: 1,
            },
            SummaryDay {
                date: "2026-07-24".to_owned(),
                done: 1,
                total: 2,
            },
            SummaryDay {
                date: "2026-07-25".to_owned(),
                done: 0,
                total: 1,
            },
        ]
    );
}

#[test]
fn summary_rejects_zero_and_values_above_the_limit() {
    let repository = Arc::new(InMemoryRepo::default());
    let usecase = GetSummary::new(repository, clock("2026-07-25T08:01:00+09:00"));

    assert!(matches!(
        usecase.execute(Some(0)),
        Err(UsecaseError::BadRequest(_))
    ));
    assert!(matches!(
        usecase.execute(Some(367)),
        Err(UsecaseError::BadRequest(_))
    ));
}
