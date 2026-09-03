# プロジェクト概要

second-brain のルーティンを消し込む自分専用ダッシュボード。Rust 単一バイナリ（axum）が Next.js 静的 export を配信し、Tailscale 内でのみ使う。エージェントには docs/specs/ の仕様通りの実装をさせる。

## 技術スタック / 構成

- `server/` Rust（axum / rusqlite bundled / rust-embed / clap）。層は `domain ← usecase ← adapters/infra`
- `web/` Next.js 15 / React 19 / TS strict / App Router / `output:'export'` / Tailwind v4 / SWR
- 検証: ルートで `make verify`（web → server → **E2E** の順）／高速版 `make verify-fast`（E2E 抜き）
- 起動: ルートで `make run`（プレビュー :48212。本番DBのコピーを使うので常駐本番 :48210 は無傷）
- 仕様の正本: `docs/specs/00-overview.md`（索引）。スキーマ=`02`、API=`03` がアンカー

## 用語・前提

- **Vault** = Google Drive 上の second-brain。初期 import（`cerebellum import-routines`）の移行元にのみ使う
- **ルーティン表** = 繰り返しタスクのマスタ。**正本は SQLite `routines`**（2026-07-27 に md から移管。`docs/specs/02-data-model.md` §2）
- **スナップショット** = その日の due タスクを SQLite `task_days` に確定したもの。過去日表示の正
- 日付境界は深夜0時・ローカルタイム（Asia/Tokyo）

## ルール

1. **Vault 配下に書き込まない**（読み取りのみ）。書き込みコードを書いた時点で仕様違反。読み取りも `import-routines` 経路だけで、`serve` からは Vault を参照しない
2. due 判定・ソート・task_id の仕様（`docs/specs/04-routine-parse.md` §3.2-3.4・`docs/specs/02-data-model.md` §3）を変更しない。確定済みの過去記録と ID を連続させるため。fixture テストの期待値を実装に合わせて書き換えない（md パース §3.1 は初期 import 専用だが、再取り込みの再現性のため削除しない）
3. 一度確定した `task_days` を更新・削除するコードを書かない（過去記録の不変性）。過去日の消し込み変更も不可。**ルーティンマスタの編集が当日のスナップショットに遡及してもいけない**（反映は翌日から）
4. 確定済み技術選定を置き換えない: rusqlite（sqlx 不可）・rust-embed・SWR・クエリパラメータ方式・ポート48210 ほか `docs/specs/00` §4 の表
5. 依存方向を守る: Rust は `domain ← usecase ← adapters/infra`（domain に I/O 依存ゼロ、ガード類は usecase 層）。Web は `app → features → shared` 一方向・feature 間 import 禁止・barrel 経由のみ
6. スキーマは `docs/specs/02`、API/DTO は `docs/specs/03` だけで定義する。他ファイル・実装コメントで二重定義しない。`web/src/shared/api/types.ts` は `03` と手動同期
7. Phase 2 機能（下書き・承認・通知・単発TODO）を先取り実装しない。実装対象に繰り上げ済みのもの: ルーティン表の編集＝Phase 1.5（`docs/specs/10-web-routines.md`）／朝ダイジェストの取り込みと表示＝Phase 1.6（`docs/specs/11-digest.md`・`docs/specs/12-web-digest.md`）／学習セッションと**ハーネス取り込みの承認**＝Phase 1.7（`docs/specs/14`〜`15`・`docs/specs/17-harness-approval.md`・`docs/specs/18-web-harness.md`）／automation の勤務帯・直近報告・社員名簿の表示＝Phase 1.8（`docs/specs/20-web-office.md`・`docs/specs/21-web-office-roster.md`・`docs/specs/26-web-office-company.md`・`docs/specs/27-web-office-departments.md`。Frontend のみ・スキーマと API は無変更。27 で全景の部屋は skill 名からの4分類をやめ `profile.dept` の8部署で切る。名簿の正本は second-brain の各 `SKILL.md` frontmatter で、cerebellum に対応表を持たない）／daily取り込み候補の**承認＝Phase 1.9**（`docs/specs/22-daily-intake.md`・`docs/specs/23-web-waiting.md`。正本は Vault の候補ファイル `90_Meta/daily_intake/`。✅は second-brain 側が候補ファイルへ書き戻し、cerebellum から Vault へ書く経路は作らない。**Linear 起票は cerebellum の責務ではない**）。前倒しした承認は**ハーネス取り込みと daily取り込みの2つ限定**で、X ポスト等の下書き承認は依然スコープ外。**生成・判定・適用は cerebellum の責務ではない**（second-brain の daily-digest / night-study / night-harness が持つ。受け取って表示し、入力を預かるだけ）
8. ビルド順は web → server（rust-embed が `web/out` を取り込む）。ルート Makefile の PACKAGES 順を変えない
9. 実装が仕様と食い違うと分かったら、実装を黙って変えず docs/specs/ の該当ファイル更新とセットで提案する
10. Makefile のセンチネル行（`VERIFY: PASS` / `VERIFY-FAST: PASS`）と空チェックガードを消さない・変えない

## 検証

- 完了と言う前に `make verify` を実行し、`VERIFY: PASS` の出力を貼る。
  PASS の証拠が無い報告は未完了として扱う（Default-FAIL）。
- **E2E は本番形（release バイナリ＋使い捨て空DB）に対して回す**。`next dev` は `/api` を
  常駐本番の :48210 へ rewrites するため、dev サーバで E2E を書くと本番DBを壊す（禁止）。
  ユーザー操作を伴うタスクは受け入れ基準を `web/e2e/<task-id>.spec.ts` に足す
  （ファイル名固定＝録画をタスクへ紐づけるキー。夜勤ビューアが読む）。

## 実装担当者

- Frontend: Claude Code（Opus） / Backend: codex
- 検証: codex（fresh-context。コードレビュー＋ユーザー操作タスクは実機UI検証——dev-loop 手順5）
  （spec-to-linear の Models ラベルと dev-loop のルーティングがこの節を読む。
  プロジェクトで分担を変えるならここを書き換える）

## 振る舞い

- 範囲外の変更をしない。隣接コードに触れない（外科的変更）
- 大きな変更・破壊的操作の前に明示承認を取る
- 推測で進めず、不明点は質問する
- 失敗を黙ってスキップせず必ず報告する
- 作業後に変更点を要約する

## 記憶 / 保守

- 決定と却下案は MEMORY.md、失敗→成功手順は ERRORS.md に記録
- 同じミスをしたら、このファイルに再発防止ルールを追記する

## 役割分担（このプロジェクトの場合）

- Hooks: 編集パッケージの typecheck/cargo check（PostToolUse）・`make verify-fast`（Stop）— 登録済み
- Skills: dev-loop / spec-to-linear / linear-to-beads（開発フロー全体）
- Agents: 検証は fresh-context の評価者（dev-loop が起動）
