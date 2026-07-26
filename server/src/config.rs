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
/// で与える（launchd plist に記載する）。未設定で既定値が存在しない場合は
/// Vault 不能として起動は継続し、該当リクエストのみ 503 になる（docs/specs/06 §3.2・§6）。
const DEFAULT_VAULT_RELATIVE_PATH: &str = "second-brain";
const ROUTINE_RELATIVE_PATH: &str = "80_運用ガイド/人間のルーティン.md";

#[derive(Debug)]
pub struct Config {
    pub port: u16,
    pub vault_path: PathBuf,
    pub db_path: PathBuf,
}

impl Config {
    pub fn from_env(port: u16) -> Result<Self, ConfigError> {
        let vault_path = match env::var_os("CEREBELLUM_VAULT") {
            Some(path) => PathBuf::from(path),
            None => default_vault_path(env::var_os("HOME"))?,
        };
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
    use std::ffi::OsString;

    use super::{default_db_path, default_vault_path};

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
}
