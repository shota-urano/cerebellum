use std::{
    env,
    ffi::OsString,
    path::{Path, PathBuf},
};

use thiserror::Error;

/// Vault 既定値の `$HOME` 相対パス。
///
/// 実運用の Vault は Google Drive 上にあり、その絶対パスは利用者ごとに異なる
/// （アカウント名を含む）。**個人を特定できる値をリポジトリに置かない**ため、
/// 既定値は中立な `$HOME/second-brain` とし、実際の場所は env `CEREBELLUM_VAULT`
/// または import-routines の `--vault` で与える。
const DEFAULT_VAULT_RELATIVE_PATH: &str = "second-brain";
const ROUTINE_RELATIVE_PATH: &str = "80_運用ガイド/人間のルーティン.md";

#[derive(Debug)]
pub struct Config {
    pub port: u16,
    pub db_path: PathBuf,
}

impl Config {
    pub fn from_env(port: u16) -> Result<Self, ConfigError> {
        let db_path = Self::resolve_db_path()?;

        Ok(Self { port, db_path })
    }

    pub fn resolve_vault_path(override_path: Option<PathBuf>) -> Result<PathBuf, ConfigError> {
        resolve_vault_path(
            override_path,
            env::var_os("CEREBELLUM_VAULT"),
            env::var_os("HOME"),
        )
    }

    pub fn resolve_db_path() -> Result<PathBuf, ConfigError> {
        match env::var_os("CEREBELLUM_DB") {
            Some(path) => Ok(PathBuf::from(path)),
            None => default_db_path(env::var_os("HOME")),
        }
    }

    pub fn routine_path_for(vault_path: &Path) -> PathBuf {
        vault_path.join(ROUTINE_RELATIVE_PATH)
    }
}

fn resolve_vault_path(
    override_path: Option<PathBuf>,
    environment_path: Option<OsString>,
    home: Option<OsString>,
) -> Result<PathBuf, ConfigError> {
    match (override_path, environment_path) {
        (Some(path), _) => Ok(path),
        (None, Some(path)) => Ok(PathBuf::from(path)),
        (None, None) => default_vault_path(home),
    }
}

fn default_vault_path(home: Option<OsString>) -> Result<PathBuf, ConfigError> {
    let home = home.ok_or(ConfigError::HomeDirectoryUnavailable)?;
    Ok(Path::new(&home).join(DEFAULT_VAULT_RELATIVE_PATH))
}

fn default_db_path(home: Option<OsString>) -> Result<PathBuf, ConfigError> {
    let home = home.ok_or(ConfigError::HomeDirectoryUnavailable)?;
    Ok(Path::new(&home).join("Library/Application Support/cerebellum/cerebellum.db"))
}

#[derive(Debug, Error)]
pub enum ConfigError {
    #[error("HOME is not set and CEREBELLUM_VAULT / CEREBELLUM_DB were not provided")]
    HomeDirectoryUnavailable,
}

#[cfg(test)]
mod tests {
    use std::{ffi::OsString, path::PathBuf};

    use super::{default_db_path, default_vault_path, resolve_vault_path};

    #[test]
    fn default_vault_path_is_home_relative_and_carries_no_personal_data() {
        let path = default_vault_path(Some(OsString::from("/Users/test")))
            .expect("a home directory should produce a vault path");

        assert_eq!(path, std::path::PathBuf::from("/Users/test/second-brain"));
    }

    #[test]
    fn default_database_path_is_under_application_support() {
        let path = default_db_path(Some(OsString::from("/Users/test")))
            .expect("a home directory should produce a database path");

        assert_eq!(
            path,
            std::path::PathBuf::from(
                "/Users/test/Library/Application Support/cerebellum/cerebellum.db"
            )
        );
    }

    #[test]
    fn cli_vault_path_overrides_environment_and_home_defaults() {
        let path = resolve_vault_path(
            Some(PathBuf::from("/cli/vault")),
            Some(OsString::from("/environment/vault")),
            Some(OsString::from("/Users/test")),
        )
        .expect("CLI path should resolve");

        assert_eq!(path, PathBuf::from("/cli/vault"));
    }
}
