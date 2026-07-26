# cerebellum システム全体仕様書（Overview）

**一次情報源**: [`../要件定義.md`](../要件定義.md) / [`../アーキテクチャ.md`](../アーキテクチャ.md) / [`../アーキテクチャ詳細.md`](../アーキテクチャ詳細.md)
**パース仕様の正本**: second-brain Vault `.claude/skills/daily-tasks/scripts/post.py`（本仕様書群に転記済み → [`04-routine-parse.md`](./04-routine-parse.md)）

## 1. プロダクト概要

second-brain の日次ルーティンを消し込む**自分専用の運用ダッシュボード**。正本は常に Vault の `80_運用ガイド/人間のルーティン.md`（読み取りのみ）、日々の記録は SQLite が正本。Rust 単一バイナリ（axum＋rust-embed）が Next.js 静的出力を配信し、Tailscale 経由でスマホからも使う。ローカル完結・外部サービスなし・インターネット非公開。

Phase 1（本仕様の範囲）= 今日のタスク表示・消し込み・履歴閲覧・スナップショット確定。

## 2. システム全体像

```
┌─ Mac（常駐・launchd） ──────────────────────────────────┐
│  cerebellum（Rustバイナリ1個）            [06-cli-serve]   │
│  ├ 静的配信: Next.js export（rust-embed）  [07/08/09-web-*] │
│  ├ JSON API: axum                        [03-api]         │
│  ├ core: 表パース／due判定／task_id        [04-routine-parse]│
│  │       スナップショット確定／トグル／サマリ [05-day-usecase] │
│  ├ store: SQLite（WAL）                   [02-data-model]  │
│  └ vault: md 読み取り専用アダプタ           [01-architecture]│
└──────────┬──────────────────────────────────────────┘
           │ Tailscale（Tailnet内のみ）
     スマホ / PC ブラウザ
```

## 3. 詳細仕様書一覧（索引）

| # | ファイル名 | 範囲 | 担当 |
|---|-----------|------|------|
| 01 | [`01-architecture.md`](./01-architecture.md) | 構成・レイヤ・技術スタック・エラー方針・verify（整合性アンカー） | 共通 |
| 02 | [`02-data-model.md`](./02-data-model.md) | SQLite スキーマ・task_id・スナップショット規約（整合性アンカー） | Backend |
| 03 | [`03-api.md`](./03-api.md) | API 契約・DTO・エラーレスポンス（整合性アンカー） | 共通 |
| 04 | [`04-routine-parse.md`](./04-routine-parse.md) | md 表パース・due 判定・ソート（domain） | Backend |
| 05 | [`05-day-usecase.md`](./05-day-usecase.md) | 日取得・スナップショット ensure・トグル・サマリ（usecase） | Backend |
| 06 | [`06-cli-serve.md`](./06-cli-serve.md) | CLI・サーバー起動・静的配信・health・常駐 | Backend |
| 07 | [`07-web-foundation.md`](./07-web-foundation.md) | Next.js 基盤（構成・データ取得・スタイル・PWA下準備） | Frontend |
| 08 | [`08-web-today.md`](./08-web-today.md) | 「今日」画面（表示・消し込み） | Frontend |
| 09 | [`09-web-history.md`](./09-web-history.md) | 「履歴」画面（日付ナビ・過去日読み取り専用・サマリ） | Frontend |

## 4. 確定済みの初期値（横断・変更禁止）

| 項目 | 確定値 | 詳細 |
|---|---|---|
| ルーティン表の正本 | Vault `80_運用ガイド/人間のルーティン.md`（読み取りのみ・書き込み禁止） | [04](./04-routine-parse.md) |
| Vault パス | env `CEREBELLUM_VAULT`（既定 `$HOME/second-brain`）。実パスは環境固有のためリポジトリに書かない | [06](./06-cli-serve.md) |
| task_id | `sha1("間隔|時刻|内容")` 先頭12桁（16進小文字。実施・ツール列は含めない） | [02](./02-data-model.md) |
| 曜日文字列 | `"月火水木金土日"`（`weekday()` 0=月 に対応） | [04](./04-routine-parse.md) |
| ポート | 48210 | [06](./06-cli-serve.md) |
| 時刻 | 常にローカルタイム（Asia/Tokyo）。日付境界は深夜0時。日付書式 `%Y-%m-%d` | [05](./05-day-usecase.md) |
| 過去日 | 読み取り専用（消し込みの後日変更は不可） | [05](./05-day-usecase.md) |
| スナップショット | `/api/days/today` 初回アクセス時に ensure（冪等）。日次ジョブは持たない | [05](./05-day-usecase.md) |
| DB | rusqlite（bundled）＋ WAL。sqlx 不採用。単一 Connection（`Mutex`）・プールなし | [02](./02-data-model.md) |
| 静的配信 | rust-embed でバイナリに内蔵（外部ディレクトリ配信は不採用） | [06](./06-cli-serve.md) |
| フロント | Next.js 15 / React 19 / TS strict / App Router / `output:'export'` / Tailwind v4 / SWR | [07](./07-web-foundation.md) |
| 依存方向 | Rust: `domain ← usecase ← adapters/infra`。Web: `app → features → shared`・feature間 import 禁止 | [01](./01-architecture.md) |

## 5. スコープ外（Phase 1 では実装しない）

- 下書き一覧・承認フロー・digest/朝レポ・通知の自前実装・メトリクス可視化（Phase 2 以降）
- 単発 TODO の追加（正本は常にルーティン表）
- 過去日の消し込み変更
- Vault への書き込み・既存スキル/routine の変更・インターネット公開

## 6. 用語

| 用語 | 意味 |
|---|---|
| Vault | second-brain の Obsidian ディレクトリ（Google Drive 同期） |
| ルーティン表 | `人間のルーティン.md` 内の md テーブル（列: 間隔/時間/実施/確認ツール/内容） |
| due | ルーティン行がその日の対象であること（毎日/平日/週末/曜日で判定） |
| スナップショット | その日の対象タスク一覧を SQLite `task_days` に確定保存したもの。過去日表示の正 |
| 消し込み | タスクのチェック ON/OFF（`task_checks`）。当日のみ変更可 |
