use std::sync::Arc;

use super::ports::{Clock, TaskRepository, VaultReader};

pub type ToggleCheckDependencies<'a> = (
    &'a Arc<dyn VaultReader>,
    &'a Arc<dyn TaskRepository>,
    &'a Arc<dyn Clock>,
);

pub struct ToggleCheck {
    vault_reader: Arc<dyn VaultReader>,
    task_repository: Arc<dyn TaskRepository>,
    clock: Arc<dyn Clock>,
}

impl ToggleCheck {
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

    pub fn dependencies(&self) -> ToggleCheckDependencies<'_> {
        (&self.vault_reader, &self.task_repository, &self.clock)
    }
}
