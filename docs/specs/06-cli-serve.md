# 06. CLI・サーバー起動・静的配信仕様（infra）

**親**: [`00-overview.md`](./00-overview.md) ｜ **担当**: Backend ｜ **範囲**: `main.rs`・`cli.rs`・`config.rs`・`infra/assets.rs`・`/api/health`・launchd 常駐

## 1. 目的

`cerebellum serve --port 48210` の1コマンド・1プロセスで API＋フロントを配信し、launchd で常駐させる。デプロイ＝バイナリ1個。

## 2. 入出力

- **入力**: CLI 引数（clap derive）・設定（§4）
- **出力**: HTTP サーバー（`0.0.0.0:{port}`）・tracing ログ（stdout）

## 3. 処理詳細

### 3.1 CLI（clap derive）

```
cerebellum serve [--port 48210]
cerebellum import-routines [--vault <path>] [--dry-run] [--force]
```

将来 `notify` 等のサブコマンドを追加する前提の構造にする（`enum Command`）。

**`import-routines`（初期移行用・原則1回だけ実行する）**

1. `{vault}/80_運用ガイド/人間のルーティン.md` を読む（`--vault` 未指定時は §4 の設定に従う）
2. パース（[`04-routine-parse.md`](./04-routine-parse.md) §3.1）→ 表の出現順で `routines` へ INSERT（`active=1`）
3. **既に `routines` に有効行がある場合は中止**（exit 1）。`--force` を付けた場合のみ、既存の有効行を全て `active=0` にしてから入れ直す。この無効化と INSERT は**単一トランザクション**で行い、パース・挿入のいずれかが失敗したら全体をロールバックする（マスタが空・部分取り込みのまま残らない）
4. `--dry-run` は取り込み結果を標準出力に表示するだけで DB を変更しない
5. Vault が読めない・md が無い場合は exit 1（サーバーは影響を受けない）
6. Vault へは**書き込まない**（読み取りのみ）

### 3.2 起動シーケンス（main.rs = Composition Root）

1. tracing 初期化 → 設定解決（§4）
2. SQLite オープン＋`PRAGMA journal_mode=WAL`＋migration 適用（[`02-data-model.md`](./02-data-model.md) §5）
3. adapters（sqlite_repo / system_clock）を組み立て usecase へ注入、`AppState` を構築
4. axum ルーター構築（`/api/*` → ハンドラ、それ以外 → assets）→ `0.0.0.0:{port}` で listen
- **`serve` は Vault を一切参照しない**（マスタは SQLite。`fs_vault` は `import-routines` の実行時のみ組み立てる）。DB が開けない場合は起動失敗（exit 1）
- `routines` が空でも起動は成功する（その日は「タスクなし」になる。移行前に `import-routines` を実行すること）

### 3.3 静的配信（infra/assets.rs）

- rust-embed `#[folder = "../web/out"]` でバイナリに内蔵
- **解決順**（先に見つかったものを返す。2026-07-27 明文化）:
  1. 要求パスに一致するファイル
  2. `{path}.html`（`next build` は `/history` を `history.html` として出力する）
  3. `{path}/index.html`
  4. `index.html`（SPA フォールバック）
  - 末尾スラッシュは 2・3 の判定前に落とす。`/api/` 配下は対象外（404 JSON）
  - **2 を飛ばすと `/history`・`/routines` の直リンクが全てトップ画面になる**（2026-07-27 に実機で発覚。Phase 1 から潜在。dev サーバでは Next 側が解決するため露見しなかった）
- Content-Type は拡張子から決める
- キャッシュ: `.html` は `no-cache`（ページはビルドごとに中身が変わる）、それ以外の静的アセットは `public, max-age=3600`

### 3.4 /api/health

`{ "db": "ok|ng", "routines": <active 件数>, "version": "<Cargo.toml の version>" }` を常に HTTP 200 で返す。db は `SELECT 1`、routines は `SELECT count(*) FROM routines WHERE active=1` で判定（0件は異常ではないが、移行漏れの検知に使える）。vault 項目は廃止（`serve` が Vault を参照しなくなったため）。

## 4. 設定値・確定値

| 項目 | 値 | 備考 |
|---|---|---|
| ポート | 48210（`--port` で上書き可） | 確定（2026-07-26 に 3210 から変更）。**49152 以上（macOS の ephemeral 範囲）に置かないこと** — 再起動直後に他プロセスが一時ポートとして先に掴み、§6 の「ポート使用中: 起動失敗」を散発的に踏むため。dev サーバは 48211（[`07-web-foundation.md`](./07-web-foundation.md) §5） |
| Vault パス | **env `CEREBELLUM_VAULT` または `--vault`**（既定 `$HOME/second-brain`）。**`import-routines` でのみ使用**し、`serve` では参照しない | 確定。実運用の Vault は Google Drive 上でアカウント名を含む絶対パスになるため、**個人を特定できる値をリポジトリに置かない**（本リポジトリは公開。2026-07-26 改訂／2026-07-27 に用途を import 限定へ縮小） |
| ルーティン md | `{vault}/80_運用ガイド/人間のルーティン.md`（移行元。移行後は参照しない） | 確定 |
| ルーティン正本 | SQLite `routines`（[`02-data-model.md`](./02-data-model.md) §2） | 確定（2026-07-27 に md から移管） |
| DB パス | 既定 `~/Library/Application Support/cerebellum/cerebellum.db`（env `CEREBELLUM_DB` で上書き可）。**親ディレクトリは起動時に `create_dir_all` で用意する**（SQLite は作らないため初回起動が失敗する） | 確定（2026-07-26 実装時に確定） |
| bind | `0.0.0.0`（Tailscale 経由アクセスのため） | 確定 |

## 5. インターフェース

- HTTP 契約: [`03-api.md`](./03-api.md)
- launchd: `~/Library/LaunchAgents/jp.uslab.cerebellum.plist`（`KeepAlive=true`・stdout/err をログファイルへ）。plist の配置はデプロイ手順（README）に記載し、リポジトリにサンプルを置く

## 6. エラー処理

- DB オープン失敗: 起動失敗（exit 1・原因を stderr）
- Vault 不能: `import-routines` の失敗のみ（exit 1）。`serve` には影響しない
- ポート使用中: 起動失敗（原因を stderr）

## 7. スコープ外

- TLS・認証（Tailnet 内のみ）
- `notify` 等の Phase 2 サブコマンド
- 自動アップデート・デーモン管理 UI

## 8. 関連仕様

- 全体: [`00-overview.md`](./00-overview.md) ／ 構成・DI: [`01-architecture.md`](./01-architecture.md)
- DB 初期化: [`02-data-model.md`](./02-data-model.md) ／ API: [`03-api.md`](./03-api.md)
- 配信対象のビルド: [`07-web-foundation.md`](./07-web-foundation.md)（`web/out`）
