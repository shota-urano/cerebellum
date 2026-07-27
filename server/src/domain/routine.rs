use super::due::{due_today, sort_rows_by_time};

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RoutineFields {
    pub interval: String,
    pub time: String,
    pub effort: String,
    pub tool: String,
    pub content: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Routine {
    pub id: i64,
    pub interval: String,
    pub time: String,
    pub effort: String,
    pub tool: String,
    pub content: String,
    pub active: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RoutineRow {
    pub interval: String,
    pub time: String,
    pub effort: String,
    pub tool: String,
    pub content: String,
}

pub fn parse_rows(markdown: &str) -> Vec<RoutineRow> {
    markdown
        .lines()
        .filter_map(|raw_line| {
            let line = raw_line.trim();
            if !line.starts_with('|') {
                return None;
            }

            let cells = split_cells(line.trim_matches('|'));
            if cells.len() < 5 {
                return None;
            }

            let first = &cells[0];
            let is_separator = first
                .chars()
                .all(|character| matches!(character, '-' | ' ' | ':'));
            if is_separator || first == "間隔" {
                return None;
            }

            Some(RoutineRow {
                interval: cells[0].clone(),
                time: cells[1].clone(),
                effort: cells[2].clone(),
                tool: cells[3].clone(),
                content: normalize_content(&cells[4]),
            })
        })
        .collect()
}

pub fn routine_rows_for_day(markdown: &str, wd: u32) -> Vec<RoutineRow> {
    let mut rows: Vec<_> = parse_rows(markdown)
        .into_iter()
        .filter(|row| due_today(&row.interval, wd))
        .collect();
    sort_rows_by_time(&mut rows);
    rows
}

fn split_cells(line: &str) -> Vec<String> {
    let mut cells = Vec::new();
    let mut current = String::new();
    let mut previous_was_backslash = false;

    for character in line.chars() {
        if character == '|' && !previous_was_backslash {
            cells.push(clean_cell(&current));
            current.clear();
        } else {
            current.push(character);
        }
        previous_was_backslash = character == '\\';
    }
    cells.push(clean_cell(&current));

    cells
}

fn clean_cell(cell: &str) -> String {
    cell.trim().replace(r"\|", "|")
}

fn normalize_content(content: &str) -> String {
    content
        .replace("<br />", " / ")
        .replace("<br/>", " / ")
        .replace("<br>", " / ")
}

#[cfg(test)]
mod tests {
    use super::{RoutineRow, parse_rows, routine_rows_for_day};
    use crate::domain::task::task_id;

    const FIXTURE: &str = include_str!("../../tests/fixtures/人間のルーティン.md");

    fn row(interval: &str, time: &str, effort: &str, tool: &str, content: &str) -> RoutineRow {
        RoutineRow {
            interval: interval.to_owned(),
            time: time.to_owned(),
            effort: effort.to_owned(),
            tool: tool.to_owned(),
            content: content.to_owned(),
        }
    }

    #[test]
    fn parses_rows_according_to_the_table_rules() {
        let markdown = r#"
outside the table
| 間隔 | 時間 | 実施 | 確認ツール | 内容 |
| :--- | ---: | --- | --- | --- |
| 毎日 | 8:00 | 10分 | slack \| obsidian | first<br>second | ignored |
| 毎日 | | 1時間 | | third<br/>fourth<br />fifth |
| only | four | cells | here |
"#;

        assert_eq!(
            parse_rows(markdown),
            vec![
                row("毎日", "8:00", "10分", "slack | obsidian", "first / second"),
                row("毎日", "", "1時間", "", "third / fourth / fifth"),
            ]
        );
    }

    #[test]
    fn parses_the_copied_routine_fixture_to_fixed_rows() {
        assert_eq!(
            parse_rows(FIXTURE),
            vec![
                row("毎日", "7:30", "", "slack", "つながり発見"),
                row(
                    "毎日",
                    "7:30",
                    "",
                    "slack",
                    "ハーネス取り込み判定🔧の採用提案に✅ / →適用したくなったら /night-harness --apply",
                ),
                row(
                    "土曜",
                    "7:30",
                    "",
                    "obsidian",
                    "40_Projects/incubatorの案がいいかどうかの確認 / → 検証板の「人間の判断」列に記入",
                ),
                row(
                    "毎日",
                    "8:00",
                    "",
                    "slack | obsidian",
                    "40_Projects/noteの原稿の確認",
                ),
                row("毎日", "8:00", "", "orca", "40_Projectsにて新たな学習",),
                row("毎日", "8:30", "", "obsidian", "00_Inboxにて新たな知識",),
                row(
                    "月曜",
                    "9:00",
                    "",
                    "slack | obisidian",
                    "xの週次改善提案み / →改善案をどうするかの判断は人間が必要",
                ),
                row("毎日", "11:00", "", "-", "ゴルフスイング"),
                row("毎日", "18:30", "", "-", "ランニング"),
                row("毎日", "12:10", "", "slack", "リポスト確認"),
                row(
                    "日曜",
                    "22:00",
                    "",
                    "obsidian",
                    "40_Projects/blindspotを確認",
                ),
                row("毎日", "", "1時間", "", "英語学習"),
                row("毎日", "", "15分", "", "読書"),
                row("毎日", "", "1時間", "", "夜間タスクの作成→夜間に回す"),
                row("毎日", "", "", "", "夜間タスクの確認"),
            ]
        );
    }

    #[test]
    fn derives_mondays_due_rows_in_stable_time_order() {
        let rows = routine_rows_for_day(FIXTURE, 0);
        let contents: Vec<_> = rows.iter().map(|row| row.content.as_str()).collect();

        assert_eq!(
            contents,
            vec![
                "つながり発見",
                "ハーネス取り込み判定🔧の採用提案に✅ / →適用したくなったら /night-harness --apply",
                "40_Projects/noteの原稿の確認",
                "40_Projectsにて新たな学習",
                "00_Inboxにて新たな知識",
                "xの週次改善提案み / →改善案をどうするかの判断は人間が必要",
                "ゴルフスイング",
                "リポスト確認",
                "ランニング",
                "英語学習",
                "読書",
                "夜間タスクの作成→夜間に回す",
                "夜間タスクの確認",
            ]
        );
    }

    #[test]
    fn derives_weekend_specific_fixture_rows() {
        let saturday = routine_rows_for_day(FIXTURE, 5);
        let sunday = routine_rows_for_day(FIXTURE, 6);

        assert_eq!(saturday.len(), 13);
        assert_eq!(saturday[2].interval, "土曜");
        assert_eq!(saturday[2].time, "7:30");
        assert!(!saturday.iter().any(|row| row.interval == "月曜"));
        assert_eq!(sunday.len(), 13);
        assert_eq!(sunday[8].interval, "日曜");
        assert_eq!(sunday[8].time, "22:00");
        assert!(!sunday.iter().any(|row| row.interval == "土曜"));
    }

    #[test]
    fn creates_fixed_task_ids_from_parsed_fixture_rows() {
        let rows = parse_rows(FIXTURE);

        assert_eq!(
            task_id(&rows[0].interval, &rows[0].time, &rows[0].content),
            "147dfc65051e"
        );
        assert_eq!(
            task_id(&rows[2].interval, &rows[2].time, &rows[2].content),
            "8174c238785b"
        );
        assert_eq!(
            task_id(&rows[11].interval, &rows[11].time, &rows[11].content),
            "550d0b3f36c3"
        );
    }
}
