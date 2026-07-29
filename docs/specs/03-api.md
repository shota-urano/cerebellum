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
| POST | `/api/harness/proposals` | ハーネス取り込み提案を日単位で取り込む | [17](./17-harness-approval.md) |
| GET | `/api/harness/proposals?date={date}` | その日のハーネス取り込み提案。`date`=`today` 可・省略時は `today` | [17](./17-harness-approval.md) |
| GET | `/api/harness/proposals?status=approved&applyState=pending` | 日付を問わず承認済み・適用待ちの提案を古い順で取得 | [17](./17-harness-approval.md) |
| POST | `/api/harness/proposals/{id}/decision` | ハーネス取り込み提案への承認意思を記録 | [17](./17-harness-approval.md) |
| POST | `/api/harness/proposals/{id}/apply-result` | ハーネス取り込み提案の適用結果を書き戻す | [17](./17-harness-approval.md) |
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

// GET /api/health
{ "db": "ok", "routines": 13, "version": "0.1.0" }
// 異常時は db が "ng"（HTTP 200 のまま返す）。routines はマスタの active 件数
```

- `interval` は日次系 DTO（`/api/days/*`）には**含めない**（表示に使わない。DB には保持 → [02](./02-data-model.md)）。マスタ系 DTO（`/api/routines`）には含める（編集対象のため）
- `routines` の `id` は数値（`task_id` とは別物。混同しないこと）
- リクエストボディの検証（400 `bad_request`）: `interval` 空不可 ／ `content` 空不可 ／ `time` は空文字または `^\d{1,2}:\d{2}$` ／ 各値は trim して保存（`content` の `<br>` 変換は import 時のみ・API では行わない）
- `routines` の DTO には `detailRef` を含める（省略時 null）。値は [`02-data-model.md`](./02-data-model.md) §6 の4語彙のみ。他の値は 400 `bad_request`
- `POST /api/digests` の検証（400 `bad_request`）: `date` が `%Y-%m-%d` でも `today` でもない ／ `body` が空 ／ `body` が 64KiB 超
- ダイジェストが未受信の日は **404 にせず** `sections: []` を 200 で返す
- `POST /api/harness/proposals` の検証（400 `bad_request`）: 詳細は [17](./17-harness-approval.md) §3.1〜§3.2。body は 512KiB 以下、`proposals` は1〜30件、`detailMd` は1件128KiB以下。`adopt` / `experiment` は `challengeVerdict` 必須
- ハーネス一覧 GET のクエリは、`date` だけ（省略時 `today`）または `status=approved&applyState=pending` のどちらか。混在・値違い・適用待ち条件の片方欠落は 400 `bad_request`
- ハーネスの decision / apply-result の状態遷移検証は [17](./17-harness-approval.md) §3.3〜§3.4。不正な遷移は 400 `bad_request`
- ハーネス提案が未着の日は **404 にせず** `receivedAt: null`・`proposals: []` を 200 で返す
- 過去日でスナップショットが無い日: `tasks: []`・`progress: {done:0,total:0}`・`readonly:true` を 200 で返し、フロントが「記録なし」表示にする

## 4. エラーレスポンス（確定形）

常に以下の形：

```json
{ "error": { "code": "conflict", "message": "..." } }
```

| HTTP | code | 条件 |
|---|---|---|
| 400 | `bad_request` | date が `%Y-%m-%d` でも `today` でもない／`days` が正整数でない／ルーティン・ハーネスの入力検証違反またはハーネスの不正な状態遷移（§3） |
| 403 | `readonly_day` | 過去日への書き込み |
| 404 | `not_found` | 未知の taskId／未知の routine id／未知の harness proposal id／未知のパス（API 配下） |
| 409 | `conflict` | 間隔・時刻・内容が既存の有効な行と重複（`routines_identity` 違反）／`status` が `proposed` 以外（`approved` / `rejected` / `killed`）の行が1件でもある日へのハーネス提案再送 |
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
