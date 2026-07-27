use sha1_smol::Sha1;

pub fn task_id(interval: &str, time: &str, content: &str) -> String {
    let source = format!("{interval}|{time}|{content}");
    Sha1::from(source).digest().to_string()[..12].to_owned()
}

#[cfg(test)]
mod tests {
    use super::task_id;

    #[test]
    fn creates_fixed_ids_from_parsed_identity_fields() {
        assert_eq!(task_id("毎日", "7:30", "つながり発見"), "147dfc65051e");
        assert_eq!(
            task_id(
                "土曜",
                "7:30",
                "40_Projects/incubatorの案がいいかどうかの確認 / → 検証板の「人間の判断」列に記入",
            ),
            "8174c238785b"
        );
        assert_eq!(task_id("毎日", "", "英語学習"), "550d0b3f36c3");
    }

    #[test]
    fn excludes_effort_and_tool_by_accepting_only_identity_fields() {
        assert_eq!(
            task_id("毎日", "8:00", "40_Projects/noteの原稿の確認"),
            "bc233a843520"
        );
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Task {
    pub id: String,
    pub interval: String,
    pub time: String,
    pub effort: String,
    pub tool: String,
    pub content: String,
    pub sort_no: usize,
    /// スナップショット確定時にマスタからコピーした結び付け（docs/specs/02-data-model.md §6）
    pub detail_ref: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CheckedTask {
    pub task: Task,
    pub done: bool,
    pub checked_at: Option<String>,
}
