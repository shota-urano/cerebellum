---
status: confirmed
confirmed_rev: d1af7ce
---

# 03. API 契約仕様（整合性アンカー）

**親**: [`00-overview.md`](./00-overview.md) ｜ **担当**: 共通（Rust が実装・Web が消費） ｜ **範囲**: エンドポイント・DTO・エラーレスポンス

## 1. 目的

Rust（axum）と Next.js（`shared/api/types.ts` に手動同期）が共有する HTTP 契約を1か所に固定する。DTO は `camelCase`。

## 2. エンドポイント一覧

| メソッド | パス | 内容 | 実装仕様 |
|---|---|---|---|
| GET | `/api/days/{date}` | その日のタスク＋チェック状態。`{date}`=`today` 可。過去日は `readonly:true` | [05](./05-day-usecase.md) |
| POST | `/api/days/today/checks/{taskId}` | チェックのトグル。当日以外は 403 | [05](./05-day-usecase.md) |
| GET | `/api/summary?days=7` | 直近N日の消化率サマリ | [05](./05-day-usecase.md) |
| GET | `/api/routines` | ルーティン表マスタの一覧（既定 `active=1` のみ） | [05](./05-day-usecase.md) |
| POST | `/api/routines` | ルーティン行の追加 | [05](./05-day-usecase.md) |
| PUT | `/api/routines/{id}` | ルーティン行の更新 | [05](./05-day-usecase.md) |
| DELETE | `/api/routines/{id}` | ルーティン行の削除（論理削除） | [05](./05-day-usecase.md) |
| POST | `/api/digests` | 朝ダイジェストの取り込み（second-brain の deliver.sh が送る） | [11](./11-digest.md) |
| GET | `/api/digests/{date}` | その日のダイジェスト（構造化済み）。`{date}`=`today` 可 | [11](./11-digest.md) |
| POST | `/api/learning/sets` | 学習セットの取り込み（second-brain の night-study が送る） | [14](./14-learning.md) |
| GET | `/api/learning/sets/{date}` | その日の学習セット。`{date}`=`today` 可 | [14](./14-learning.md) |
| POST | `/api/learning/sets/{date}/result` | その日の自己採点・感想を記録。`{date}`=`today` 可 | [14](./14-learning.md) |
| GET | `/api/learning/sets/{date}/result` | 記録済みの自己採点・感想を取得。`{date}`=`today` 可 | [14](./14-learning.md) |
| POST | `/api/harness/proposals` | ハーネス取り込み提案を日単位で取り込む | [17](./17-harness-approval.md) |
| GET | `/api/harness/proposals?date={date}` | その日のハーネス取り込み提案。`date`=`today` 可・省略時は `today` | [17](./17-harness-approval.md) |
| GET | `/api/harness/proposals?status=approved&applyState=pending` | 日付を問わず承認済み・適用待ちの提案を古い順で取得 | [17](./17-harness-approval.md) |
| GET | `/api/harness/proposals?applyState=failed` | 日付を問わず適用失敗の提案を新しい順で取得（画面の「未処理の失敗」枠。2026-07-29 追加） | [17](./17-harness-approval.md) |
| POST | `/api/harness/proposals/{id}/decision` | ハーネス取り込み提案への承認意思を記録 | [17](./17-harness-approval.md) |
| POST | `/api/harness/proposals/{id}/apply-result` | ハーネス取り込み提案の適用結果を書き戻す | [17](./17-harness-approval.md) |
| POST | `/api/intake/candidates` | daily取り込み候補を日単位で取り込む（**0件の日も送る**） | [22](./22-daily-intake.md) |
| GET | `/api/intake/candidates?status=proposed` | 未決の候補を日付問わず新しい順で取得（「あなた待ち」画面の本体） | [22](./22-daily-intake.md) |
| GET | `/api/intake/candidates?status=approved&applyState=pending` | 日付を問わず承認済み・適用待ちの候補を古い順で取得 | [22](./22-daily-intake.md) |
| GET | `/api/intake/candidates?applyState=failed` | 日付を問わず反映失敗の候補を新しい順で取得 | [22](./22-daily-intake.md) |
| POST | `/api/intake/candidates/{id}/decision` | daily取り込み候補への承認意思を記録 | [22](./22-daily-intake.md) |
| POST | `/api/intake/candidates/{id}/apply-result` | daily取り込み候補の反映結果を書き戻す | [22](./22-daily-intake.md) |
| GET | `/api/health` | 自己診断（DB 可否・マスタ件数） | [06](./06-cli-serve.md) |
| GET | 上記以外 | 静的アセット配信＋SPA フォールバック | [06](./06-cli-serve.md) |

`/api/routines` は**マスタ（正本）**を、`/api/days/{date}` は**その日の確定済みスナップショット**を返す。前者を編集しても後者の当日分は変わらない（[`02-data-model.md`](./02-data-model.md) §4）。

## 3. DTO（確定形）

```jsonc
// GET /api/days/2026-07-25   （"today" も可）
{
  "date": "2026-07-25",
  "weekday": "土",                    // "月火水木金土日" の1文字
  "readonly": false,                  // 当日のみ false
  "progress": { "done": 2, "total": 9 },
  "tasks": [                          // sort_no 順
    { "id": "147dfc65051e", "time": "7:30", "effort": "", "tool": "slack",
      "content": "つながり発見", "done": true,
      "checkedAt": "2026-07-25T08:01:00+09:00",   // 未チェック時は null
      "detailRef": "digest.connection" }          // 詳細ビューへの結び付け。無ければ null
  ]
}

// POST /api/days/today/checks/{taskId} → 200（上と同形を返す）

// GET /api/summary?days=7
{ "days": [ { "date": "2026-07-25", "done": 2, "total": 9 } ] }
// スナップショットが存在する日のみ返す（記録なしの日は含めない。
// 表示側の扱いは 09-web-history.md）

// GET /api/routines            （既定は active のみ。?includeInactive=true で削除済みも含む）
{
  "routines": [                       // id 昇順
    { "id": 1, "interval": "毎日", "time": "7:30", "effort": "", "tool": "slack",
      "content": "つながり発見", "active": true,
      "updatedAt": "2026-07-27T09:00:00+09:00" }
  ]
}

// POST /api/routines   body: { interval, time, effort, tool, content }
// PUT  /api/routines/{id}  body: 同上（全項目を送る。部分更新はしない）
// → 200 で単体を返す: { "routine": { ...上と同じ形... } }

// DELETE /api/routines/{id} → 200 { "routine": { ...active:false... } }

// POST /api/digests   body: { "date": "2026-07-27", "body": "<Slack mrkdwn の原文>" }
// → 200 { "date": "2026-07-27", "receivedAt": "2026-07-27T07:37:00+09:00" }
//   date は "today" 可。同じ date への再送は上書き

// GET /api/digests/2026-07-27   （"today" も可）
{
  "date": "2026-07-27",
  "receivedAt": "2026-07-27T07:37:00+09:00",
  "sections": [                       // 受信原文の出現順。まだ届いていない日は []
    {
      "kind": "connection",           // connection | derive | idea | consolidate | preamble | other
      "title": ":brain: *つながり*",  // 見出し行の原文（preamble は null）
      "blocks": [
        { "kind": "lead",  "text": "自作ハーネスをどう強くするか（夜間の自己改善ループを回している）" },
        { "kind": "chain", "text": "賢いモデルには足場を\"足す\"より過剰な誘導を\"削る\"が効く（発展）",
          "notePath": "20_Insights/賢いモデルには足場を足すより過剰な誘導を削るほうが効く.md" },
        { "kind": "text",  "text": "この線の意味: ハーネス投資は…" }
      ]
    }
  ]
}
// block.kind = lead | chain | bullet | saved | warning | text（→ 11-digest.md §3.2）
// notePath は該当する行のみ（無ければキーごと省略せず null）

// POST /api/learning/sets
// body（date とセットを同じオブジェクトで送る）
{
  "date": "today",                     // YYYY-MM-DD も可
  "theme": "SQLite の WAL とロック",
  "source": "theme",                   // theme | memo。省略時 theme
  "lessonMd": "...",
  "problems": [
    { "no": 1, "kind": "quiz",         // quiz | code。省略時 quiz
      "questionMd": "...", "answerMd": "...",
      "answerType": "choice",          // choice | number | text。省略時は自己採点（従来動作）
      "expected": "WAL ファイルに追記される",   // answerType 指定時は必須。choice は choices のいずれかと完全一致
      "choices": ["元のDBに直接書く", "WAL ファイルに追記される", "メモリに保持される"],
                                       // answerType=choice のとき必須（2〜6件・重複不可）。それ以外は null
      "workdir": null },
    { "no": 2, "kind": "quiz",
      "questionMd": "...", "answerMd": "...",
      "answerType": "number",          // 数値として比較（"12.5" と "12.50" は一致）
      "expected": "12.5", "choices": null, "workdir": null }
  ],
  "closingMd": null                    // 任意
}
// → 200
{ "date": "2026-07-29", "receivedAt": "2026-07-29T06:30:00+09:00" }
// 同じ date への再送はセット全体と receivedAt を上書き

// GET /api/learning/sets/2026-07-29   （"today" も可）
{
  "date": "2026-07-29",
  "receivedAt": "2026-07-29T06:30:00+09:00",
  "theme": "SQLite の WAL とロック",
  "source": "theme",
  "lessonMd": "...",
  "problems": [
    { "no": 1, "kind": "quiz",
      "questionMd": "...", "answerMd": "...",
      "answerType": "choice", "expected": "WAL ファイルに追記される",
      "choices": ["元のDBに直接書く", "WAL ファイルに追記される", "メモリに保持される"],
      "workdir": null }
  ],
  "closingMd": null
}

// POST /api/learning/sets/2026-07-29/result
// body（全問分が揃っていない途中採点も可。feeling は空文字可）
{
  "grades": [
    { "no": 1, "grade": "o", "answer": "WAL ファイルに追記される" },
                                       // grade: o | d | x（○ | △ | ×）
                                       // answer: ユーザーの回答入力（任意・≤500文字。自己採点問題は省略）
    { "no": 2, "grade": "x", "answer": "13" }
  ],
  "feeling": "WAL の checkpoint が曖昧だった"
}
// → 200（同じ date への再送は成績全体と completedAt を上書き）
{
  "date": "2026-07-29",
  "grades": [
    { "no": 1, "grade": "o", "answer": "WAL ファイルに追記される" },
    { "no": 2, "grade": "x", "answer": "13" }
  ],
  "feeling": "WAL の checkpoint が曖昧だった",
  "completedAt": "2026-07-29T06:45:00+09:00"
}

// GET /api/learning/sets/2026-07-29/result   （"today" も可）
// → 200（POST のレスポンスと同形）。未記録なら 404
// POST /api/harness/proposals
// kind 省略時は "daily"。同じ date への再送は、その日の全行が proposed の場合だけ一括置換
{
  "date": "2026-07-29",               // "today" も可
  "kind": "daily",                    // daily | prune | model_switch
  "proposals": [                      // 1〜30件
    {
      "slug": "検索状態外置き",
      "insightName": "検索状態のハーネス外置きで20Bが長期検索でフロンティア級に届く",
      "verdict": "experiment",         // adopt | experiment | killed
      "category": "⑥実験（新機軸）",  // killed は null 可
      "summary": "AIに全部覚えさせず外にメモ帳を置く方式を試す",
      "challengeVerdict": "weaken",   // hold | weaken | refute。killed は null 可
      "challengeNote": "合格ラインを数字で明確にした",
      "detailPath": "40_Projects/harness/判定/2026-07-29-検索状態外置き.md",
      "detailMd": "# 判定\n\n全文"
    }
  ]
}
// → 200。GET /api/harness/proposals?date=2026-07-29 も同じ形
{
  "date": "2026-07-29",
  "receivedAt": "2026-07-29T06:40:00+09:00",
  "proposals": [
    {
      "id": 1,
      "date": "2026-07-29",
      "kind": "daily",
      "slug": "検索状態外置き",
      "insightName": "検索状態のハーネス外置きで20Bが長期検索でフロンティア級に届く",
      "verdict": "experiment",
      "category": "⑥実験（新機軸）",
      "summary": "AIに全部覚えさせず外にメモ帳を置く方式を試す",
      "challengeVerdict": "weaken",
      "challengeNote": "合格ラインを数字で明確にした",
      "detailPath": "40_Projects/harness/判定/2026-07-29-検索状態外置き.md",
      "detailMd": "# 判定\n\n全文",
      "status": "proposed",            // proposed | approved | rejected | killed
      "decidedAt": null,
      "applyState": "pending",         // pending | applied | failed
      "appliedAt": null,
      "error": null,
      "snapshotPath": null
    }
  ]
}
// 未着日は 200 { "date": "...", "receivedAt": null, "proposals": [] }

// GET /api/harness/proposals?status=approved&applyState=pending
// → 200。日付昇順、同日内 id 昇順
{ "proposals": [ { /* 上記 proposal と同形 */ } ] }

// POST /api/harness/proposals/{id}/decision
{ "status": "approved" }              // proposed | approved | rejected
// → 200
{ "proposal": { /* 上記 proposal と同形 */ } }

// POST /api/harness/proposals/{id}/apply-result
{ "state": "applied", "snapshotPath": "40_Projects/harness/archive/2026-07-30-検索状態外置き/" }
// failed のとき: { "state": "failed", "error": "失敗理由" }
// → 200
{ "proposal": { /* 上記 proposal と同形 */ } }

// POST /api/intake/candidates
// 同じ date への再送は、その日の全行が proposed かつ apply_state=pending の場合だけ一括置換
{
  "date": "2026-08-28",               // "today" も可。元ノート＝候補ファイルの日付（実行日の前日）
  "sourcePath": "90_Meta/daily_intake/2026-08-28.md",
  "sourceNote": "01_Daily/2026-08-28.md",   // 任意（省略時 null）
  "items": [                          // 0〜60件。空配列可（0件の日も受信記録を残すため）
    {
      "lane": "thought",              // todo | thought | tone
      "text": "「アイデアの原料は一人称の摩擦にしかない」",  // 本人の原文そのまま
      "note": "idea-forge の配線がまだ無い",  // 任意・「考え」レーンの補足1文
      "lineNo": 12                    // 任意・候補ファイル内の行番号（書き戻しのヒント）
    }
  ]
}
// → 200
{
  "date": "2026-08-28",
  "receivedAt": "2026-08-29T00:41:00+09:00",
  "itemCount": 1,
  "items": [ { /* 下記 item と同形 */ } ]
}

// GET /api/intake/candidates?status=proposed        （未決・日付降順、同日内 id 昇順）
// GET /api/intake/candidates?status=approved&applyState=pending  （日付昇順、同日内 id 昇順）
// GET /api/intake/candidates?applyState=failed      （日付降順、同日内 id 昇順）
// → 200（3形とも同じ封筒。latest* は intake_days の receivedAt 最大の行。受信ゼロなら全て null）
{
  "items": [
    {
      "id": 1,
      "date": "2026-08-28",
      "slug": "9c1f2a7b0e34",         // sha1("{date}|{lane}|{text}") 先頭12桁（サーバ計算）
      "lane": "thought",              // todo | thought | tone
      "text": "「アイデアの原料は一人称の摩擦にしかない」",
      "note": "idea-forge の配線がまだ無い",
      "lineNo": 12,
      "sourcePath": "90_Meta/daily_intake/2026-08-28.md",   // intake_days から
      "sourceNote": "01_Daily/2026-08-28.md",
      "status": "proposed",           // proposed | approved | rejected
      "decidedAt": null,
      "applyState": "pending",        // pending | applied | failed
      "appliedAt": null,
      "error": null,
      "resultPath": null,             // 反映先の Vault 相対パス
      "resultUrl": null,              // ToDo レーンで作成した Linear issue の URL
      "receivedAt": "2026-08-29T00:41:00+09:00"
    }
  ],
  "latestDate": "2026-08-28",
  "latestReceivedAt": "2026-08-29T00:41:00+09:00",
  "latestItemCount": 1
}

// POST /api/intake/candidates/{id}/decision
{ "status": "approved" }              // proposed | approved | rejected
// → 200
{ "item": { /* 上記 item と同形 */ } }

// POST /api/intake/candidates/{id}/apply-result
{ "state": "applied", "resultPath": "20_Insights/....md", "resultUrl": null }
// failed のとき: { "state": "failed", "error": "候補ファイルに一致する原文が無い" }
// → 200
{ "item": { /* 上記 item と同形 */ } }

// GET /api/health
{ "db": "ok", "routines": 13, "version": "0.1.0" }
// 異常時は db が "ng"（HTTP 200 のまま返す）。routines はマスタの active 件数
```

- `interval` は日次系 DTO（`/api/days/*`）には**含めない**（表示に使わない。DB には保持 → [02](./02-data-model.md)）。マスタ系 DTO（`/api/routines`）には含める（編集対象のため）
- `routines` の `id` は数値（`task_id` とは別物。混同しないこと）
- リクエストボディの検証（400 `bad_request`）: `interval` 空不可 ／ `content` 空不可 ／ `time` は空文字または `^\d{1,2}:\d{2}$` ／ 各値は trim して保存（`content` の `<br>` 変換は import 時のみ・API では行わない）
- `routines` の DTO には `detailRef` を含める（省略時 null）。値は [`02-data-model.md`](./02-data-model.md) §6 の4語彙のみ。他の値は 400 `bad_request`
- `POST /api/digests` の検証（400 `bad_request`）: `date` が `%Y-%m-%d` でも `today` でもない ／ `body` が空 ／ `body` が 64KiB 超
- `POST /api/learning/sets` の検証（400 `bad_request`）: body が 256KiB 超 ／ `date` が `%Y-%m-%d` でも `today` でもない ／ `theme`・`lessonMd`・`problems` または各問題の `no`・`questionMd`・`answerMd` が欠落・空 ／ `problems` が1〜10件でない ／ `no` が重複 ／ `source`・`kind`・`answerType` が上記語彙外 ／ `answerType` 指定時に `expected` が欠落・空 ／ `answerType` が `choice` なのに `choices` が2〜6件でない・重複あり・`expected` が `choices` に含まれない ／ `answerType` が `choice` 以外なのに `choices` あり ／ `answerType` が `number` なのに `expected` が数値（整数・小数）として解釈できない。検証失敗時は保存しない
- `POST /api/learning/sets/{date}/result` の検証（400 `bad_request`）: `date` が `%Y-%m-%d` でも `today` でもない ／ `grades`・`feeling` が欠落 ／ `grade` が `o`・`d`・`x` 以外 ／ `grades[].no` が対応するセットの `problems[].no` に存在しない ／ `grades[].answer` が500文字超 ／ `feeling` が2000文字超。`grades` は空配列および全問未満でも可・`answer` は任意。対応するセットが未取り込みなら 404
- ダイジェストが未受信の日は **404 にせず** `sections: []` を 200 で返す
- 学習セットが未取り込みの日は 404 `not_found`
- 学習成績が未記録の日は 404 `not_found`
- `POST /api/harness/proposals` の検証（400 `bad_request`）: 詳細は [17](./17-harness-approval.md) §3.1〜§3.2。body は 512KiB 以下、`proposals` は1〜30件、`detailMd` は1件128KiB以下。`adopt` / `experiment` は `challengeVerdict` 必須
- ハーネス一覧 GET のクエリは、`date` だけ（省略時 `today`）／`status=approved&applyState=pending`／`applyState=failed` の**3形のみ**（2026-07-29 に failed 形を追加）。未知パラメータ・混在・値違い・条件の片方欠落など、その他は理由文字列つきの 400 `bad_request`
- ハーネスの decision / apply-result の状態遷移検証は [17](./17-harness-approval.md) §3.3〜§3.4。不正な遷移は 400 `bad_request`
- ハーネス提案が未着の日は **404 にせず** `receivedAt: null`・`proposals: []` を 200 で返す
- `POST /api/intake/candidates` の検証（400 `bad_request`）: 詳細は [22](./22-daily-intake.md) §3.1〜§3.2。body は 256KiB 以下、`items` は0〜60件（**空配列は正常**）、`text` は1件2KiB以下かつ空不可、`lane` は `todo`・`thought`・`tone` のみ、`note` は200文字以下、`sourcePath` 欠落・空は不可、同一 date 内の `slug`（サーバ計算）重複は不可
- daily取り込み一覧 GET のクエリは、`status=proposed`／`status=approved&applyState=pending`／`applyState=failed` の**3形のみ**（`date` 単独の形は持たない——候補の `date` は前日日付であり、画面は状態で引くため → [22](./22-daily-intake.md) §3.5）。その他は理由文字列つきの 400 `bad_request`
- daily取り込みの decision / apply-result の状態遷移検証は [22](./22-daily-intake.md) §3.3〜§3.4。不正な遷移は 400 `bad_request`。`apply-result` の `error` は1000文字以下（`failed` のとき必須）
- daily取り込みの受信が1件も無い場合の一覧 GET は **404 にせず** `items: []`・`latestReceivedAt: null` を 200 で返す
- 過去日でスナップショットが無い日: `tasks: []`・`progress: {done:0,total:0}`・`readonly:true` を 200 で返し、フロントが「記録なし」表示にする

## 4. エラーレスポンス（確定形）

常に以下の形：

```json
{ "error": { "code": "conflict", "message": "..." } }
```

| HTTP | code | 条件 |
|---|---|---|
| 400 | `bad_request` | date が `%Y-%m-%d` でも `today` でもない／`days` が正整数でない／ルーティン・学習セットの入力検証違反（§3） |
| 403 | `readonly_day` | 過去日への書き込み |
| 404 | `not_found` | 未知の taskId／未知の routine id／未取り込みの学習セット date／未記録の学習成績 date／未知のパス（API 配下） |
| 409 | `conflict` | 間隔・時刻・内容が既存の有効な行と重複（`routines_identity` 違反。task_id が衝突するため） |
| 400 | `bad_request` | date が `%Y-%m-%d` でも `today` でもない／`days` が正整数でない／ルーティン・ハーネスの入力検証違反またはハーネスの不正な状態遷移（§3） |
| 403 | `readonly_day` | 過去日への書き込み |
| 404 | `not_found` | 未知の taskId／未知の routine id／未知の harness proposal id／未知のパス（API 配下） |
| 409 | `conflict` | 間隔・時刻・内容が既存の有効な行と重複（`routines_identity` 違反）／`approved` / `rejected` または `apply_state ≠ pending` の行が1件でもある日へのハーネス提案再送（`killed`・`proposed` のみの日は置換可・2026-07-29 改訂） |
| 500 | `internal` | DB 障害ほか予期しないエラー |

`vault_unavailable`（503）は**廃止**した。マスタが SQLite に移り、通常運用で Vault を読まなくなったため（2026-07-27）。md からの取り込みは CLI の `import-routines` のみで、失敗はプロセスの終了コードで返す（[`06-cli-serve.md`](./06-cli-serve.md)）。

## 5. インターフェース規約

- API ベースは同一オリジン相対パス（`/api/...`）。dev 時のみ next.config の rewrites で Rust へプロキシ
- `Cache-Control: no-store`（API レスポンス）
- 認証なし（Tailnet 内のみで運用・インターネット非公開が前提）

## 6. エラー処理

エラー変換の実装方針は [`01-architecture.md`](./01-architecture.md) §5。フロントの表示は各画面仕様（[08](./08-web-today.md)／[09](./09-web-history.md)）。

## 7. スコープ外

- Phase 2 のエンドポイント（drafts / approvals / digest / notify）
- 認証・レート制限・CORS（同一オリジンのみ）

## 8. 関連仕様

- 全体: [`00-overview.md`](./00-overview.md)
- 実装: [`05-day-usecase.md`](./05-day-usecase.md)（days/checks/summary/routines）・[`06-cli-serve.md`](./06-cli-serve.md)（health・配信・import）
- 消費側: [`07-web-foundation.md`](./07-web-foundation.md)（types.ts 手動同期・fetcher）・[`10-web-routines.md`](./10-web-routines.md)（編集画面）
