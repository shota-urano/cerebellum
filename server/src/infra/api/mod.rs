use std::sync::Arc;

use crate::{
    config::Config,
    usecase::{get_day::GetDay, get_summary::GetSummary, toggle_check::ToggleCheck},
};

pub struct AppState {
    pub get_day: Arc<GetDay>,
    pub toggle_check: Arc<ToggleCheck>,
    pub get_summary: Arc<GetSummary>,
    pub config: Arc<Config>,
}
