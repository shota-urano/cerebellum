use std::sync::Arc;

use thiserror::Error;

use crate::domain::routine::{RoutineFields, RoutineRow, parse_rows};

use super::ports::{
    Clock, RoutineImportRepository, RoutineImportRepositoryError, VaultReader, VaultReaderError,
};

pub struct ImportRoutines {
    vault_reader: Arc<dyn VaultReader>,
}

impl ImportRoutines {
    pub fn new(vault_reader: Arc<dyn VaultReader>) -> Self {
        Self { vault_reader }
    }

    pub fn preview(&self) -> Result<Vec<RoutineRow>, ImportRoutinesError> {
        let markdown = self
            .vault_reader
            .read_routine_markdown()
            .map_err(ImportRoutinesError::VaultUnavailable)?;
        let rows = parse_rows(&markdown);
        if rows.is_empty() {
            return Err(ImportRoutinesError::NoRows);
        }
        Ok(rows)
    }

    pub fn execute(
        &self,
        repository: &dyn RoutineImportRepository,
        clock: &dyn Clock,
        force: bool,
    ) -> Result<Vec<RoutineRow>, ImportRoutinesError> {
        let rows = self.preview()?;
        self.import_prepared(rows, repository, clock, force)
    }

    pub(crate) fn import_prepared(
        &self,
        rows: Vec<RoutineRow>,
        repository: &dyn RoutineImportRepository,
        clock: &dyn Clock,
        force: bool,
    ) -> Result<Vec<RoutineRow>, ImportRoutinesError> {
        let active_count = repository
            .count_active_routines()
            .map_err(import_repository_error)?;
        if active_count > 0 && !force {
            return Err(ImportRoutinesError::ActiveRoutinesExist {
                count: active_count,
            });
        }

        let fields = rows
            .iter()
            .map(|row| RoutineFields {
                interval: row.interval.clone(),
                time: row.time.clone(),
                effort: row.effort.clone(),
                tool: row.tool.clone(),
                content: row.content.clone(),
                // md には詳細リンクの概念が無い。移行後に画面から設定する
                detail_ref: None,
            })
            .collect::<Vec<_>>();
        repository
            .import_routines(&fields, &clock.now().to_rfc3339(), force)
            .map_err(import_repository_error)?;
        Ok(rows)
    }
}

fn import_repository_error(error: RoutineImportRepositoryError) -> ImportRoutinesError {
    match error {
        RoutineImportRepositoryError::ActiveRoutinesExist { count } => {
            ImportRoutinesError::ActiveRoutinesExist { count }
        }
        error @ RoutineImportRepositoryError::Internal { .. } => {
            ImportRoutinesError::Repository(error)
        }
    }
}

#[derive(Debug, Error)]
pub enum ImportRoutinesError {
    #[error("failed to read routine markdown from the vault")]
    VaultUnavailable(#[source] VaultReaderError),
    #[error("routine markdown contains no importable rows")]
    NoRows,
    #[error("{count} active routines already exist; use --force to replace them")]
    ActiveRoutinesExist { count: usize },
    #[error("failed to import routines")]
    Repository(#[source] RoutineImportRepositoryError),
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use chrono::{DateTime, FixedOffset};

    use super::{ImportRoutines, ImportRoutinesError};
    use crate::{
        domain::routine::RoutineFields,
        usecase::ports::{
            Clock, RoutineImportRepository, RoutineImportRepositoryError, VaultReader,
            VaultReaderError,
        },
    };

    struct FakeVaultReader {
        markdown: Option<String>,
    }

    impl VaultReader for FakeVaultReader {
        fn read_routine_markdown(&self) -> Result<String, VaultReaderError> {
            self.markdown.clone().ok_or_else(|| {
                VaultReaderError::new(std::io::Error::other("routine markdown is unavailable"))
            })
        }
    }

    struct FakeClock;

    impl Clock for FakeClock {
        fn now(&self) -> DateTime<FixedOffset> {
            DateTime::parse_from_rfc3339("2026-07-27T09:00:00+09:00")
                .expect("fixed timestamp should parse")
        }
    }

    struct FakeImportRepository {
        active_count: usize,
        import: Mutex<Option<(Vec<RoutineFields>, String, bool)>>,
    }

    impl FakeImportRepository {
        fn new(active_count: usize) -> Self {
            Self {
                active_count,
                import: Mutex::new(None),
            }
        }
    }

    impl RoutineImportRepository for FakeImportRepository {
        fn count_active_routines(&self) -> Result<usize, RoutineImportRepositoryError> {
            Ok(self.active_count)
        }

        fn import_routines(
            &self,
            routines: &[RoutineFields],
            timestamp: &str,
            force: bool,
        ) -> Result<usize, RoutineImportRepositoryError> {
            *self.import.lock().expect("import lock should be available") =
                Some((routines.to_vec(), timestamp.to_owned(), force));
            Ok(routines.len())
        }
    }

    fn usecase(markdown: Option<&str>) -> ImportRoutines {
        ImportRoutines::new(Arc::new(FakeVaultReader {
            markdown: markdown.map(str::to_owned),
        }))
    }

    #[test]
    fn preview_reuses_domain_parser_and_preserves_table_order() {
        let import = usecase(Some(
            r#"
| 間隔 | 時間 | 実施 | 確認ツール | 内容 |
| --- | --- | --- | --- | --- |
| 毎日 | 7:30 | | slack \| obsidian | 先頭<br>続き |
| 土曜 | | 1時間 | | 次 |
"#,
        ));

        let rows = import.preview().expect("preview should parse");

        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].tool, "slack | obsidian");
        assert_eq!(rows[0].content, "先頭 / 続き");
        assert_eq!(rows[1].interval, "土曜");
    }

    #[test]
    fn empty_or_unreadable_markdown_fails_before_database_access() {
        assert!(matches!(
            usecase(Some("# no table")).preview(),
            Err(ImportRoutinesError::NoRows)
        ));
        assert!(matches!(
            usecase(None).preview(),
            Err(ImportRoutinesError::VaultUnavailable(_))
        ));
    }

    #[test]
    fn existing_active_routines_stop_import_without_force() {
        let import = usecase(Some("| 毎日 | 7:30 | | slack | 対象 |"));
        let repository = FakeImportRepository::new(2);

        assert!(matches!(
            import.execute(&repository, &FakeClock, false),
            Err(ImportRoutinesError::ActiveRoutinesExist { count: 2 })
        ));
        assert!(
            repository
                .import
                .lock()
                .expect("import lock should be available")
                .is_none()
        );
    }

    #[test]
    fn force_imports_all_rows_with_one_timestamp() {
        let import = usecase(Some(
            "| 毎日 | 7:30 | | slack | 先頭 |\n| 土曜 | | 1時間 | | 次 |",
        ));
        let repository = FakeImportRepository::new(1);

        let rows = import
            .execute(&repository, &FakeClock, true)
            .expect("forced import should succeed");
        let stored = repository
            .import
            .lock()
            .expect("import lock should be available")
            .clone()
            .expect("repository should receive the import");

        assert_eq!(rows.len(), 2);
        assert_eq!(
            stored
                .0
                .iter()
                .map(|row| row.content.as_str())
                .collect::<Vec<_>>(),
            vec!["先頭", "次"]
        );
        assert_eq!(stored.1, "2026-07-27T09:00:00+09:00");
        assert!(stored.2);
    }
}
