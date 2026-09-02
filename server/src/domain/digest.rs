//! 朝ダイジェストのパース（docs/specs/11-digest.md §3.2）。
//!
//! 送信側（second-brain の `daily-digest`）は `deliver.sh` の `validate_out` で
//! フォーマットを機械検査しているが、**このパーサはそれを前提にしない**。
//! 未知の形は `Text` / `Preamble` に落として必ず返す（パース失敗という状態を作らない）。

/// タスク行から詳細ビューを開くための結び付け（docs/specs/02-data-model.md §6）。
/// 語彙は docs/specs/02-data-model.md §6 と同期する。
/// `nightshift.report` はダイジェストではなく夜勤詳細ビュー（/nightshift・
/// docs/specs/13-web-nightshift.md）への結び付け。サーバーは語彙検証のみで、
/// データは表示側が夜勤ビューア（:48310）の runs.json を直接読む。
pub const DETAIL_REFS: [&str; 8] = [
    "digest.connection",
    "digest.derive",
    "digest.idea",
    "digest.consolidate",
    "nightshift.report",
    "learning.session",
    "harness.proposals",
    "intake.candidates",
];

pub fn is_valid_detail_ref(value: &str) -> bool {
    DETAIL_REFS.contains(&value)
}

/// 見出し行 → セクション種別。`detail_ref` の後半と対応する。
const SECTION_HEADINGS: [(&str, &str); 4] = [
    (":brain: *つながり*", "connection"),
    (":jigsaw: *導出*", "derive"),
    (":bulb: *アイデア*", "idea"),
    (":bar_chart: *昨晩の consolidate*", "consolidate"),
];

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Digest {
    pub sections: Vec<Section>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Section {
    /// connection | derive | idea | consolidate | preamble | other
    pub kind: String,
    /// 見出し行の原文（preamble は None）
    pub title: Option<String>,
    pub blocks: Vec<Block>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Block {
    /// lead | chain | bullet | saved | warning | text
    pub kind: String,
    pub text: String,
    /// 行末などに現れるノートパス（`20_Insights/....md` 形式のみ）
    pub note_path: Option<String>,
}

/// 本文を構造化する。空文字なら空の Digest。
pub fn parse(body: &str) -> Digest {
    let mut sections: Vec<Section> = Vec::new();
    let mut current: Option<Section> = None;

    for raw_line in body.lines() {
        let line = raw_line.trim_end();
        if let Some((kind, title)) = heading_of(line.trim()) {
            if let Some(section) = current.take() {
                sections.push(section);
            }
            current = Some(Section {
                kind,
                title: Some(title),
                blocks: Vec::new(),
            });
            continue;
        }

        if line.trim().is_empty() {
            continue;
        }

        let section = current.get_or_insert_with(|| Section {
            kind: "preamble".to_owned(),
            title: None,
            blocks: Vec::new(),
        });

        // 箇条書きの続き行（先頭に空白2つ以上）は直前の bullet / saved に畳む
        let is_continuation = raw_line.starts_with("  ") && !raw_line.trim().is_empty();
        if is_continuation
            && let Some(previous) = section.blocks.last_mut()
            && matches!(previous.kind.as_str(), "bullet" | "saved")
        {
            previous.text.push('\n');
            previous.text.push_str(line.trim());
            if previous.note_path.is_none() {
                previous.note_path = note_path_of(line.trim());
            }
            continue;
        }

        section.blocks.push(block_of(line.trim()));
    }

    if let Some(section) = current {
        sections.push(section);
    }

    Digest { sections }
}

fn heading_of(line: &str) -> Option<(String, String)> {
    if let Some((_, kind)) = SECTION_HEADINGS
        .iter()
        .find(|(heading, _)| *heading == line)
    {
        return Some(((*kind).to_owned(), line.to_owned()));
    }

    // 未知の見出し（例: 月曜だけ付く `:chart_with_upwards_trend: *週次使用量*`）も
    // セクションとして扱う。落とすと本文が消える
    let looks_like_heading =
        line.starts_with(':') && line.len() > 2 && line[1..].contains(": *") && line.ends_with('*');
    looks_like_heading.then(|| ("other".to_owned(), line.to_owned()))
}

fn block_of(line: &str) -> Block {
    let (kind, text) = if let Some(rest) = line.strip_prefix("起点: ") {
        ("lead", rest)
    } else if let Some(rest) = line.strip_prefix("→ ") {
        ("chain", rest)
    } else if let Some(rest) = line.strip_prefix("• ") {
        ("bullet", rest)
    } else if let Some(rest) = line.strip_prefix("⇒ ") {
        ("saved", rest)
    } else if let Some(rest) = line.strip_prefix(":warning: ") {
        ("warning", rest)
    } else {
        ("text", line)
    };

    Block {
        kind: kind.to_owned(),
        text: text.to_owned(),
        note_path: note_path_of(text),
    }
}

/// バッククォートで囲まれた `20_Insights/....md` 形式だけをノートパスとして拾う。
/// 拡張子 `.md` かつ `/` を含むものに限る（ただのコード表示と区別する）。
fn note_path_of(text: &str) -> Option<String> {
    let mut rest = text;
    while let Some(start) = rest.find('`') {
        let after = &rest[start + 1..];
        let end = after.find('`')?;
        let candidate = &after[..end];
        if candidate.ends_with(".md") && candidate.contains('/') {
            return Some(candidate.to_owned());
        }
        rest = &after[end + 1..];
    }
    None
}

#[cfg(test)]
mod tests {
    use super::{Block, is_valid_detail_ref, note_path_of, parse};

    const SAMPLE: &str = r#":brain: *つながり*
起点: 自作ハーネスをどう強くするか（夜間の自己改善ループを回している）
→ 賢いモデルには足場を"足す"より過剰な誘導を"削る"が効く（発展） — `20_Insights/賢いモデルには足場を足すより過剰な誘導を削るほうが効く.md`
→ そもそも賢さはモデルの訓練に宿る（対立） — `20_Insights/エージェンシーはモデルの訓練由来.md`
この線の意味: ハーネス投資は"邪魔しない"方向に絞るのが筋。

:jigsaw: *導出*
導出なし（新しい事実の組み合わせ候補が0件・検証対象なし）

:bulb: *アイデア*
• *没ポスト書き戻しループ（post-failback）*
  生成したのに没にしたポストを回収し、失敗の型を勝ち型カタログへ週次で書き戻す。
  ⇒ `25_Ideas/没ポスト書き戻しループ post-failback.md` に保存済み

:bar_chart: *昨晩の consolidate*
今朝3:17に実行、5クラスタ全て無変更（統合・昇格・矛盾なし）。
:warning: 14日以上使われていないメモが37件に増えた（>10）。棚卸し（トリアージ）推奨。
"#;

    fn kinds(blocks: &[Block]) -> Vec<&str> {
        blocks.iter().map(|block| block.kind.as_str()).collect()
    }

    #[test]
    fn splits_the_four_sections_in_order() {
        let digest = parse(SAMPLE);
        let kinds: Vec<&str> = digest
            .sections
            .iter()
            .map(|section| section.kind.as_str())
            .collect();
        assert_eq!(kinds, ["connection", "derive", "idea", "consolidate"]);
        assert_eq!(
            digest.sections[0].title.as_deref(),
            Some(":brain: *つながり*")
        );
    }

    #[test]
    fn types_lines_by_their_prefix_and_extracts_note_paths() {
        let digest = parse(SAMPLE);
        let connection = &digest.sections[0];
        assert_eq!(
            kinds(&connection.blocks),
            ["lead", "chain", "chain", "text"]
        );
        assert_eq!(
            connection.blocks[1].note_path.as_deref(),
            Some("20_Insights/賢いモデルには足場を足すより過剰な誘導を削るほうが効く.md")
        );
        assert!(connection.blocks[0].note_path.is_none());

        let consolidate = &digest.sections[3];
        assert_eq!(kinds(&consolidate.blocks), ["text", "warning"]);
    }

    #[test]
    fn folds_indented_continuations_into_the_preceding_bullet() {
        let digest = parse(SAMPLE);
        let idea = &digest.sections[2];
        assert_eq!(kinds(&idea.blocks), ["bullet"]);
        let bullet = &idea.blocks[0];
        assert!(bullet.text.contains("没ポスト書き戻しループ"));
        assert!(bullet.text.contains("週次で書き戻す"));
        assert_eq!(
            bullet.note_path.as_deref(),
            Some("25_Ideas/没ポスト書き戻しループ post-failback.md")
        );
    }

    #[test]
    fn keeps_unknown_headings_and_text_before_the_first_heading() {
        let digest =
            parse("前置きの一行\n:chart_with_upwards_trend: *週次使用量*\n出力トークン 1.2M");
        let kinds: Vec<&str> = digest
            .sections
            .iter()
            .map(|section| section.kind.as_str())
            .collect();
        assert_eq!(kinds, ["preamble", "other"]);
        assert_eq!(digest.sections[1].blocks[0].text, "出力トークン 1.2M");
    }

    #[test]
    fn treats_a_body_without_headings_as_one_preamble() {
        let digest = parse("見出しのない本文");
        assert_eq!(digest.sections.len(), 1);
        assert_eq!(digest.sections[0].kind, "preamble");
        assert!(digest.sections[0].title.is_none());
        assert!(parse("").sections.is_empty());
    }

    #[test]
    fn only_markdown_note_paths_count_as_note_paths() {
        assert_eq!(
            note_path_of("見よ `20_Insights/a.md` を"),
            Some("20_Insights/a.md".to_owned())
        );
        assert!(note_path_of("`make verify` を実行").is_none());
        assert!(note_path_of("`README.md` 単体はパスでない").is_none());
    }

    #[test]
    fn detail_ref_vocabulary_is_closed() {
        assert!(is_valid_detail_ref("digest.connection"));
        assert!(is_valid_detail_ref("learning.session"));
        assert!(is_valid_detail_ref("harness.proposals"));
        assert!(is_valid_detail_ref("intake.candidates"));
        assert!(!is_valid_detail_ref("learning.unknown"));
        assert!(!is_valid_detail_ref(""));
    }
}
