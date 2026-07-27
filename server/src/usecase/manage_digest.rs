use std::sync::Arc;

use crate::domain::digest::{Digest, parse};

use super::{
    error::UsecaseError,
    get_day::{repository_error, resolve_date},
    ports::{Clock, DigestRepository},
};

/// 本文の上限（docs/specs/11-digest.md §4）。送信側の規約は30行以内なので十分な余裕。
const MAX_BODY_BYTES: usize = 64 * 1024;

pub struct ManageDigest {
    repository: Arc<dyn DigestRepository>,
    clock: Arc<dyn Clock>,
}

pub struct StoredAt {
    pub date: String,
    pub received_at: String,
}

pub struct DigestView {
    pub date: String,
    pub received_at: Option<String>,
    pub digest: Digest,
}

impl ManageDigest {
    pub fn new(repository: Arc<dyn DigestRepository>, clock: Arc<dyn Clock>) -> Self {
        Self { repository, clock }
    }

    /// 取り込み（docs/specs/11-digest.md §3.1）。**保存時にパースしない**——
    /// 壊れた本文でも受け取って残し、表示時のパースで救えるようにする。
    pub fn save(&self, date: &str, body: &str) -> Result<StoredAt, UsecaseError> {
        let today = self.clock.now().date_naive();
        let date = resolve_date(date, today)?;

        if body.trim().is_empty() {
            return Err(UsecaseError::BadRequest(
                "body must not be empty".to_owned(),
            ));
        }
        if body.len() > MAX_BODY_BYTES {
            return Err(UsecaseError::BadRequest(format!(
                "body must not exceed {MAX_BODY_BYTES} bytes"
            )));
        }

        let date = date.format("%Y-%m-%d").to_string();
        let received_at = self.clock.now().to_rfc3339();
        self.repository
            .save_digest(&date, body, &received_at)
            .map_err(repository_error)?;

        Ok(StoredAt { date, received_at })
    }

    /// 取得（同 §3.3）。未受信の日は 404 ではなく空の Digest を返す。
    pub fn get(&self, date: &str) -> Result<DigestView, UsecaseError> {
        let today = self.clock.now().date_naive();
        let date = resolve_date(date, today)?.format("%Y-%m-%d").to_string();

        let stored = self
            .repository
            .get_digest(&date)
            .map_err(repository_error)?;

        Ok(match stored {
            Some(stored) => DigestView {
                date,
                received_at: Some(stored.received_at),
                digest: parse(&stored.body),
            },
            None => DigestView {
                date,
                received_at: None,
                digest: Digest {
                    sections: Vec::new(),
                },
            },
        })
    }
}
