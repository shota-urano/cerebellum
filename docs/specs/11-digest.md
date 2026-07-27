# 11. 朝ダイジェストの取り込み・パース仕様（domain・usecase・API）

**親**: [`00-overview.md`](./00-overview.md) ｜ **担当**: Backend ｜ **範囲**: `domain/digest.rs`・`usecase/manage_digest.rs`・`infra/api`（`/api/digests`）

## 1. 目的

second-brain の `daily-digest` が毎朝生成する本文を cerebellum に取り込み、タスク行から読める構造化データとして返す。Slack を止めた後も、朝の「つながり／導出／アイデア／consolidate」を履歴付きで参照できる状態にする。

生成そのものは cerebellum の責務ではない。**cerebellum は受け取って保存し、構造化して返すだけ**。

## 2. 入出力

- **入力**: `POST /api/digests`（body に date と原文）。送信元は second-brain の `.claude/skills/daily-digest/scripts/deliver.sh`
- **出力**: `GET /api/digests/{date}`（`today` 可）で構造化 JSON（[`03-api.md`](./03-api.md) §3）
- **依存ポート**: `DigestRepository`（`digests` の読み書き）・`Clock`

## 3. 処理詳細

### 3.1 取り込み（save_digest）

1. `date` は `%Y-%m-%d` または `today`（`Clock` で解決）。それ以外は `bad_request`
2. `body` は空不可（`bad_request`）。長さ上限 64KiB（超過は `bad_request`）
3. **原文をそのまま保存**（整形・正規化しない）。`received_at` は `Clock` の現在時刻
4. 同じ date の行があれば上書き（UPSERT）
5. パースは保存時に行わない。壊れた本文でも受け取って保存する（取りこぼしを作らないため）

### 3.2 パース（domain/digest.rs・純関数）

`&str → Digest { sections: Vec<Section> }`。I/O 依存ゼロ。**送信側の規約は
`.claude/skills/daily-digest/scripts/deliver.sh` の `validate_out` が保証しているが、
本パーサはそれを前提にせず、崩れていても落とさない**（後述のフォールバック）。

**セクション分割**: 次の4つの見出し行（完全一致）で区切る。出現順は問わない。

| 見出し行 | section.kind |
|---|---|
| `:brain: *つながり*` | `connection` |
| `:jigsaw: *導出*` | `derive` |
| `:bulb: *アイデア*` | `idea` |
| `:bar_chart: *昨晩の consolidate*` | `consolidate` |

- 見出しより前の行は捨てない。`kind = "preamble"` の無名セクションに入れる
- 見出しが1つも無ければ全体を1つの `preamble` にする（＝生テキスト表示になる）
- 送信側が追記する `:chart_with_upwards_trend: *週次使用量*`（月曜のみ）のように**未知の見出し**が来た場合も、`:emoji: *見出し*` の形をしていればセクションとして扱い、`kind = "other"`・`title` に見出し文字列を入れる

**行の型付け**（セクション内。前方一致で判定し、どれにも当たらなければ `text`）:

| 行の形 | block.kind | 補足 |
|---|---|---|
| `起点: ...` | `lead` | つながりの起点 |
| `→ ...` | `chain` | 連鎖。末尾の `— \`パス\`` を `note_path` として切り出す |
| `• ...` | `bullet` | 箇条書き。次行以降のインデント行（先頭が空白2つ以上）は同じ block の続きに畳む |
| `⇒ ...` | `saved` | 「〜に保存済み」。`\`パス\`` を `note_path` に切り出す |
| `:warning: ...` | `warning` | 注意行 |
| 上記以外 | `text` | 「この線の意味:」「⚖️ 判定:」等はここに落ちる |

**インライン**:

- `*...*` は強調（`emphasis`）。Slack mrkdwn の1アスタリスク。`**` は使われない規約
- `` `...` `` はノートパス候補。`20_Insights/...md` のように**拡張子 `.md` で終わり `/` を含む**ものだけ `note_path` として扱い、それ以外はただのコード表示にする
- `:name:` の絵文字ショートコードは**サーバーでは変換しない**。DTO には元の文字列を残し、表示側で対応表を持つ（[`12-web-digest.md`](./12-web-digest.md) §3.3）

### 3.3 取得（get_digest）

1. `date` を解決（`today` 可）。不正は `bad_request`
2. 行が無ければ **404 ではなく空の Digest**（`sections: []`）を 200 で返す。「まだ来ていない朝」は正常な状態
3. `section` の絞り込みはサーバーでは行わない（全セクションを返し、表示側が選ぶ）

## 4. 設定値・確定値

- 見出し4種の文字列（§3.2 の表）は送信側 `validate_out` と同じ。**変更する場合は deliver.sh と同時**
- 本文は原文保存。整形・絵文字変換・HTML 化はサーバーで行わない
- 上限 64KiB（送信側の規約は30行以内なので十分な余裕）
- 認証なし（Tailnet 内前提。[`03-api.md`](./03-api.md) §5）

## 5. インターフェース

HTTP 契約は [`03-api.md`](./03-api.md) が正。パースは domain の純関数、保存は usecase 経由。

## 6. エラー処理

- 400 `bad_request`: date 不正・body 空・64KiB 超
- 500 `internal`: DB 障害
- パース失敗という状態を作らない（未知の形は `text` / `preamble` に落として必ず返す）

## 7. スコープ外

- ダイジェストの**生成**（second-brain 側の責務）
- Slack への送信（cerebellum は送らない）
- 過去ダイジェストの全文検索・タグ付け
- ノート本体（`20_Insights/*.md` 等）の取り込み。参照はパス文字列のみで、中身は Vault に取りに行かない

## 8. 関連仕様

- データ: [`02-data-model.md`](./02-data-model.md) §2・§6 ／ API: [`03-api.md`](./03-api.md)
- 表示: [`12-web-digest.md`](./12-web-digest.md)
- 送信元: second-brain `.claude/skills/daily-digest/`（`PROMPT.md` がフォーマット規約、`scripts/deliver.sh` が機械検査と送信）
