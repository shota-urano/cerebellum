# 06. CLI・サーバー起動・静的配信仕様（infra）

**親**: [`00-overview.md`](./00-overview.md) ｜ **担当**: Backend ｜ **範囲**: `main.rs`・`cli.rs`・`config.rs`・`infra/assets.rs`・`/api/health`・launchd 常駐

## 1. 目的

`cerebellum serve --port 3210` の1コマンド・1プロセスで API＋フロントを配信し、launchd で常駐させる。デプロイ＝バイナリ1個。

## 2. 入出力

- **入力**: CLI 引数（clap derive）・設定（§4）
- **出力**: HTTP サーバー（`0.0.0.0:{port}`）・tracing ログ（stdout）

## 3. 処理詳細

### 3.1 CLI（clap derive）

```
cerebellum serve [--port 3210]     # Phase 1 はこれのみ
```

将来 `notify` 等のサブコマンドを追加する前提の構造にする（`enum Command`）。

### 3.2 起動シーケンス（main.rs = Composition Root）

1. tracing 初期化 → 設定解決（§4）
2. SQLite オープン＋`PRAGMA journal_mode=WAL`＋migration 適用（[`02-data-model.md`](./02-data-model.md) §5）
3. adapters（fs_vault / sqlite_repo / system_clock）を組み立て usecase へ注入、`AppState` を構築
4. axum ルーター構築（`/api/*` → ハンドラ、それ以外 → assets）→ `0.0.0.0:{port}` で listen
- 起動時に Vault が読めなくても**起動は成功させる**（リクエスト時に 503。Drive 同期の一時不能で常駐が死なないため）。DB が開けない場合は起動失敗（exit 1）

### 3.3 静的配信（infra/assets.rs）

- rust-embed `#[folder = "../web/out"]` でバイナリに内蔵
- パスに一致するファイルがあれば配信（Content-Type は拡張子から）。無ければ `index.html` を返す（SPA フォールバック）。`/api/` 配下は対象外（404 JSON）
- 静的アセットは `Cache-Control: public, max-age=3600`、`index.html` は `no-cache`

### 3.4 /api/health

`{ "vault": "ok|ng", "db": "ok|ng", "version": "<Cargo.toml の version>" }` を常に HTTP 200 で返す。vault はルーティン md の存在＋読み取り可否、db は `SELECT 1` で判定。

## 4. 設定値・確定値

| 項目 | 値 | 備考 |
|---|---|---|
| ポート | 3210（`--port` で上書き可） | 確定 |
| Vault パス | **env `CEREBELLUM_VAULT` で与える**（launchd plist に記載）。既定値は `$HOME/second-brain` | 確定。実運用の Vault は Google Drive 上でアカウント名を含む絶対パスになるため、**個人を特定できる値をリポジトリに置かない**（本リポジトリは公開。2026-07-26 改訂） |
| ルーティン md | `{vault}/80_運用ガイド/人間のルーティン.md` | 確定 |
| DB パス | 既定 `~/Library/Application Support/cerebellum/cerebellum.db`（env `CEREBELLUM_DB` で上書き可）。**親ディレクトリは起動時に `create_dir_all` で用意する**（SQLite は作らないため初回起動が失敗する） | 確定（2026-07-26 実装時に確定） |
| bind | `0.0.0.0`（Tailscale 経由アクセスのため） | 確定 |

## 5. インターフェース

- HTTP 契約: [`03-api.md`](./03-api.md)
- launchd: `~/Library/LaunchAgents/jp.uslab.cerebellum.plist`（`KeepAlive=true`・stdout/err をログファイルへ）。plist の配置はデプロイ手順（README）に記載し、リポジトリにサンプルを置く

## 6. エラー処理

- DB オープン失敗: 起動失敗（exit 1・原因を stderr）
- Vault 不能: 起動は継続、該当リクエストのみ 503（[`03-api.md`](./03-api.md) §4）
- ポート使用中: 起動失敗（原因を stderr）

## 7. スコープ外

- TLS・認証（Tailnet 内のみ）
- `notify` 等の Phase 2 サブコマンド
- 自動アップデート・デーモン管理 UI

## 8. 関連仕様

- 全体: [`00-overview.md`](./00-overview.md) ／ 構成・DI: [`01-architecture.md`](./01-architecture.md)
- DB 初期化: [`02-data-model.md`](./02-data-model.md) ／ API: [`03-api.md`](./03-api.md)
- 配信対象のビルド: [`07-web-foundation.md`](./07-web-foundation.md)（`web/out`）
