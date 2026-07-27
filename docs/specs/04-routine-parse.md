# 04. ルーティン表パース・due 判定仕様（domain）

**親**: [`00-overview.md`](./00-overview.md) ｜ **担当**: Backend ｜ **範囲**: `domain/routine.rs`・`domain/due.rs`・`domain/task.rs`

## 1. 目的

「その日の対象タスク一覧」を導く純ロジック（due 判定・ソート・task_id）と、**初期移行用**の md テーブルパーサ。I/O 依存ゼロ（`&str → Vec<RoutineRow>` の純関数）。

**2026-07-27 の位置づけ変更**: ルーティン表の正本は Vault md から SQLite `routines` に移管された（[`02-data-model.md`](./02-data-model.md) §2）。

| 節 | 現在の役割 |
|---|---|
| §3.1 行パース | **初期 import 専用**（`cerebellum import-routines` の1回だけ使う）。日常の実行経路には乗らない |
| §3.2 due 判定 | 現役。毎日のスナップショット確定で使う（入力は `routines` の行） |
| §3.3 ソート | 現役。同上（表の出現順 = `routines.id` 昇順） |
| §3.4 task_id | 現役。定義の正は [`02-data-model.md`](./02-data-model.md) §3 |

旧「post.py（daily-tasks）と同一仕様であることが契約」は**解消**した。Slack 通知は別ルーチンへ移行し停止するため（2026-07-27 決定）。ただし §3.2〜§3.4 の変更は引き続き禁止 — 理由は Slack との整合ではなく、確定済みの過去記録との連続性（[`02-data-model.md`](./02-data-model.md) §3）。

## 2. 入出力

- **due 判定・ソート**（現役）: 入力 = `routines` の有効行（`id` 昇順）＋今日の曜日 `wd`（0=月..6=日）／出力 = due な行の時刻順リスト
- **パース**（初期 import 専用）: 入力 = ルーティン md の全文（`&str`。ファイル読み取りは adapter の責務）／出力 = `RoutineRow { interval, time, effort, tool, content }` の表順リスト（due 判定前）

表の実物（列: 間隔/時間/実施/確認ツール/内容）:

```markdown
| 間隔  | 時間    | 実施  | 確認ツール              | 内容                             |
| --- | ----- | --- | ------------------ | ------------------------------ |
| 毎日  | 7:30  |     | slack              | つながり発見                     |
| 土曜  | 7:30  |     | obsidian           | 40_Projects/incubator...<br>→... |
| 毎日  | 8:00  |     | slack \| obsidian  | 40_Projects/noteの原稿の確認    |
| 毎日  |       | 1時間 |                   | 英語学習                        |
```

## 3. 処理詳細（逐語・変更禁止）

### 3.1 行パース（parse_rows）— 初期 import 専用

1. 全文を行分割し、各行を trim。`|` で始まらない行はスキップ
2. 行頭・行末の `|` を除去し、**エスケープされていない `|`** で分割（regex `(?<!\|)` 相当: `\|` は区切りにしない）
3. 各セルを trim し、`\|` を `|` に戻す（例: `slack \| obsidian` → `slack | obsidian`）
4. 次の行はスキップ:
   - セル数 < 5
   - 先頭セルの文字集合が `{-, ' ', :}` の部分集合（区切り行 `| --- | ... |`）
   - 先頭セル == `"間隔"`（ヘッダ行）
5. セルを順に `interval, time, effort, tool, content` に割り当て（6列目以降は無視）
6. `content` 内の `<br>` `<br/>` `<br />` を `" / "` に置換

### 3.2 due 判定（due_today）

`interval` 文字列への**部分一致**で判定（この順で評価）:

| 条件 | 結果 |
|---|---|
| `"毎日"` を含む | true |
| `"平日"` を含む | wd < 5 |
| `"週末"` を含む | wd >= 5 |
| 上記以外 | `"月火水木金土日"[wd]` が interval に含まれるか（例: wd=5 なら `"土"` ∈ `"土曜"` → true） |

### 3.3 ソート

- `time` の先頭が `^(\d{1,2}):(\d{2})` にマッチする行を「時刻あり」とし、`時×60+分` の昇順
- 時刻なしの行は**末尾**に、表の出現順を保って並べる（安定ソート）
- 移管後の「表の出現順」= `routines.id` 昇順（[`02-data-model.md`](./02-data-model.md) §2）

### 3.4 task_id

`sha1("{interval}|{time}|{content}")` 先頭12桁（→ [`02-data-model.md`](./02-data-model.md) §3。定義の正はそちら）。

## 4. 設定値・確定値

- 曜日文字列 `"月火水木金土日"`・wd 0=月（変更禁止）
- 列数 5・列順（間隔/時間/実施/確認ツール/内容）は移行元の表に従う
- due 判定・ソート・task_id の変更禁止（過去記録との連続性。[`02-data-model.md`](./02-data-model.md) §3）
- パース（§3.1）は初期 import 専用。移行完了後は実行経路に無いが、**再取り込みの再現性のため削除しない**

## 5. インターフェース

domain 内の純関数のみ。md のファイル読み取りは `VaultReader` ポート（[`01-architecture.md`](./01-architecture.md)。import 実行時のみ使用）、due 判定・ソートの呼び出し元は [`05-day-usecase.md`](./05-day-usecase.md)。

## 6. エラー処理

- パース自体は失敗しない（該当行が無ければ空リスト）。due 0件も正常（空の一日として扱う）
- ファイル読み取り不能は adapter 層のエラー。import コマンドの失敗として exit 1（サーバー実行時には到達しない）

## 7. スコープ外

- 表の書式バリデーション・修正提案（入力検証は API 側 → [`03-api.md`](./03-api.md) §3）
- `隔週` 等の新しい間隔表現（現行表に存在しない。追加する場合は §3.2 の判定順序ごと設計する）

## 8. 関連仕様

- 前工程: なし（`routines` が入力。初期 import 時のみ md） ／ 後工程: [`05-day-usecase.md`](./05-day-usecase.md)
- task_id・スナップショット・マスタ: [`02-data-model.md`](./02-data-model.md)
- import コマンド: [`06-cli-serve.md`](./06-cli-serve.md) §3.1
- fixture テスト方針: [`01-architecture.md`](./01-architecture.md) §6
