use super::task::CheckedTask;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Progress {
    pub done: usize,
    pub total: usize,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DaySnapshot {
    pub date: String,
    pub weekday: char,
    pub readonly: bool,
    pub progress: Progress,
    pub tasks: Vec<CheckedTask>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SummaryDay {
    pub date: String,
    pub done: usize,
    pub total: usize,
}
