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
| GET | `/api/health` | 自己診断（Vault 読取可否・DB 可否） | [06](./06-cli-serve.md) |
| GET | 上記以外 | 静的アセット配信＋SPA フォールバック | [06](./06-cli-serve.md) |

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
      "checkedAt": "2026-07-25T08:01:00+09:00" }   // 未チェック時は null
  ]
}

// POST /api/days/today/checks/{taskId} → 200（上と同形を返す）

// GET /api/summary?days=7
{ "days": [ { "date": "2026-07-25", "done": 2, "total": 9 } ] }
// スナップショットが存在する日のみ返す（記録なしの日は含めない。
// 表示側の扱いは 09-web-history.md）

// GET /api/health
{ "vault": "ok", "db": "ok", "version": "0.1.0" }
// 異常時は該当フィールドが "ng"（HTTP 200 のまま返す）
```

- `interval` は DTO に**含めない**（表示に使わない。DB には保持 → [02](./02-data-model.md)）
- 過去日でスナップショットが無い日: `tasks: []`・`progress: {done:0,total:0}`・`readonly:true` を 200 で返し、フロントが「記録なし」表示にする

## 4. エラーレスポンス（確定形）

常に以下の形：

```json
{ "error": { "code": "vault_unavailable", "message": "..." } }
```

| HTTP | code | 条件 |
|---|---|---|
| 400 | `bad_request` | date が `%Y-%m-%d` でも `today` でもない／`days` が正整数でない |
| 403 | `readonly_day` | 過去日への書き込み |
| 404 | `not_found` | 未知の taskId／未知のパス（API 配下） |
| 503 | `vault_unavailable` | Vault 読み取り不能（Drive 同期中等） |
| 500 | `internal` | DB 障害ほか予期しないエラー |

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
- 実装: [`05-day-usecase.md`](./05-day-usecase.md)（days/checks/summary）・[`06-cli-serve.md`](./06-cli-serve.md)（health・配信）
- 消費側: [`07-web-foundation.md`](./07-web-foundation.md)（types.ts 手動同期・fetcher）
