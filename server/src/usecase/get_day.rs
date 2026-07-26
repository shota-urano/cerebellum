use std::sync::Arc;

use super::ports::{Clock, TaskRepository, VaultReader};

pub type GetDayDependencies<'a> = (
    &'a Arc<dyn VaultReader>,
    &'a Arc<dyn TaskRepository>,
    &'a Arc<dyn Clock>,
);

pub struct GetDay {
    vault_reader: Arc<dyn VaultReader>,
    task_repository: Arc<dyn TaskRepository>,
    clock: Arc<dyn Clock>,
}

impl GetDay {
    pub fn new(
        vault_reader: Arc<dyn VaultReader>,
        task_repository: Arc<dyn TaskRepository>,
        clock: Arc<dyn Clock>,
    ) -> Self {
        Self {
            vault_reader,
            task_repository,
            clock,
        }
    }

    pub fn dependencies(&self) -> GetDayDependencies<'_> {
        (&self.vault_reader, &self.task_repository, &self.clock)
    }
}
