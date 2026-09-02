---
status: superseded
superseded_by: 24-inbox.md
---

> **2026-09-02 superseded**: 専用 API・専用画面としては出荷しない。作業ツリーの未コミット実装は [`24-inbox.md`](./24-inbox.md) の汎用「人間待ち項目」に作り替える素材にする。本文は判断の履歴として残す。

# 22. daily取り込み候補の受け入れ・承認記録仕様（domain・usecase・API）

**親**: [`00-overview.md`](./00-overview.md) ｜ **担当**: Backend ｜ **範囲**: `domain/intake.rs`・`usecase/manage_intake.rs`・`infra/api`（`/api/intake`）

## 1. 目的

second-brain の `daily-harness` が毎晩 00:40 に仕分けた「daily取り込み候補」（ToDo・考え・口調の3レーン）を cerebellum に取り込み、**画面でタップした承認だけを、翌晩 00:40 の無人適用が読んで確定反映する**ループを閉じる。

いまは Obsidian で候補ファイル（`90_Meta/daily_intake/YYYY-MM-DD.md`）の `- [ ]` を手でチェックしている。スマホから承認できず、承認が要る他の判断（ハーネス取り込み）と場所が分かれているのが二度手間になっている。

生成・仕分け・適用そのものは cerebellum の責務ではない。**cerebellum は受け取って表示し、承認の意思を預かり、適用結果を受け取って見せるだけ**（ハーネス [`17`](./17-harness-approval.md)・digest [`11`](./11-digest.md)・学習 [`14`](./14-learning.md) と同じ分界）。

**正本は候補ファイル（Vault 側）のまま**（second-brain `85_定義/daily取り込み.md` の決定）。画面の✅は候補ファイルのチェックボックスへ書き戻され、既存の `--apply` はそれを読む。cerebellum が持つのは人間の意思と機械の結果だけで、候補の中身も適用の履歴も二重管理しない。

## 2. 入出力

- **入力**: `POST /api/intake/candidates`（その日の候補をまとめて送る。**0件の日も送る**）。送信元は second-brain の `daily-harness`
- **表示**: `GET /api/intake/candidates?status=proposed`（未決を日付問わず新しい順）
- **承認**: `POST /api/intake/candidates/{id}/decision`（画面のタップ）
- **書き戻し側の読み出し**: `GET /api/intake/candidates?status=approved&applyState=pending`（翌晩 00:40 の `sync` → `--apply` が読む）
- **適用結果の書き戻し**: `POST /api/intake/candidates/{id}/apply-result`（成功・失敗とも）
- **依存ポート**: `IntakeRepository`（`intake_days` / `intake_candidates` の読み書き）・`Clock`

## 3. 処理詳細

### 3.1 候補 JSON の形

具体的な JSON 契約（リクエスト・レスポンスのフィールド、値、null 可否）は [`03-api.md`](./03-api.md) §3 を正本とする。本節には検証規則と各フィールドの処理上の意味だけを定める。

- 必須: `date`・`sourcePath`・`items[]`（**0〜60件。空配列可**——0件の日が正常であり、かつ「0件」と「00:40 が落ちた」を画面で描き分ける必要があるため → §3.5）
- `date` は**元ノートの日付**（＝候補ファイル名。00:40 実行日の前日）。候補ファイル1枚＝1リクエスト
- `sourcePath` は候補ファイルの Vault 相対パス、`sourceNote` は元ノートの Vault 相対パス。いずれも**サーバはこのパスにアクセスしない**（学習仕様の `workdir`・ハーネスの `detailPath` と同じ扱い）
- 各 item の必須は `lane`・`text`。`lane` は `todo`（ToDo）| `thought`（考え）| `tone`（口調）の3値。**痛点・種は送らない**（別の関門が既にある → §7）
- `text` は**本人の原文そのまま**（≤2000文字）。要約・言い換えを受け取らない（原文であることが「考え」「口調」の価値そのもの）
- `note` は「考え」レーンの補足1文（≤200文字・任意）
- `lineNo` は候補ファイル内の行番号（任意）。**書き戻し側のヒントに過ぎず、行の同定は原文一致が優先**（人間が候補ファイルの原文を直してよい仕様のため、行番号は容易にずれる）
- サーバは `slug = hex(sha1("{date}|{lane}|{text}"))[0..12]` を計算して一意キーにする。**`task_id`（[`02-data-model.md`](./02-data-model.md) §3）とは別式・別用途**であり、過去記録の連続性の対象ではない

### 3.2 取り込み（save_intake_candidates）

1. `date` は `%Y-%m-%d`（`today` も可・`Clock` で解決）。それ以外は `bad_request`
2. body はサイズ上限 256KiB（`text` は1件 2KiB まで）。必須欠落・`lane` 不正・`items` 61件以上・`slug` 重複は `bad_request`——**崩れた入力は保存しない**（学習 [`14`](./14-learning.md) §3.2・ハーネス [`17`](./17-harness-approval.md) §3.2 と同じ判断）。`slug` 重複＝同一 date・同一レーンに完全同一の原文があるということなので、送信側で1件にまとめてから送る
3. 受信の記録を `intake_days`（date・source_path・source_note・received_at）に UPSERT する。**items が空でもこの行は必ず作る**（§3.5 の未着判定の根拠）
4. 同じ `date` への再送は**その日の候補行をまとめて置換**（DELETE→INSERT を1トランザクション）。ただし **人間の意思が付いた行（`status` が `approved` / `rejected`）または適用が動いた行（`apply_state ≠ pending`）が1件でもあれば `conflict`（409）で拒否**（ハーネス [`17`](./17-harness-approval.md) §3.2 と同じ。守るのは人間の承認・却下と機械の適用結果だけ）
5. 取り込み時の初期状態: 全行 `status = "proposed"` ・ `apply_state = "pending"`
6. `received_at` は `Clock`

### 3.3 承認の記録（save_decision）

`POST /api/intake/candidates/{id}/decision` のリクエスト・レスポンス DTO は [`03-api.md`](./03-api.md) §3 を正本とする。

1. `status` は `approved` | `rejected` | `proposed`（**取り消し＝`proposed` に戻す**。誤タップの救済路。適用までは何度でも変更できる）
2. `apply_state` が `pending` 以外の行への decision は `bad_request`（適用済みを後から未承認にはできない）
3. `decided_at` は `Clock`。上書きのたびに更新する

**`rejected` は「触らない」の意思表示である**（書き戻し側は ❌ の行を候補ファイルに反映しない → §8）。cerebellum 側で見えなくなるだけで、候補ファイルの行は未チェックのまま残る。

### 3.4 適用ループとの接続

**読み出し**: `GET /api/intake/candidates?status=approved&applyState=pending` が、日付を問わず適用待ちの行を古い順に返す。日付で絞らないのは、**承認した翌晩に適用される（＝別日の行を拾う）のが正常動作**であり、後日まとめてタップした古い日の行も拾う必要があるから。

**失敗の読み出し**: `GET /api/intake/candidates?applyState=failed` が、日付を問わず適用失敗の行を**新しい順**に返す（画面の失敗枠 [`23`](./23-web-waiting.md) §3.4 の取得元。ハーネス [`17`](./17-harness-approval.md) §3.4 と同型）。

**未決の読み出し**: `GET /api/intake/candidates?status=proposed` が、日付を問わず未決の行を**新しい順**に返す（画面の本体 → §3.5 の理由で日付では引かない）。

**書き戻し**: `POST /api/intake/candidates/{id}/apply-result`

1. `state` は `applied` | `failed`。`failed` のとき `error`（≤1000文字）必須
2. `resultPath` は反映先の Vault 相対パス（`20_Insights/....md` / `30_X/人格資産/05_口調.md`）、`resultUrl` は ToDo レーンで作成した Linear issue の URL。いずれも任意・**サーバはアクセスも検証もしない**（文字列として預かるだけ）
3. `status = "approved"` 以外の行への書き戻しは `bad_request`
4. `applied_at` は `Clock`。再送は上書き（`failed` → 手で直して再実行 → `applied` の遷移を許す）

### 3.5 未着の扱い（沈黙させない）

画面は**日付ではなく状態で引く**（`status=proposed`）。候補ファイルの `date` は元ノートの日付（＝前日）なので、`date=today` で引くと常に空になり、当日集中モデル（ハーネス [`18`](./18-web-harness.md)）がそのままでは成立しないため。

代わりに、未決一覧のレスポンスに**最後の受信の情報**（`latestDate` ・ `latestReceivedAt` ・ `latestItemCount`。`intake_days` の最新行。1件も無ければすべて `null`）を含める。画面はこれで次の3つを描き分ける（[`23`](./23-web-waiting.md) §4）:

| 状態 | 意味 |
|---|---|
| `latestReceivedAt` が今日でない・`null` | **未着**（00:40 の実行が落ちたか POST 失敗）→ 異常表示 |
| 今日の受信あり・`latestItemCount = 0` | 抽出0件（**正常**。ノートが無い日・拾う行が無い日） |
| 今日の受信あり・未決0件 | 今日の分は片付いた（正常） |

「候補が0件」と「今晩の抽出が届いていない」を取り違えないための機械的な根拠であり、`intake_days` を items と別テーブルに置く唯一の理由がこれ。

## 4. 状態モデル（正本の分界・確定）

**cerebellum が持つのは「人間の意思」と「機械の結果」だけ**。候補の中身と適用の履歴は Vault 側（候補ファイル・`20_Insights/`・`05_口調.md`）が正本。

| 列 | 誰が書くか | 値 |
|---|---|---|
| `status` | 人間（画面） | `proposed` → `approved` / `rejected`（相互に往復可） |
| `apply_state` | 機械（`sync` → `--apply`） | `pending` → `applied` / `failed` |

- 承認が Vault へ渡るのは**書き戻し（`sync`）を経由してのみ**。cerebellum から Vault へ直接書く経路は存在しない（AGENTS.md ルール1）
- ハーネス [`17`](./17-harness-approval.md) との違いは `killed` が無いこと。daily取り込みには「機械が見送った候補」という状態が無い（機械は拾うか拾わないかで、拾わなかったものは送られてこない）

## 5. インターフェース（実装時に他仕様へ追記するもの）

- [`02-data-model.md`](./02-data-model.md): `intake_days`（date PK・source_path・source_note・received_at・item_count）と `intake_candidates`（id PK・date・slug・lane・text・note・line_no・status・decided_at・apply_state・applied_at・apply_error・result_path・result_url・received_at、`UNIQUE(date, slug)`）→ migration `006_intake.sql`・`user_version = 6`
- [`03-api.md`](./03-api.md): §2 のエンドポイント一覧に6行、§3 に DTO
- [`02-data-model.md`](./02-data-model.md) §6: `detail_ref` 語彙に `intake.candidates` を追加（「今日」のタスク行から「あなた待ち」へ入る導線用。対応するルーティン行は人間が「ルーティン」画面から追加する）

## 6. エラー処理

| 事象 | 応答 |
|---|---|
| date 不正・body 検証 NG・不正な状態遷移 | 400 `bad_request`（理由文字列つき） |
| `approved` / `rejected` の行、または `apply_state ≠ pending` の行が1件でもある日への再 POST | 409 `conflict` |
| 存在しない id への decision / apply-result | 404 `not_found` |
| 受信が1件も無い状態での未決一覧 GET | **200**（`items: []` ・ `latestReceivedAt: null`。§3.5） |

## 7. スコープ外

- 候補の抽出・仕分け・原文引用の判断（すべて `daily-harness` の責務）
- **Vault への書き込み・Vault の読み取り**（AGENTS.md ルール1。候補ファイルへの書き戻しは second-brain 側の `sync` が行う → §8）
- **Linear への起票**（承認後の起票は `--apply` の責務。cerebellum は外部サービスを叩かない。ローカル完結の原則 → [`00-overview.md`](./00-overview.md) §1）
- 痛点レーン（[`17`](./17-harness-approval.md) の `/harness` が関門）・種レーン（週次選抜板が関門）・週次反復パターン（表示のみでレーンに流れない）
- 00_Inbox→10_Sources の昇格判断・idea-forge 選抜板（second-brain 側の Phase 2。画面の器は同居できるよう作るが、本仕様では受け取らない）
- 過去日の候補一覧・検索 UI（未決だけを出す。決着した行は DB に残るだけ）

## 8. 送信側の責務（second-brain `daily-harness`・本仕様の範囲外だが契約として明記）

- 抽出直後（00:40）に `POST /api/intake/candidates` で3レーンを送る。**0件の日も空配列で送る**。`deliver_intake.sh`（digest 枠への先置き）はこの経路に差し替える
- 00:40 の実行冒頭に **⓪-1 `sync`（cerebellum の `?status=approved&applyState=pending` を GET → 候補ファイルの該当行を `- [ ]` → `- [x]` に書き換え）→ ⓪-2 `--apply`** の順で直列に置く。既存の `--apply`（`intake_io.py pending` を入力とする形）はこれで無改修のまま動く
- **行の同定は原文一致**で行う（`lineNo` は探索の起点にしてよいが、一致しなければ原文で走査する）。見つからない行はスキップしてログに残し、`apply-result` に `failed` を書き戻す（沈黙＝成功ではない）
- ❌（`rejected`）・未タップ（`proposed`）の行には**触れない**
- ToDo レーンは `--apply` が Linear へ起票し、issue URL を候補ファイルと `apply-result` の `resultUrl` の両方に書き戻す。**現行 `intake_io.py` の適用レーンは考え・口調のみ**なので、ToDo を機械適用の対象に加える改修が要る（`APPLY_LANES` の拡張）
- 適用の成否は必ず `POST .../apply-result` で書き戻す（失敗も書く）

## 9. 関連仕様

- 画面: [`23-web-waiting.md`](./23-web-waiting.md)
- 同型の先例（承認 → 翌日の無人適用 → 結果の書き戻し）: [`17-harness-approval.md`](./17-harness-approval.md)
- 取り込みパターンの先例: [`11-digest.md`](./11-digest.md)／外部が結果を読み戻す先例: [`14-learning.md`](./14-learning.md) §3.4
- 契約の正本（second-brain 側）: Vault `85_定義/daily取り込み.md`

## 実装単位

- [ ] [Backend] migration `006_intake.sql`（`intake_days` / `intake_candidates`・`user_version=6`）＋ `02-data-model.md` への追記
  - 受け入れ基準: ハーネス migration 適用済みの DB（user_version=5）に適用できるテストと、`UNIQUE(date, slug)` 違反が検知されるテストが通る。`make verify` PASS
- [ ] [Backend] `domain/intake.rs`（候補・状態遷移の検証と `slug` 算出。I/O 依存ゼロ）
  - 受け入れ基準: 検証ルールのテストが通る——必須欠落・`lane` 不正・61件以上・`slug` 重複・サイズ超過（256KiB / text 2KiB）の拒否、**空配列の受理**、`apply_state ≠ pending` 行への decision 拒否、`status ≠ approved` 行への apply-result 拒否、`proposed ⇄ approved / rejected` の往復可、`slug` が `sha1(date|lane|text)` 先頭12桁であること。`make verify` PASS
- [ ] [Backend] `usecase/manage_intake.rs`（取り込み・承認記録・適用待ち抽出・結果書き戻し）
  - 受け入れ基準: テストが通る——同一 date 再送の一括置換（1トランザクション）／`approved`・`rejected`・`apply_state≠pending` を含む日への再送 409／items 空でも `intake_days` に行が作られる／未決抽出が日付を問わず新しい順／適用待ち抽出が日付を問わず古い順／`failed` → `applied` の再送上書き。`make verify` PASS
- [ ] [Backend] `infra/api` に6エンドポイント追加＋ `03-api.md` への追記
  - 受け入れ基準: HTTP 契約の結合テストが通る——取り込み→未決一覧→decision→適用待ち抽出→apply-result の一連、エラー表（400/404/409）、受信ゼロでの未決一覧が 200 で `latestReceivedAt: null`、`latestItemCount` が 0件取り込み後に 0 を返す。`make verify` PASS
