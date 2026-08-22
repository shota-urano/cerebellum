---
status: confirmed
confirmed_rev: 9db4adc
---

# 14. 学習セットの取り込み・成績記録仕様（domain・usecase・API）

**親**: [`00-overview.md`](./00-overview.md) ｜ **担当**: Backend ｜ **範囲**: `domain/learning.rs`・`usecase/manage_learning.rs`・`infra/api`（`/api/learning`）

## 1. 目的

second-brain の `night-study` が平日朝に生成する学習3点セット（レッスン→問題→解答）を cerebellum に取り込み、「今日」のタスク「40_Projectsにて新たな学習」から一本道で消化できるようにする。自己採点（○△×）と当日の感想を記録し、それを night-study が翌晩読んで生成を適応させる——今は手動の「学習ログ1行」で途切れがちな適応ループを、ワンタップ記録で閉じるのが本命。

生成そのものは cerebellum の責務ではない。**cerebellum は受け取って保存し、返して、成績を預かるだけ**（digest [`11`](./11-digest.md) と同じ分界）。

**正本の移管（2026-07-29 決定）**: 学習コンテンツと成績の正本は Vault `40_Projects/learning/` → cerebellum SQLite に移す。学習は自己完結ループで Vault の他回路（/ask・consolidate 等）から実参照が無いことを確認済み。Vault に残るのは人間が書く契約 `85_定義/学習テーマ.md` のみ。

## 2. 入出力

- **入力**: `POST /api/learning/sets`（body に date とセット JSON）。送信元は second-brain の `night-study` skill（生成後に送る）
- **出力**: `GET /api/learning/sets/{date}`（`today` 可）
- **成績**: `POST /api/learning/sets/{date}/result`（自己採点・感想）／`GET /api/learning/sets/{date}/result`（night-study が翌晩の適応に読む）
- **依存ポート**: `LearningRepository`（`learning_sets` / `learning_results` の読み書き）・`Clock`

## 3. 処理詳細

### 3.1 セット JSON の形

HTTP DTO の具体形は [`03-api.md`](./03-api.md) §3 を正とする。

- `theme` は学習テーマ、`lessonMd` は完全初学者向けのレッスン本文
- `problems` は1〜10件。各問題の `no` は問題番号、`questionMd` は問題文、`answerMd` は解答（正解＋解説。採点画面で表示する）
- 必須: `theme`・`lessonMd`・`problems[]`（各 `no`・`questionMd`・`answerMd`）
- `source` は `theme`（学習テーマ契約由来）| `memo`（メモキュー由来。将来拡張）。省略時 `theme`
- `kind` は `quiz`（画面内で答える）| `code`（ターミナルで解く）。省略時 `quiz`
- `workdir` は code 問題の作業ディレクトリ（Vault 外のローカルパス）。**サーバはパスにアクセスしない**——画面がコピー用に表示するだけ
- `closingMd` は学習セット末尾のまとめ。任意
- **自動採点フィールド（2026-07-31 追加・USL-282）**: `answerType` は `choice`（選択式）| `number`（数値比較）| `text`（正規化して文字列比較）。**省略時は従来どおり自己採点**（後方互換——`answerType` の無い問題・code 問題は画面が自己採点にフォールバックする）。`expected` は機械比較用の正解（`answerType` 指定時は必須）。`choices` は選択肢（`choice` のとき必須・2〜6件・重複不可・`expected` はそのいずれかと完全一致）。**比較の実行は画面側**（[`15`](./15-web-learning.md) §3.3）——サーバは形式検証と保存のみ

### 3.2 取り込み（save_learning_set）

1. `date` は `%Y-%m-%d` または `today`（`Clock` で解決）。それ以外は `bad_request`
2. body はサイズ上限 256KiB。必須フィールド欠落・`problems` 空・`no` 重複・自動採点フィールドの不整合（`answerType` 語彙外／`expected` 欠落／`choices` の件数・重複・`expected` 不一致／`number` なのに数値でない——具体則は [`03-api.md`](./03-api.md) §3 を正とする）は `bad_request`——**digest と違い崩れた入力は保存しない**。学習セットは構造が本体であり、壊れたまま画面に出すと「今日の学習」が壊れた体験になる。失敗は送信側（night-study）が🚨通知する契約（沈黙しない）
3. 同じ date は UPSERT（再生成・再送で上書き）。`received_at` は `Clock`

### 3.3 成績記録（save_learning_result）

HTTP DTO の具体形は [`03-api.md`](./03-api.md) §3 を正とする。

1. `grade` は `o` | `d` | `x`（○△×）。`grades` の `no` はセットの `problems` と突き合わせ、不明な `no` は `bad_request`。全問分なくてもよい（途中まで採点も受ける）
2. `feeling` は ≤2000 文字・空可
3. `grades[].answer` は任意・≤500 文字——自動採点時のユーザー回答入力。night-study が翌晩の適応で「何をどう間違えたか」まで読めるようにするための素材（自己採点問題では省略される）
4. UPSERT（やり直し・上書き可）。`completed_at` は `Clock`
5. **タスクの消し込みはここではやらない**（画面が既存 `POST /api/days/today/checks/{taskId}` を別途叩く。責務を混ぜない）

### 3.4 適応の読み出し

`GET /api/learning/sets/{date}/result` は記録をそのまま返す（無ければ 404）。night-study は翌晩、前日 date でこれを読み:

- result あり → ×△の問題領域を翌日のセットに混ぜる（**間隔反復は「過去ファイルの見返し」でなく「生成への混ぜ込み」で実現する**。2026-07-29 決定）
- result なし → 既存ルール「前日未着手ならスキップ」を踏襲

## 4. 送信側の責務（second-brain `night-study`・本仕様の範囲外だが契約として明記）

- DTO は [`03-api.md`](./03-api.md) §3 の `camelCase` を正とする
- 生成後 `POST /api/learning/sets` で送る。失敗時は🚨通知（成功時の Slack 📚通知は廃止）
- **全問題に `answerType`・`expected`（choice は `choices` も）を付けて生成する（2026-07-31 決定・USL-282）**。問題文は自己完結（未提示のコード・外部ファイルを前提にしない）
- **新規生成で `kind: "code"` は使わない（同決定）**。cerebellum 側は後方互換のため code と `answerType` 省略の受理・表示を続ける
- code 問題の workdir は Vault 外（例 `~/workspace/learning/YYYY-MM-DD/`）に生成する
- 旧 `40_Projects/learning/exercises/` は移行後アーカイブし、新規生成では使わない
- 契約はこれまでどおり `85_定義/学習テーマ.md` を読む

## 5. インターフェース（実装時に他仕様へ追記するもの）

- [`02-data-model.md`](./02-data-model.md): `learning_sets`（date PK・raw JSON・received_at）／`learning_results`（date PK・grades JSON・feeling・completed_at）
- [`02-data-model.md`](./02-data-model.md) §6: `detailRef` 語彙に `learning.session` を追加（タスク「40_Projectsにて新たな学習」に付与）
- [`03-api.md`](./03-api.md): 上記3エンドポイント

## 6. エラー処理

| 事象 | 応答 |
|---|---|
| date 不正・body 検証 NG | 400 `bad_request`（理由文字列つき） |
| セット未取り込みの date への GET | 404 `not_found`（画面は「今日の学習セットはありません」表示） |
| セット未取り込みの date への result POST | 404 `not_found`（問題番号との突き合わせが成立しない） |
| result 未記録の date への GET | 404 `not_found`（night-study 側は「未着手」と解釈） |

## 7. スコープ外

- セットの生成・LLM 呼び出し（night-study の責務）
- 過去セットの一覧・閲覧 UI（当日集中モデル。過去分は DB に残るだけ）
- verify・コード実行（ターミナルの領分）
- メモキュー（学習インボックス）の受け口 —— `source: "memo"` の予約だけして将来スペックで扱う

## 8. 関連仕様

- 画面: [`15-web-learning.md`](./15-web-learning.md)
- タスク消し込み: [`05-day-usecase.md`](./05-day-usecase.md)
- 取り込みパターンの先例: [`11-digest.md`](./11-digest.md)

## 実装単位

- [x] [Backend] スキーマ追加: `learning_sets` / `learning_results`（migration v4）＋ `detail_ref` 語彙に `learning.session` を追加。[`02-data-model.md`](./02-data-model.md) §2・§5・§6 への追記とセット
  - 受け入れ基準: 既存 DB（user_version=3）に migration が適用できるテストが通り、`learning.session` 以外の未知語彙が `bad_request` になる。`make verify` PASS
- [x] [Backend] 学習セットの取り込み・取得 API（`POST /api/learning/sets`・`GET /api/learning/sets/{date}`）。[`03-api.md`](./03-api.md) への追記とセット
  - 受け入れ基準: 正常系（today 解決含む）／検証エラー（必須欠落・`problems` 空・`no` 重複・256KiB 超 → `bad_request`）／同一 date への再送 UPSERT／未取り込み date の 404 のテストが通る。`make verify` PASS
- [x] [Backend] 成績記録 API（`POST /api/learning/sets/{date}/result`・`GET .../result`）
  - 受け入れ基準: `o|d|x` 検証・未知 `no` の `bad_request`・途中採点の受理・UPSERT（やり直し上書き）・未記録 date の 404 のテストが通る。`make verify` PASS
- [x] [Backend] 自動採点フィールドの受理（2026-07-31・USL-282）: セット取り込みに `answerType` / `expected` / `choices` の検証を追加（§3.1・[`03-api.md`](./03-api.md) §3 の具体則）、成績記録に `grades[].answer`（任意・≤500文字）を追加。保存は raw JSON のまま（migration 不要）（2026-08-01 完了・PR #22）
  - 受け入れ基準: `answerType` 語彙外／`expected` 欠落／`choices` の件数・重複・`expected` 不一致／`number` 非数値 → `bad_request`、省略時（従来形）の受理継続、`answer` 付き result の UPSERT と GET での往復のテストが通る。`make verify` PASS
