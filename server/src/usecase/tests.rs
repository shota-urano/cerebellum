use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};

use chrono::{DateTime, FixedOffset};

use crate::domain::{
    day::SummaryDay,
    task::{CheckedTask, Task},
};

use super::{
    get_day::GetDay,
    get_summary::GetSummary,
    ports::{Clock, RepositoryError, TaskRepository, VaultReader, VaultReaderError},
    toggle_check::ToggleCheck,
};

struct FakeClock {
    now: DateTime<FixedOffset>,
}

impl Clock for FakeClock {
    fn now(&self) -> DateTime<FixedOffset> {
        self.now
    }
}

#[derive(Default)]
struct InMemoryRepo {
    days: Mutex<HashMap<String, Vec<String>>>,
}

impl TaskRepository for InMemoryRepo {
    fn health_check(&self) -> Result<(), RepositoryError> {
        drop(
            self.days
                .lock()
                .expect("in-memory repository lock should be available"),
        );
        Ok(())
    }

    fn snapshot_exists(&self, date: &str) -> Result<bool, RepositoryError> {
        Ok(self
            .days
            .lock()
            .expect("in-memory repository lock should be available")
            .contains_key(date))
    }

    fn insert_snapshot(&self, date: &str, tasks: &[Task]) -> Result<(), RepositoryError> {
        self.days
            .lock()
            .expect("in-memory repository lock should be available")
            .entry(date.to_owned())
            .or_insert_with(|| tasks.iter().map(|task| task.id.clone()).collect());
        Ok(())
    }

    fn get_tasks(&self, _date: &str) -> Result<Vec<CheckedTask>, RepositoryError> {
        Ok(Vec::new())
    }

    fn toggle_check(
        &self,
        _date: &str,
        _task_id: &str,
        _checked_at: DateTime<FixedOffset>,
    ) -> Result<(), RepositoryError> {
        Ok(())
    }

    fn get_summary(
        &self,
        _start_date: &str,
        _end_date: &str,
    ) -> Result<Vec<SummaryDay>, RepositoryError> {
        Ok(Vec::new())
    }
}

struct FakeVaultReader;

impl VaultReader for FakeVaultReader {
    fn read_routine_markdown(&self) -> Result<String, VaultReaderError> {
        Ok(String::new())
    }
}

#[test]
fn usecases_accept_handwritten_port_fakes() {
    let vault: Arc<dyn VaultReader> = Arc::new(FakeVaultReader);
    let repository: Arc<dyn TaskRepository> = Arc::new(InMemoryRepo::default());
    let clock: Arc<dyn Clock> = Arc::new(FakeClock {
        now: DateTime::parse_from_rfc3339("2026-07-25T08:01:00+09:00")
            .expect("fixed test time should parse"),
    });

    assert_eq!(
        vault
            .read_routine_markdown()
            .expect("fake vault should be readable"),
        ""
    );
    repository
        .health_check()
        .expect("in-memory repository should be healthy");
    assert_eq!(clock.now().to_rfc3339(), "2026-07-25T08:01:00+09:00");

    let get_day = GetDay::new(
        Arc::clone(&vault),
        Arc::clone(&repository),
        Arc::clone(&clock),
    );
    let toggle_check = ToggleCheck::new(vault, Arc::clone(&repository), Arc::clone(&clock));
    let get_summary = GetSummary::new(repository, clock);

    let _ = get_day.dependencies();
    let _ = toggle_check.dependencies();
    let _ = get_summary.dependencies();
}
