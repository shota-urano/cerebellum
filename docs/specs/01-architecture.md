# 01. アーキテクチャ仕様（整合性アンカー）

**親**: [`00-overview.md`](./00-overview.md) ｜ **担当**: 共通 ｜ **範囲**: リポジトリ構成・レイヤ構造・技術スタック・エラー方針・verify 契約

## 1. 目的

全工程が従う構成・依存ルール・横断方針を1か所に固定する。迷ったら「各エコシステムの一番普通の書き方」を選ぶ。

## 2. リポジトリ構成（monorepo）

```
cerebellum/
├ server/    Rust crate（単一バイナリ。workspace 不使用・Phase 2 でも分割しない想定）
├ web/       Next.js（App Router・静的 export）
├ docs/      要件定義・アーキテクチャ・specs
└ Makefile   verify 一発（§7）
```

## 3. Rust レイヤ構造（クリーンアーキテクチャ・確定）

層は `domain ← usecase ← adapters / infra` の4層。**依存は常に内側向きのみ**。

```
server/src/
├ main.rs                  # Composition Root（DI組み立て）＋ clap dispatch
├ cli.rs                   # clap derive（Serve { port }）
├ config.rs                # 設定（→ 06-cli-serve.md）
├ domain/                  # エンティティ＋純ルール。依存ゼロ
│ ├ task.rs                # Task・task_id
│ ├ routine.rs             # md表パース（純関数 &str→Vec<RoutineRow>）
│ ├ due.rs                 # due判定
│ └ day.rs                 # DaySnapshot・進捗計算
├ usecase/                 # アプリケーションサービス。ポート（trait）はここで定義
│ ├ ports.rs               # trait VaultReader / TaskRepository / Clock
│ ├ get_day.rs             # 日取得（today のスナップショット ensure 含む・冪等）
│ ├ toggle_check.rs        # トグル（「当日のみ許可」ガードはここ。API層に置かない）
│ └ get_summary.rs         # 直近N日サマリ
├ adapters/                # ポート実装（外側）
│ ├ fs_vault.rs            # impl VaultReader（fs読み取りのみ）
│ ├ sqlite_repo.rs         # impl TaskRepository（rusqlite・migration・全クエリ）
│ └ system_clock.rs        # impl Clock（Local時刻。テストでは固定時刻 fake）
└ infra/                   # フレームワーク層
  ├ api/                   # axum。DTO⇔usecase の変換のみ
  └ assets.rs              # rust-embed 配信＋SPAフォールバック
```

**依存ルール**

- domain は何にも依存しない。usecase は domain とポートにのみ依存。adapters / infra が外側からポートを実装する（依存性逆転）
- 注入は `Arc<dyn Trait>`（動的ディスパッチ）。組み立ては main.rs のみ
- `Clock` をポートにする（「今日」の判定を固定時刻でテストするため。日付境界・曜日判定テストに必須）
- ビジネスルール（過去日読み取り専用・スナップショット冪等性）は usecase 層。API 層は変換だけ
- ポート・usecase のメソッドは**同期**で定義。axum ハンドラからは `tokio::task::spawn_blocking` 経由で呼ぶ
- `AppState`（Arc）に各 usecase＋Config を保持

## 4. 依存クレート（確定）

| 用途 | クレート | 備考 |
|---|---|---|
| Web | axum | tokio（rt-multi-thread, macros）併用 |
| CLI | clap（derive） | |
| DB | rusqlite（**bundled**） | SQLite 同梱でシステム依存ゼロ |
| 静的配信 | rust-embed | `#[folder = "../web/out"]` |
| JSON | serde / serde_json | DTO は `rename_all = "camelCase"` |
| 日時 | chrono | Local 時刻。日付は `%Y-%m-%d` |
| ハッシュ | sha1_smol | task_id 用 |
| エラー | thiserror（各層）＋ anyhow（main/CLI のみ） | |
| ログ | tracing + tracing-subscriber | |

ツールチェーンは `rust-toolchain.toml` で stable 固定。

## 5. エラー方針（横断）

- 層ごとに thiserror（`DomainError` / `UsecaseError` / 各 adapter のエラー）
- API 層は `ApiError` に集約し `IntoResponse` 実装。レスポンス形は [`03-api.md`](./03-api.md) §エラー を正とする
- Vault 読み取り不能（Drive 同期中等）→ 503。クラッシュしない
- panic はバグ扱い。ハンドラ内で `unwrap` しない

## 6. テスト戦略（層ごと）

| 層 | 手段 |
|---|---|
| domain | fixture テスト（実物の `人間のルーティン.md` をコピーした fixture 同梱。post.py の出力と一致を担保） |
| usecase | ポートの手書き fake（`FakeClock` 固定時刻・`InMemoryRepo`）。日付境界・過去日ガード・スナップショット冪等性をここで固める |
| adapters | `Connection::open_in_memory()` でクエリ単位テスト |
| infra/api | `tower::ServiceExt::oneshot` で結合テスト（today 取得→toggle→過去日403 の一連） |

## 7. verify 契約（Makefile・dev-loop 前提）

ビルド順は **web → server**（rust-embed が `web/out` を取り込むため）。

```
make verify:
  1. web:    npm ci（初回）→ lint → next build（out/ 生成）
  2. server: cargo fmt --check → cargo clippy -- -D warnings → cargo test
  3. release: cargo build --release（embed 込みで通ること）
```

dev 中は `next dev`（rewrites で Rust へプロキシ）＋ `cargo run -- serve` の2プロセス。本番は `cerebellum serve --port 3210` を launchd 常駐。

## 8. 関連仕様

- 全体: [`00-overview.md`](./00-overview.md)
- データ: [`02-data-model.md`](./02-data-model.md) ／ API: [`03-api.md`](./03-api.md)
- Web 側の構成詳細: [`07-web-foundation.md`](./07-web-foundation.md)
- 起動・配信・設定: [`06-cli-serve.md`](./06-cli-serve.md)
