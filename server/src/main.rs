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
use usecase::import_routines::ImportRoutines;
use usecase::{
    get_day::GetDay, get_summary::GetSummary, manage_digest::ManageDigest,
    manage_routines::ManageRoutines, ports::Clock, ports::DigestRepository,
    ports::RoutineRepository, ports::TaskRepository, ports::VaultReader, toggle_check::ToggleCheck,
};

#[tokio::main]
async fn main() -> Result<()> {
    init_tracing();

    let cli = Cli::parse();
    match cli.command {
        Command::Serve { port } => serve(port).await,
        Command::ImportRoutines {
            vault,
            dry_run,
            force,
        } => import_routines(vault, dry_run, force),
    }
}

fn import_routines(vault: Option<std::path::PathBuf>, dry_run: bool, force: bool) -> Result<()> {
    let vault_path =
        Config::resolve_vault_path(vault).context("failed to resolve vault configuration")?;
    let vault_reader: Arc<dyn VaultReader> =
        Arc::new(FsVaultReader::new(Config::routine_path_for(&vault_path)));
    let import = ImportRoutines::new(vault_reader);
    let rows = import.preview().context("routine import failed")?;

    if dry_run {
        print_routines("Dry run", &rows);
        return Ok(());
    }

    let db_path = Config::resolve_db_path().context("failed to resolve database configuration")?;
    if let Some(parent) = db_path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
    {
        std::fs::create_dir_all(parent).with_context(|| {
            format!(
                "failed to create database directory at {}",
                parent.display()
            )
        })?;
    }
    let repository = SqliteTaskRepository::open(&db_path)
        .with_context(|| format!("failed to open database at {}", db_path.display()))?;
    let rows = import
        .import_prepared(rows, &repository, &SystemClock, force)
        .context("routine import failed")?;
    println!("Imported {} routines", rows.len());
    Ok(())
}

fn print_routines(label: &str, rows: &[domain::routine::RoutineRow]) {
    println!("{label}: {} routines", rows.len());
    for (index, row) in rows.iter().enumerate() {
        println!(
            "{:>3}: interval={:?}, time={:?}, effort={:?}, tool={:?}, content={:?}",
            index + 1,
            row.interval,
            row.time,
            row.effort,
            row.tool,
            row.content
        );
    }
}

async fn serve(port: u16) -> Result<()> {
    let config = Arc::new(Config::from_env(port).context("failed to resolve configuration")?);

    // SQLite は親ディレクトリを作らないため、初回起動（~/Library/Application Support/cerebellum/
    // が未作成）では Connection::open が失敗する。DB を開く前にここで用意する。
    if let Some(parent) = config
        .db_path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
    {
        std::fs::create_dir_all(parent).with_context(|| {
            format!(
                "failed to create database directory at {}",
                parent.display()
            )
        })?;
    }
    let repository = Arc::new(
        SqliteTaskRepository::open(&config.db_path)
            .with_context(|| format!("failed to open database at {}", config.db_path.display()))?,
    );
    let routine_repository: Arc<dyn RoutineRepository> = repository.clone();
    let digest_repository: Arc<dyn DigestRepository> = repository.clone();
    let task_repository: Arc<dyn TaskRepository> = repository;
    let clock: Arc<dyn Clock> = Arc::new(SystemClock);

    let get_day = Arc::new(GetDay::new(
        Arc::clone(&routine_repository),
        Arc::clone(&task_repository),
        Arc::clone(&clock),
    ));
    let toggle_check = Arc::new(ToggleCheck::new(
        Arc::clone(&routine_repository),
        Arc::clone(&task_repository),
        Arc::clone(&clock),
    ));
    let get_summary = Arc::new(GetSummary::new(
        Arc::clone(&task_repository),
        Arc::clone(&clock),
    ));
    let manage_routines = Arc::new(ManageRoutines::new(
        Arc::clone(&routine_repository),
        Arc::clone(&clock),
    ));
    let manage_digest = Arc::new(ManageDigest::new(digest_repository, clock));

    let state = Arc::new(AppState {
        get_day,
        toggle_check,
        get_summary,
        manage_routines,
        manage_digest,
        routine_repository,
        task_repository,
        config: Arc::clone(&config),
    });

    let address = format!("0.0.0.0:{}", config.port);
    let listener = tokio::net::TcpListener::bind(&address)
        .await
        .with_context(|| format!("failed to listen on {address}"))?;

    tracing::info!(address, "cerebellum server listening");
    axum::serve(listener, infra::api::router(state))
        .await
        .context("server stopped unexpectedly")
}

fn init_tracing() {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();
}
