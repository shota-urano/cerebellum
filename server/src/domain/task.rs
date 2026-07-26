#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Task {
    pub id: String,
    pub interval: String,
    pub time: String,
    pub effort: String,
    pub tool: String,
    pub content: String,
    pub sort_no: usize,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CheckedTask {
    pub task: Task,
    pub done: bool,
    pub checked_at: Option<String>,
}
