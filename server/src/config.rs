use std::{
    env,
    ffi::OsString,
    path::{Path, PathBuf},
};

use thiserror::Error;

const DEFAULT_VAULT_PATH: &str =
    "/Users/orion/Library/CloudStorage/GoogleDrive-urano.shota@uslab.jp/マイドライブ/second-brain";
const ROUTINE_RELATIVE_PATH: &str = "80_運用ガイド/人間のルーティン.md";

#[derive(Debug)]
pub struct Config {
    pub port: u16,
    pub vault_path: PathBuf,
    pub db_path: PathBuf,
}

impl Config {
    pub fn from_env(port: u16) -> Result<Self, ConfigError> {
        let vault_path = env::var_os("CEREBELLUM_VAULT")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from(DEFAULT_VAULT_PATH));
        let db_path = match env::var_os("CEREBELLUM_DB") {
            Some(path) => PathBuf::from(path),
            None => default_db_path(env::var_os("HOME"))?,
        };

        Ok(Self {
            port,
            vault_path,
            db_path,
        })
    }

    pub fn routine_path(&self) -> PathBuf {
        self.vault_path.join(ROUTINE_RELATIVE_PATH)
    }
}

fn default_db_path(home: Option<OsString>) -> Result<PathBuf, ConfigError> {
    let home = home.ok_or(ConfigError::HomeDirectoryUnavailable)?;
    Ok(Path::new(&home).join("Library/Application Support/cerebellum/cerebellum.db"))
}

#[derive(Debug, Error)]
pub enum ConfigError {
    #[error("HOME is not set and CEREBELLUM_DB was not provided")]
    HomeDirectoryUnavailable,
}

#[cfg(test)]
mod tests {
    use std::ffi::OsString;

    use super::default_db_path;

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
}
