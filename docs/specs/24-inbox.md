---
status: confirmed
confirmed_rev: 575ee52
---

# 24. 人間待ち項目（汎用）の受け入れ・決定記録仕様（domain・usecase・API）

**親**: [`00-overview.md`](./00-overview.md) ｜ **担当**: Backend ｜ **範囲**: `domain/inbox.rs`・`usecase/manage_inbox.rs`・`infra/api`（`/api/inbox`）

## 1. 目的

second-brain 側の自動化（ハーネス）が「人間に見てほしいもの」を送る口を**1種類に固定する**。ハーネスを1本足すたびに cerebellum 側で専用の API・テーブル・画面を作る二重工事（[`11`](./11-digest.md)→[`12`](./12-web-digest.md)、[`17`](./17-harness-approval.md)→[`18`](./18-web-harness.md)、[`22`](./22-daily-intake.md)→[`23`](./23-web-waiting.md) がその実例）をやめる。**second-brain 側で skill を作って社員カードを書いた時点で、cerebellum 側は何もせず枠が立つ**のが達成状態。

同時に、Slack へ飛んでいた通知（⚠️異常・週報・完了報告）の届け先をこの口に一本化する（second-brain 側の決定 2026-09-02・Slack は使わない）。

cerebellum の分界は従来どおり。**受け取って表示し、人間の意思を預かり、機械の結果を受け取って見せるだけ**。生成・判定・適用は送信側の責務。

## 2. 入出力

- **入力**: `POST /api/inbox/batches`（1送信元・1業務日ぶんの項目をまとめて送る。**0件の日も送る**）
- **表示**: `GET /api/inbox/items?status=open`（未決を日付問わず新しい順）／`GET /api/inbox/summary`（送信元ごとの最終受信と未決件数）
- **決定**: `POST /api/inbox/items/{id}/decision`（画面のタップ）
- **機械側の読み出し**: `GET /api/inbox/items?source={source}&status=decided&applyState=pending`（決定済み・未適用を古い順）
- **適用結果の書き戻し**: `POST /api/inbox/items/{id}/apply-result`
- **依存ポート**: `InboxRepository`（`inbox_receipts` / `inbox_items`）・`Clock`

## 3. 処理詳細

### 3.1 項目の形

JSON 契約の正本は [`03-api.md`](./03-api.md) §3。ここには検証規則と各フィールドの意味だけを定める。

**batch（1リクエスト）**: `source`・`date`・`items[]`

- `source` は送信元 skill 名（例 `night-harness`・`routine_watchdog`）。**社員名簿（office.json の `employees[].skill`）と同じ文字列**を使う。名簿に無い `source` も受理する（拒否すると新設 skill の初回送信が落ちる）が、画面側は名簿に無い送信元を「名簿未登録」として目立たせる（[`25`](./25-web-inbox.md) §3.4）
- `date` は業務日（`%Y-%m-%d` または `today`）。1送信元・1業務日＝1 batch
- `items` は 0〜100 件。空配列可（0件の受信が「今日は何も無い」の根拠になる → §3.5）

**item（1件）**: `slug`・`kind`・`title` が必須

| フィールド | 必須 | 意味 |
|---|---|---|
| `slug` | ○ | 送信元が付ける一意キー（`UNIQUE(source, date, slug)`）。再送時の同一性判定に使う |
| `kind` | ○ | `approve`（承認する）／`choose`（選ぶ）／`read`（読むだけ）／`alert`（異常）の4値 |
| `title` | ○ | 一覧に出る1行。≤200文字・専門用語なし（送信側の契約。サーバは長さのみ検証） |
| `bodyMd` | — | 詳細本文（markdown・≤128KiB）。**Vault を読まずに画面へ全文を出すために本文ごと預かる**（[`17`](./17-harness-approval.md) §3.1 と同じ理由） |
| `options[]` | `choose` のみ○ | `{id, label}` の 2〜10 件。`choose` 以外で送られたら `bad_request` |
| `refPath` | — | Vault 相対パス。**サーバはアクセスしない**（文字列として預かるだけ） |
| `payload` | — | 送信元が自分で読み戻すための不透明 JSON（≤16KiB）。サーバは中身を解釈しない。適用側が「どの提案だったか」を再同定するために使う |
| `expiresAt` | — | これを過ぎた未決項目は一覧の既定表示から外れる（削除はしない）。週報など鮮度が落ちるもの用 |

**4種類の意味**（画面の見せ方は [`25`](./25-web-inbox.md) §3.2）

| kind | 人間がすること | 機械が読み戻すか |
|---|---|---|
| `approve` | ✅承認 or ❌却下 | 読む（承認行だけを翌回の無人適用が拾う） |
| `choose` | 選択肢から1つ選ぶ or ❌ | 読む（選ばれた `choice` を拾う） |
| `read` | 読んだ印を付ける | 読まない |
| `alert` | 確認した印を付ける | 読まない |

### 3.2 取り込み（save_inbox_batch）

1. `date` 不正・必須欠落・`kind` 不正・`items` 101件以上・`slug` 重複・サイズ超過（body 全体 1MiB／`bodyMd` 1件 128KiB／`payload` 1件 16KiB）は `bad_request`。**崩れた入力は保存しない**（[`14`](./14-learning.md) §3.2・[`17`](./17-harness-approval.md) §3.2 と同じ判断）
2. 受信の記録を `inbox_receipts`（source・date・received_at・item_count）に UPSERT する。**items が空でもこの行は必ず作る**（§3.5 の未着判定の根拠）
3. 同じ `(source, date)` への再送は**その送信元・その日の項目をまとめて置換**（DELETE→INSERT を1トランザクション）。ただし **人間の意思が付いた行（`status` が `approved` / `rejected` / `chosen`）または適用が動いた行（`apply_state ≠ pending`）が1件でもあれば `conflict`（409）**。守るのは人間の判断と機械の適用結果だけ（[`17`](./17-harness-approval.md) §3.2 の「killed は保護しない」と同じ考え）
4. **例外: `read` と `alert` の既読・確認済み（`status = read` / `acknowledged`）は保護しない**。置換されて再び未決として現れる。異常が翌日も鳴っているなら再び目に入るのが正しく、週報が再生成されたなら読み直すのが正しい
5. 取り込み時の初期状態: 全行 `status = "open"`。`apply_state` は `approve` / `choose` が `pending`、`read` / `alert` が `none`
6. `received_at` は `Clock`

### 3.3 決定の記録（save_decision）

1. 許される `status` は kind による:
   - `approve`: `approved` | `rejected` | `open`（取り消し。適用までは何度でも変更可）
   - `choose`: `chosen`（`choice` 必須・`options[].id` のいずれか）| `rejected` | `open`
   - `read`: `read` | `open`
   - `alert`: `acknowledged` | `open`
   - それ以外の組み合わせは `bad_request`
2. `apply_state` が `pending` 以外の行への decision は `bad_request`（適用済みを後から未決には戻せない）
3. `decided_at` は `Clock`。上書きのたびに更新する

### 3.4 適用ループとの接続

**読み出し**: `GET /api/inbox/items?source={source}&status=decided&applyState=pending` が、その送信元の `approved` / `chosen` かつ未適用の行を日付を問わず古い順に返す（`status=decided` は `approved` と `chosen` の合成値。クエリ専用で、保存値ではない）。日付で絞らないのは、承認した翌回に適用されるのが正常動作だから（[`17`](./17-harness-approval.md) §3.4）。

**失敗の読み出し**: `GET /api/inbox/items?applyState=failed` が日付を問わず新しい順に返す（画面の失敗枠の取得元。失敗は人間が気づくまで出し続ける）。

**書き戻し**: `POST /api/inbox/items/{id}/apply-result`

1. `state` は `applied` | `failed`。`failed` のとき `error`（≤1000文字）必須。`resultPath`・`resultUrl` は任意（文字列として預かるだけ）
2. `status` が `approved` / `chosen` 以外の行、`apply_state = none` の行への書き戻しは `bad_request`
3. `applied_at` は `Clock`。再送は上書き（`failed` → 直して再実行 → `applied` を許す）

### 3.5 未着の扱い（沈黙させない）

**「項目が0件」と「今日は送られてこなかった」を機械的に区別する**。根拠は `inbox_receipts`。

`GET /api/inbox/summary` は送信元ごとに `{source, latestDate, latestReceivedAt, latestItemCount, openCount: {approve, choose, read, alert}, failedCount}` を返す。受信が1件も無い送信元は行ごと出ない。

**どの送信元が「今日届いているべきか」はサーバは知らない**。それは社員名簿（office.json の `shift` と `profile.review`）の情報であり、画面側が名簿と summary を突き合わせて「未着」を描く（[`25`](./25-web-inbox.md) §3.3）。サーバは受信の事実だけを持つ。ここが [`17`](./17-harness-approval.md) §3.5・[`22`](./22-daily-intake.md) §3.5 が送信元ごとに個別に作っていた未着判定を、名簿1本に寄せる差分。

## 4. 状態モデル（正本の分界・確定）

**cerebellum が持つのは「人間の意思」と「機械の結果」だけ**。項目の中身の正本は送信元（Vault の判定文・候補ファイル・週報）。

| 列 | 誰が書くか | 値 |
|---|---|---|
| `status` | 人間（画面） | `open` → kind ごとの決定値（§3.3）。適用前は往復可 |
| `apply_state` | 機械（送信元の無人適用） | `none`（読み戻し無し）／`pending` → `applied` / `failed` |

## 5. インターフェース（実装時に他仕様へ追記するもの）

- [`02-data-model.md`](./02-data-model.md): `inbox_receipts`（source・date・received_at・item_count、`PRIMARY KEY(source, date)`）と `inbox_items`（id PK・source・date・slug・kind・title・body_md・options_json・ref_path・payload_json・expires_at・status・choice・decided_at・apply_state・applied_at・apply_error・result_path・result_url・received_at、`UNIQUE(source, date, slug)`）→ migration `007_inbox.sql`・`user_version = 7`（**[`22`](./22-daily-intake.md) 用の `006_intake.sql` は 2026-09-02 に main へ出荷済み（v6）**。本仕様は v7 を使う → §8）
- [`02-data-model.md`](./02-data-model.md) §6: `detail_ref` 語彙に `inbox.items` を追加（「今日」のタスク行から「あなた待ち」へ入る導線。`intake.candidates` は追加しない）
- [`03-api.md`](./03-api.md): §2 に6エンドポイント、§3 に DTO

## 6. エラー処理

| 事象 | 応答 |
|---|---|
| date 不正・body 検証 NG・kind と status の不整合・`choose` 以外への `options`・`choice` が options に無い | 400 `bad_request`（理由文字列つき） |
| 人間の判断（approved / rejected / chosen）または `apply_state ≠ pending` の行がある `(source, date)` への再 POST | 409 `conflict` |
| 存在しない id への decision / apply-result | 404 `not_found` |
| 受信ゼロでの一覧・summary GET | **200**（空配列。§3.5） |

## 7. スコープ外

- 項目の生成・判定・適用（すべて送信元の責務）
- **Vault への書き込み・読み取り**（AGENTS.md ルール1。本文は `bodyMd` として預かる）
- 通知のプッシュ（画面を見に行く運用。プッシュは Phase 2 の通知と一体で設計する）
- **学習セット**（[`14`](./14-learning.md)・[`15`](./15-web-learning.md)）。出題・回答・自動採点という固有の構造を持つので本仕様に畳まない。人間待ちの4種類に当てはまらない唯一の例外として専用のまま残す
- **人間だけの日課**（`routines` / `task_days`）。AI と無関係のため無変更
- 過去日の項目の検索 UI（未決だけを出す。決着した行は DB に残るだけ）

## 8. 既存仕様との関係（移行）

| 仕様 | 扱い |
|---|---|
| [`22`](./22-daily-intake.md)・[`23`](./23-web-waiting.md) daily取り込み | **出荷せず本仕様に畳む**。2026-09-02 時点の実態: Backend（`manage_intake.rs`・`006_intake.sql`）と Frontend（`features/waiting/` 548行）が**作業ツリーに未コミットで存在**、本番 :48210 には未デプロイ（`/api/intake` は 404）、送信側 daily-harness も未接続（`deliver_intake.sh` は digest 枠へ送っている）。専用 API として出荷するとまた1本ぶんの二重工事を固定するので、**この未コミット実装を汎用化の素材にして `/api/inbox` と `features/inbox/` に作り替える**（状態モデルは同じ3値なので流用できる）。`todo` / `thought` / `tone` の3レーンは `kind: approve`・`source: daily-harness` の項目になり、レーン名は `payload.lane` で運ぶ。§3.5 の未着判定は名簿経由に置き換わる。両ファイルは status を `superseded` にして残す（判断の履歴のため削除しない） |
| [`17`](./17-harness-approval.md)・[`18`](./18-web-harness.md) ハーネス承認 | **稼働中のため後から移す**。night-harness 側の deliver.py / apply_io.py が `/api/inbox` を叩くよう改修し、並行稼働で1週間確認してから `/api/harness` と `/harness` 画面を撤去する。`verdict` / `challengeVerdict` / `category` / `detailPath` は `payload` で運び、`summary` → `title`、`detailMd` → `bodyMd`。`killed` 行は `kind: read` で送る（人間の承認対象ではなく表示だけ、という 17 §3.3-2 の意味を kind で表す） |
| [`11`](./11-digest.md)・[`12`](./12-web-digest.md) ダイジェスト | 送信元 daily-digest が 2026-09-01 に廃止済み。**新規の受信は無い**。テーブルと画面は過去分の閲覧用に残し、次の棚卸しで撤去を判定する |
| [`13`](./13-web-nightshift.md)・[`19`](./19-web-dev-history.md) 夜勤 | 夜勤の朝レポ（Slack 送信）は `kind: read` の項目として本口へ送る。夜勤ビューア（:48310）は run 詳細の置き場として残す |
| [`14`](./14-learning.md)・[`15`](./15-web-learning.md) 学習 | 無変更（§7） |
| [`20`](./20-web-office.md)・[`21`](./21-web-office-roster.md) オフィス | 名簿に `profile.review` が増える（§9）。画面は「人間確認あり」の社員に印を出す程度の追補 |

**最初の送信元は second-brain の routine_watchdog.py（`kind: alert`）**。理由は3つ。項目が最も単純（title だけで成立）・読み戻しが無い・いま監視が止まっていて最も急ぐ。

## 9. 送信側の責務（second-brain・本仕様の範囲外だが契約として明記）

- 人間の確認が要る skill は、`SKILL.md` frontmatter の `office:` ブロックに機械可読の `review` を書く。**名簿の正本は frontmatter・運び手は `build_office.py`**（[`21`](./21-web-office-roster.md) §4 と同じ原則。cerebellum に対応表を持たない）:

  ```yaml
  office:
    review:
      kinds: [approve]      # この skill が送る kind（複数可）
      cadence: shift        # shift = 勤務帯どおりに毎回届くべき（未着判定の対象）／ adhoc = 不定期（未着判定しない）
  ```

  `review` が無い skill は「人間確認なし」。**カードが書けない一体は編成に載せない**（second-brain `85_定義/ハーネス組織.md` 社員カード節）
- 実行のたびに `POST /api/inbox/batches` を1回送る。**0件でも送る**（受信の事実が未着判定の根拠）
- `approve` / `choose` を送る skill は、次回実行の冒頭で `GET ?source=自分&status=decided&applyState=pending` を読み、適用し、成否を必ず `apply-result` に書き戻す（失敗も書く。沈黙＝成功ではない）
- Slack へ送っていた工程（⚠️・週報・完了報告）は本口の `alert` / `read` に差し替える。差し替え対象は 2026-09-02 時点で11 skill（second-brain 側の工事一覧に記載）
- 異常の送信元（watchdog）は、自分自身が落ちたときに誰も気づけない。**watchdog の未着**は名簿の `cadence: shift` による画面側の未着表示（[`25`](./25-web-inbox.md) §3.3）で拾う。これが層1の監視を監視する唯一の経路

## 10. 関連仕様

- 画面: [`25-web-inbox.md`](./25-web-inbox.md)
- 同型の先例（承認 → 翌回の無人適用 → 結果の書き戻し）: [`17-harness-approval.md`](./17-harness-approval.md)
- 名簿の運び手: [`21-web-office-roster.md`](./21-web-office-roster.md) §4・§9
- 契約の正本（second-brain 側）: Vault `85_定義/ハーネス組織.md`「人間との接点」節

## 実装単位

- [ ] [Backend] migration `007_inbox.sql`（`inbox_receipts` / `inbox_items`・`user_version=7`）＋ `02-data-model.md` への追記（§6 語彙 `inbox.items` を含む）
  - 受け入れ基準: ハーネス migration 適用済みの DB（user_version=5）に適用できるテストと、`UNIQUE(source, date, slug)`・`PRIMARY KEY(source, date)` 違反が検知されるテストが通る。`make verify` PASS
- [ ] [Backend] `domain/inbox.rs`（項目・kind 別の状態遷移の検証。I/O 依存ゼロ）
  - 受け入れ基準: 検証ルールのテストが通る——必須欠落・kind 不正・101件以上・slug 重複・サイズ超過の拒否、**空配列の受理**、`choose` 以外への `options` 拒否、`choice` が options 外の拒否、kind ごとの許可 status 表（§3.3-1）の全組み合わせ、`apply_state ≠ pending` 行への decision 拒否、`apply_state = none` 行への apply-result 拒否。`make verify` PASS
- [ ] [Backend] `usecase/manage_inbox.rs`（取り込み・決定記録・決定済み抽出・結果書き戻し・summary）
  - 受け入れ基準: テストが通る——同一 `(source, date)` 再送の一括置換（1トランザクション）／approved・rejected・chosen・`apply_state≠pending` を含む日への再送 409／**read・acknowledged のみの日は置換成功して open に戻る**／items 空でも `inbox_receipts` に行が作られる／未決抽出が日付を問わず新しい順で `expiresAt` 超過を既定で除外／決定済み抽出が source で絞れて古い順／summary が送信元ごとに最終受信と kind 別未決件数を返す。`make verify` PASS
- [ ] [Backend] `infra/api` に6エンドポイント追加＋ `03-api.md` への追記
  - 受け入れ基準: HTTP 契約の結合テストが通る——batch→未決一覧→decision→決定済み抽出→apply-result の一連（approve と choose の両方）、alert の acknowledged→再送で open に戻る、エラー表（400/404/409）、受信ゼロでの一覧・summary が 200 で空。`make verify` PASS
