use super::routine::RoutineRow;

const WEEKDAYS: &str = "月火水木金土日";

pub fn due_today(interval: &str, wd: u32) -> bool {
    if interval.contains("毎日") {
        true
    } else if interval.contains("平日") {
        wd < 5
    } else if interval.contains("週末") {
        wd >= 5
    } else {
        WEEKDAYS
            .chars()
            .nth(wd as usize)
            .is_some_and(|weekday| interval.contains(weekday))
    }
}

pub fn sort_rows_by_time(rows: &mut [RoutineRow]) {
    rows.sort_by_key(|row| match time_in_minutes(&row.time) {
        Some(minutes) => (false, minutes),
        None => (true, 0),
    });
}

fn time_in_minutes(time: &str) -> Option<u32> {
    let bytes = time.as_bytes();
    let (hours_end, minutes_start) = match bytes {
        [hour, b':', minute_tens, minute_ones, ..]
            if hour.is_ascii_digit()
                && minute_tens.is_ascii_digit()
                && minute_ones.is_ascii_digit() =>
        {
            (1, 2)
        }
        [hour_tens, hour_ones, b':', minute_tens, minute_ones, ..]
            if hour_tens.is_ascii_digit()
                && hour_ones.is_ascii_digit()
                && minute_tens.is_ascii_digit()
                && minute_ones.is_ascii_digit() =>
        {
            (2, 3)
        }
        _ => return None,
    };

    let hours = time[..hours_end].parse::<u32>().ok()?;
    let minutes = time[minutes_start..minutes_start + 2].parse::<u32>().ok()?;
    Some(hours * 60 + minutes)
}

#[cfg(test)]
mod tests {
    use super::{due_today, sort_rows_by_time};
    use crate::domain::routine::RoutineRow;

    fn row(time: &str, content: &str) -> RoutineRow {
        RoutineRow {
            interval: "毎日".to_owned(),
            time: time.to_owned(),
            effort: String::new(),
            tool: String::new(),
            content: content.to_owned(),
        }
    }

    #[test]
    fn evaluates_daily_weekday_weekend_and_named_weekdays_in_order() {
        assert!(due_today("毎日", 6));
        assert!(due_today("平日", 0));
        assert!(!due_today("平日", 5));
        assert!(!due_today("週末", 4));
        assert!(due_today("週末", 5));
        assert!(due_today("月曜・木曜", 0));
        assert!(due_today("月曜・木曜", 3));
        assert!(!due_today("月曜・木曜", 1));
        assert!(due_today("毎日・平日", 6));
    }

    #[test]
    fn sorts_time_prefixes_stably_and_places_missing_times_last() {
        let mut rows = vec![
            row("", "missing first"),
            row("8:30", "later"),
            row("7:05以降", "early first"),
            row("7:05", "early second"),
            row("not a time", "missing second"),
        ];

        sort_rows_by_time(&mut rows);

        assert_eq!(
            rows.iter()
                .map(|row| row.content.as_str())
                .collect::<Vec<_>>(),
            vec![
                "early first",
                "early second",
                "later",
                "missing first",
                "missing second",
            ]
        );
    }
}
