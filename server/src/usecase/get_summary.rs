use std::sync::Arc;

use super::ports::{Clock, TaskRepository};

pub struct GetSummary {
    task_repository: Arc<dyn TaskRepository>,
    clock: Arc<dyn Clock>,
}

impl GetSummary {
    pub fn new(task_repository: Arc<dyn TaskRepository>, clock: Arc<dyn Clock>) -> Self {
        Self {
            task_repository,
            clock,
        }
    }

    pub fn dependencies(&self) -> (&Arc<dyn TaskRepository>, &Arc<dyn Clock>) {
        (&self.task_repository, &self.clock)
    }
}
