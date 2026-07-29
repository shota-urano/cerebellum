---
status: confirmed
confirmed_rev: 9db4adc
---

# 17. ハーネス取り込み提案の受け入れ・承認記録仕様（domain・usecase・API）

**親**: [`00-overview.md`](./00-overview.md) ｜ **担当**: Backend ｜ **範囲**: `domain/harness.rs`・`usecase/manage_harness.rs`・`infra/api`（`/api/harness`）

## 1. 目的

second-brain の `night-harness` が毎朝出す「ハーネス取り込み判定」3件を cerebellum に取り込み、**画面でチェックした承認だけを、翌朝の無人 `--apply` が読んで適用する**ループを閉じる。

いまは Slack に投稿 → 人間が✅ → 人間が手で `/night-harness --apply` 起動 → **✅の内容をターミナルで入力し直す**（AskUserQuestion）という二度手間になっている。承認の意思を機械可読な場所に置けば、人間の操作は画面のタップ1回で終わる。

生成・判定・適用そのものは cerebellum の責務ではない。**cerebellum は受け取って表示し、承認の意思を預かり、適用結果を受け取って見せるだけ**（digest [`11`](./11-digest.md)・学習 [`14`](./14-learning.md) と同じ分界）。

**Slack の廃止（2026-07-29 決定）**: 本仕様の実装をもって night-harness の Slack 投稿（`scripts/post.py`）は停止し、平常・異常とも通知先を cerebellum に一本化する。「沈黙＝成功ではない」原則は、Slack の⚠️ではなく **§3.5 の未着表示**（不在を画面に出す）で担保する。

## 2. 入出力

- **入力**: `POST /api/harness/proposals`（その日の判定 3 件をまとめて送る）。送信元は second-brain の `night-harness` skill
- **表示**: `GET /api/harness/proposals?date={date}`（`today` 可）
- **承認**: `POST /api/harness/proposals/{id}/decision`（画面のタップ）
- **適用側の読み出し**: `GET /api/harness/proposals?status=approved&applyState=pending`（翌朝の無人 `--apply` が読む）
- **適用結果の書き戻し**: `POST /api/harness/proposals/{id}/apply-result`（成功・失敗とも）
- **依存ポート**: `HarnessRepository`（`harness_proposals` の読み書き）・`Clock`

## 3. 処理詳細

### 3.1 提案 JSON の形

```json
{
  "date": "2026-07-29",
  "kind": "daily",
  "proposals": [
    {
      "slug": "検索状態外置き",
      "insightName": "検索状態のハーネス外置きで20Bが長期検索でフロンティア級に届く",
      "verdict": "experiment",
      "category": "⑥実験（新機軸）",
      "summary": "Vaultを調べるとき、AIに全部覚えさせるのをやめて外にメモ帳を置く方式を試す",
      "detailPath": "40_Projects/harness/判定/2026-07-29-検索状態外置き.md",
      "detailMd": "...(判定文の全文 markdown)..."
    }
  ]
}
```

- 必須: `date`・`proposals[]`（1〜30件、各 `slug`・`insightName`・`verdict`・`summary`・`detailMd`）
- `kind` は `daily`（毎朝の取り込み判定・省略時これ）| `prune`（月次の資産剪定）| `model_switch`（モデル乗り換え時の補助輪点検）。**3モードはどれも「提案 → 承認 → 適用」で形が同じなので同じテーブルに載せる**。件数上限が30件なのは剪定がアーカイブ候補を十数件出すため
- `kind` が `daily` 以外のとき `insightName` には資産名（skill 名・script 名など）を入れる
- `verdict` は `adopt`（🟢採用提案）| `experiment`（🧪実験提案）| `killed`（⚫️見送り）
- `summary` は判定文の「一言でいうと」。**≤200文字・専門用語なし**が送信側の契約（night-harness SKILL.md「判定文の書き方」）。サーバは長さのみ検証する
- `detailMd` は判定文の全文。**Vault を読まずに画面へ全文を出すために本文ごと預かる**（AGENTS.md ルール1「`serve` は Vault を参照しない」を守るため。digest が原文を預かるのと同じ理由）
- `detailPath` は Vault 相対パス。`--apply` がパッチ案を読む先であり、**サーバはこのパスにアクセスしない**（学習仕様の `workdir` と同じ扱い）
- `category` は6分類の文字列。`verdict: "killed"` のときは省略可

### 3.2 取り込み（save_harness_proposals）

1. `date` は `%Y-%m-%d` または `today`（`Clock` で解決）。それ以外は `bad_request`
2. body はサイズ上限 512KiB（`detailMd` は1件 128KiB まで）。必須欠落・`proposals` 空・`slug` 重複は `bad_request`——**崩れた入力は保存しない**（学習 [`14`](./14-learning.md) §3.2 と同じ判断。承認は構造が本体であり、壊れたまま出すと誤承認を招く）
3. 同じ `date` への再送は**その日の行をまとめて置換**（DELETE→INSERT を1トランザクション）。ただし **`status` が `proposed` 以外の行が1件でもあれば `conflict`（409）で拒否**——承認済み・適用済みの意思を再送で消さないため
4. 取り込み時の初期状態: `verdict` が `killed` の行は `status = "killed"`、それ以外は `status = "proposed"`。`apply_state` は全行 `pending`
5. `received_at` は `Clock`

### 3.3 承認の記録（save_decision）

```json
{ "status": "approved" }
```

1. `status` は `approved` | `rejected` | `proposed`（**取り消し＝`proposed` に戻す**。誤タップの救済路。翌朝の適用までは何度でも変更できる）
2. `status = "killed"` の行への decision は `bad_request`（見送り判定は人間の承認対象ではない・表示のみ）
3. `apply_state` が `pending` 以外の行への decision も `bad_request`（適用済みを後から未承認にはできない）
4. `decided_at` は `Clock`。上書きのたびに更新する

### 3.4 適用ループとの接続

**読み出し**: `GET /api/harness/proposals?status=approved&applyState=pending` が、日付を問わず適用待ちの行を古い順に返す。日付で絞らないのは、**承認した翌朝に適用される（＝別日の行を拾う）のが正常動作**だから。

**書き戻し**: `POST /api/harness/proposals/{id}/apply-result`

```json
{ "state": "applied", "snapshotPath": "40_Projects/harness/archive/2026-07-30-検索状態外置き/" }
{ "state": "failed",  "error": "state.py の配置先が既に存在し上書きを避けて中断" }
```

1. `state` は `applied` | `failed`。`failed` のとき `error`（≤1000文字）必須
2. `status = "approved"` 以外の行への書き戻しは `bad_request`
3. `applied_at` は `Clock`。再送は上書き（`failed` → 手で直して再実行 → `applied` の遷移を許す）

### 3.5 未着の扱い（沈黙させない）

`GET /api/harness/proposals?date=today` は、**まだ届いていない日も 404 ではなく 200 で `receivedAt: null` ・ `proposals: []` を返す**。「提案が0件」と「今朝届いていない」を画面で描き分けるため（night-harness は3件全 killed の日も3件送るので、**空配列＝異常**）。

これが Slack の⚠️通知に代わる異常検知路になる。night-harness 自身が壊れて POST 自体が飛ばなかった場合も、この経路でだけ気づける。

## 4. 状態モデル（正本の分界・確定）

**cerebellum が持つのは「人間の意思」と「機械の結果」だけ**。判定の中身と適用の履歴は Vault 側（`40_Projects/harness/取り込み台帳.md`）が正本であり、二重管理しない。

| 列 | 誰が書くか | 値 |
|---|---|---|
| `status` | 人間（画面） | `proposed` → `approved` / `rejected`（相互に往復可）／`killed`（取り込み時に確定・変更不可） |
| `apply_state` | 機械（`--apply`） | `pending` → `applied` / `failed` |

- `rejected` と `killed` は**別物**。`killed` は night-harness が判定として却下したもの、`rejected` は人間が承認しなかったもの
- Vault 台帳には従来どおり適用の中身とロールバック手順を記録する。cerebellum の `apply_state` は「成否と、失敗理由と、スナップショットの置き場所」までしか持たない

## 5. インターフェース（実装時に他仕様へ追記するもの）

- [`02-data-model.md`](./02-data-model.md): `harness_proposals`（id PK・date・slug・insight_name・verdict・category・summary・detail_path・detail_md・status・decided_at・apply_state・applied_at・apply_error・snapshot_path・received_at、`UNIQUE(date, slug)`）→ migration `005_harness.sql`・`user_version = 5`（**v4 は学習 [`14`](./14-learning.md) が使用**。2026-07-29 に採番衝突を解消）
- [`02-data-model.md`](./02-data-model.md) §6: `detail_ref` 語彙に `harness.proposals` を追加（「今日」からハーネス画面へ入る導線用。対応するルーティン行は人間が「ルーティン」画面から追加する）
- [`03-api.md`](./03-api.md): §3 の5エンドポイントと DTO

## 6. エラー処理

| 事象 | 応答 |
|---|---|
| date 不正・body 検証 NG・不正な状態遷移 | 400 `bad_request`（理由文字列つき） |
| 承認済み・適用済みがある日への再 POST | 409 `conflict` |
| 存在しない id への decision / apply-result | 404 `not_found` |
| 未着の date への一覧 GET | **200**（`receivedAt: null` ・ `proposals: []`。§3.5） |

## 7. スコープ外

- 判定の生成・候補選定・パッチ適用（すべて night-harness の責務）
- **Vault への書き込み・Vault の読み取り**（AGENTS.md ルール1。判定文は `detailMd` として預かる）
- 適用前スナップショットの取得そのもの（night-harness 側の責務。cerebellum は置き場所の文字列を預かるだけ → §8）
- 通知・プッシュ（画面を見に行く運用。Phase 2 の通知と一体で設計する）
- 過去日の提案一覧・検索 UI（当日集中モデル。過去分は DB に残るだけ）

## 8. 送信側の責務（second-brain `night-harness`・本仕様の範囲外だが契約として明記）

- 判定後に `POST /api/harness/proposals` で3件送る。`scripts/post.py`（Slack）は廃止
- **`--apply` は無人 cron 化する**（判定 06:40 の前・06:20 を推奨。適用後の状態でその日の判定が走るため）。AskUserQuestion による承認確認は撤去し、`GET /api/harness/proposals?status=approved&applyState=pending` を承認の入力とする
- **適用前に、変更対象ファイルを `40_Projects/harness/archive/YYYY-MM-DD-<slug>/` へコピーする**（Vault も `~/.claude` も git 管理外＝無人適用は他に復旧手段が無い。2026-07-29 決定）。コピー先を `snapshotPath` として書き戻す
- 適用の成否は必ず `POST .../apply-result` で書き戻す（失敗も書く。沈黙＝成功ではない）
- 判定全文と台帳（`40_Projects/harness/判定/`・`取り込み台帳.md`）はこれまでどおり Vault 側に残す

## 9. 関連仕様

- 画面: [`18-web-harness.md`](./18-web-harness.md)
- 取り込みパターンの先例: [`11-digest.md`](./11-digest.md)／外部が結果を読み戻す先例: [`14-learning.md`](./14-learning.md) §3.4
- タスクからの導線: [`12-web-digest.md`](./12-web-digest.md)

## 実装単位

- [ ] [Backend] migration `005_harness.sql`（`harness_proposals`・`user_version=5`。v4 は学習 [`14`](./14-learning.md)）＋ `02-data-model.md` への追記
  - 受け入れ基準: 学習 migration 適用済みの DB（user_version=4）に migration が適用できるテストと、`UNIQUE(date, slug)` 違反が検知されるテストが通る。`make verify` PASS
- [ ] [Backend] `domain/harness.rs`（提案・状態遷移の検証。I/O 依存ゼロ）
  - 受け入れ基準: 検証ルールのテストが通る——必須欠落・`proposals` 空・`slug` 重複・サイズ超過（512KiB / detailMd 128KiB）の拒否、`killed` 行への decision 拒否、`apply_state ≠ pending` 行への decision 拒否、`status ≠ approved` 行への apply-result 拒否、`proposed ⇄ approved / rejected` の往復可。`make verify` PASS
- [ ] [Backend] `usecase/manage_harness.rs`（取り込み・承認記録・適用待ち抽出・結果書き戻し）
  - 受け入れ基準: テストが通る——同一 date 再送の一括置換（1トランザクション）／`status ≠ proposed` の行がある日への再送 409／`killed` は取り込み時に `status=killed`／適用待ち抽出が日付を問わず古い順／`failed` → `applied` の再送上書き。`make verify` PASS
- [ ] [Backend] `infra/api` に5エンドポイント追加＋ `03-api.md` への追記
  - 受け入れ基準: HTTP 契約の結合テストが通る——取り込み→一覧→decision→適用待ち抽出→apply-result の一連、エラー表（400/404/409）、未着日の `GET ?date=today` が 200 で `receivedAt: null`・`proposals: []`。`make verify` PASS
