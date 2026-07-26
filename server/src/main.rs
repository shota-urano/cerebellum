pub mod adapters;
pub mod cli;
pub mod config;
pub mod domain;
pub mod infra;
pub mod usecase;

use std::sync::Arc;

use adapters::{
    fs_vault::FsVaultReader, sqlite_repo::SqliteTaskRepository, system_clock::SystemClock,
};
use anyhow::{Context, Result};
use clap::Parser;
use cli::{Cli, Command};
use config::Config;
use infra::api::AppState;
use usecase::{
    get_day::GetDay, get_summary::GetSummary, ports::Clock, ports::TaskRepository,
    ports::VaultReader, toggle_check::ToggleCheck,
};

fn main() -> Result<()> {
    init_tracing();

    let cli = Cli::parse();
    match cli.command {
        Command::Serve { port } => compose(port),
    }
}

fn compose(port: u16) -> Result<()> {
    let config = Arc::new(Config::from_env(port).context("failed to resolve configuration")?);

    let vault_reader: Arc<dyn VaultReader> = Arc::new(FsVaultReader::new(config.routine_path()));
    // SQLite は親ディレクトリを作らないため、初回起動（~/Library/Application Support/cerebellum/
    // が未作成）では Connection::open が失敗する。DB を開く前にここで用意する。
    if let Some(parent) = config.db_path.parent() {
        std::fs::create_dir_all(parent).with_context(|| {
            format!(
                "failed to create database directory at {}",
                parent.display()
            )
        })?;
    }
    let task_repository: Arc<dyn TaskRepository> = Arc::new(
        SqliteTaskRepository::open(&config.db_path)
            .with_context(|| format!("failed to open database at {}", config.db_path.display()))?,
    );
    let clock: Arc<dyn Clock> = Arc::new(SystemClock);

    let get_day = Arc::new(GetDay::new(
        Arc::clone(&vault_reader),
        Arc::clone(&task_repository),
        Arc::clone(&clock),
    ));
    let toggle_check = Arc::new(ToggleCheck::new(
        vault_reader,
        Arc::clone(&task_repository),
        Arc::clone(&clock),
    ));
    let get_summary = Arc::new(GetSummary::new(task_repository, clock));

    let _state = Arc::new(AppState {
        get_day,
        toggle_check,
        get_summary,
        config: Arc::clone(&config),
    });

    tracing::info!(port = config.port, "composition root initialized");
    Ok(())
}

fn init_tracing() {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();
}
