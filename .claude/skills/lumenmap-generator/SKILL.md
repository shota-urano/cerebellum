---
name: lumenmap-generator
description: プロジェクト構成（Skills / MCP / エージェント / Docker / 依存パッケージ）を追加・変更した際、およびユーザーが構成図・lumenmap に言及した際に使用する。手動の「構成図を更新して」にも対応する。
---

# lumenmap-generator

プロジェクトのAI構成、モノレポ/Docker構造、本番構成、接続関係を決定論的に検出し、ロゴと新規ノードの座標を解決して、プロジェクト直下の `lumenmap.json` を差分更新する。

## 手順

1. 対象プロジェクトのルートで実行する。
2. 同梱スクリプトを呼び出す。

```bash
bun .claude/skills/lumenmap-generator/generate.ts --project-root .
```

再現テストなど生成日時を固定する場合は、ISO 8601形式で注入する。

```bash
bun .claude/skills/lumenmap-generator/generate.ts \
  --project-root . \
  --generated-at 2026-07-07T01:23:45.000Z
```

3. 既存ノードの座標、`manual: true` / `hidden: true` の内容を保持して差分更新する。更新前の内容は `.lumenmap.json.bak` に1世代保存する。既存ファイルが不正な場合は上書きせず終了する。
4. 生成された `lumenmap.json` が意図した対象プロジェクトのものか確認する。

## 現在の検出範囲

- `.claude/skills/*/SKILL.md` → `skill`
- `.claude/agents/**/*.md` → `agent`
- `.claude/commands/**/*.md` → `command`
- `.mcp.json`、`settings.json`、`.claude/settings*.json` の `mcpServers` → `mcp`
- ルートの `CLAUDE.md` → `claude-md`
- workspace設定と配下の `package.json` / `Cargo.toml` → モノレポの `group` / `app`
- `Dockerfile*` と `docker-compose.yml` / `compose.yml` → Dockerの `group` / `container` / `db` / `service`
- 依存パッケージ、README・デプロイ設定、`.env*` の環境変数キー名 → 本番 `service`（`confidence` / `evidence` 付き）
- Composeの `depends_on` → `confirmed` edge、依存関係から推定した外部サービス利用 → `inferred` edge

`.env*` は環境変数のキー名とファイルパスだけを参照し、`=` の右側の値は読み取り・保持・evidenceへの記録をしない。確定した接続と推定した接続を混同しない。

検出できない要素は出力しない。サービスのロゴ slug が既知の場合だけ Simple Icons CDN URL を組み立て、外部通信は行わない。新規ノードだけを AI=左、開発=右下、本番=右上へ決定論的に配置する。
