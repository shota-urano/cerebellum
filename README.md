# cerebellum

second-brain の日次ルーティンを表示・消し込みする、Tailnet 内向けダッシュボードです。
Next.js の静的出力を Rust バイナリへ埋め込み、API と同じプロセスで配信します。

## 開発

```sh
make verify
cargo run --manifest-path server/Cargo.toml -- serve
```

既定の listen 先は `0.0.0.0:48210` です。開発時にポートを変える場合は
`serve --port <port>` を指定します。

設定は環境変数で上書きできます。

| 変数 | 既定値 |
|---|---|
| `CEREBELLUM_VAULT` | `$HOME/second-brain` |
| `CEREBELLUM_DB` | `$HOME/Library/Application Support/cerebellum/cerebellum.db` |

Vault は読み取り専用で使用します。起動時に Vault が読めなくてもサーバーは継続し、
該当 API は 503、`/api/health` の `vault` は `ng` を返します。

## launchd への配置

1. release バイナリを作成して、固定した絶対パスへコピーします。

   ```sh
   make verify
   mkdir -p "$HOME/bin"
   mkdir -p "$HOME/Library/Logs/cerebellum"
   cp server/target/release/cerebellum "$HOME/bin/cerebellum"
   ```

2. [`deploy/jp.uslab.cerebellum.plist`](deploy/jp.uslab.cerebellum.plist) をコピーし、
   `REPLACE_WITH_HOME` と `REPLACE_WITH_VAULT` を実環境の絶対パスへ置き換えます。
   Vault の実パスは個人情報を含み得るため、置換済み plist をリポジトリへ追加しないでください。

   ```sh
   cp deploy/jp.uslab.cerebellum.plist "$HOME/Library/LaunchAgents/jp.uslab.cerebellum.plist"
   ```

3. ジョブを読み込みます。設定変更後は `bootout` してから再度 `bootstrap` します。

   ```sh
   launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/jp.uslab.cerebellum.plist"
   launchctl kickstart -k "gui/$(id -u)/jp.uslab.cerebellum"
   ```

4. 起動状態を確認します。

   ```sh
   curl --fail --silent http://127.0.0.1:48210/api/health
   curl --fail --silent http://127.0.0.1:48210/
   ```

ログは sample plist の設定では `$HOME/Library/Logs/cerebellum/` に出力されます。
