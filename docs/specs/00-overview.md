# cerebellum システム全体仕様書（Overview）

**一次情報源**: [`../要件定義.md`](../要件定義.md) / [`../アーキテクチャ.md`](../アーキテクチャ.md) / [`../アーキテクチャ詳細.md`](../アーキテクチャ詳細.md)
**パース仕様の出自**: second-brain Vault `.claude/skills/daily-tasks/scripts/post.py`（本仕様書群に転記済み → [`04-routine-parse.md`](./04-routine-parse.md)。2026-07-27 に Slack 側を停止したため、以後は同期義務なし）

## 1. プロダクト概要

second-brain の日次ルーティンを消し込む**自分専用の運用ダッシュボード**。ルーティン表の正本も日々の記録も SQLite（2026-07-27 に Vault md から移管）。Rust 単一バイナリ（axum＋rust-embed）が Next.js 静的出力を配信し、Tailscale 経由でスマホからも使う。ローカル完結・外部サービスなし・インターネット非公開。

Phase 1 = 今日のタスク表示・消し込み・履歴閲覧・スナップショット確定（実装済み）。
Phase 1.5（進行中）= ルーティン表マスタの SQLite 移管とブラウザからの編集。
Phase 1.6 = 朝ダイジェストの取り込みと詳細ビュー（Slack 停止に伴い、Phase 2 の digest を一部前倒し）。
Phase 1.7 = 学習セッション（[14](./14-learning.md)・[15](./15-web-learning.md)）とハーネス承認（[17](./17-harness-approval.md)・[18](./18-web-harness.md)）。いずれも second-brain の夜間ハーネスが push し、画面での入力を翌日の自動処理が読み戻す双方向ループ。
Phase 1.8 = 「オフィス」画面（[20](./20-web-office.md)・[21](./21-web-office-roster.md)）。Orca automation の勤務帯・直近報告・社員名簿の表示。Frontend のみで、cerebellum のスキーマ・API は無変更。
Phase 1.9 = 「あなた待ち」画面（[22](./22-daily-intake.md)・[23](./23-web-waiting.md)）。daily取り込み候補（ToDo・考え・口調）の承認を Obsidian のチェックから画面のタップへ移す。17/18 と同じ「Vault が正本・cerebellum は人間の意思だけ持つ」双方向ループ。**→ 出荷せず Phase 2.0 に畳む（2026-09-02 決定）**。
Phase 2.0 = 人間待ち項目の汎用化（[24](./24-inbox.md)・[25](./25-web-inbox.md)）。ハーネスごとに専用 API・画面を作る二重工事をやめ、「承認・選択・読む・異常」の4種類を1つの口で受ける。second-brain 側で社員カードに `review` を書けば枠が自動で立つ。Slack 通知の全廃止先でもある。cerebellum に載るものは「人間の日課」「学習」「AI からの確認待ち」の3種類と整理し、「今日」画面でこの3種を1枚に集約する。学習は固有の構造を持つため専用のまま残す唯一の例外。あわせてオフィスへの会社案内追補（[26](./26-web-office-company.md)）を同 Phase の Frontend 増分として含む（20・21 と同じくスキーマ・API は無変更）。全景の部署化（[27](./27-web-office-departments.md)）も同 Phase の Frontend 増分——26 が「部屋と部署は別軸で並存」と据え置いた4部屋を、名簿の正本になった `dept` の8部署で切り直す（2026-09-03 に本人が全景を見て「部署が古い。4つしか無い」と読んだ）。「今日」画面の段の並び替え（[30](./30-web-today-order.md)。計器盤を最上部に残して WAITING → LEARNING → TASKS）も同様。決着済み項目の読み返し（[28](./28-inbox-history.md)・[29](./29-web-inbox-history.md)）も同 Phase の増分——24 の読み出し3形はすべて「これから処理するもの」を引く口で、決めた項目を後から読む経路が無かった（2026-09-03 に本人が「承認とか読んだとかにしたらデータが見れなくなる」と報告）。

## 2. システム全体像

```
┌─ Mac（常駐・launchd） ──────────────────────────────────┐
│  cerebellum（Rustバイナリ1個）            [06-cli-serve]   │
│  ├ 静的配信: Next.js export（rust-embed）[07/08/09/10-web-*]│
│  ├ JSON API: axum                        [03-api]         │
│  ├ core: due判定／ソート／task_id          [04-routine-parse]│
│  │       スナップショット確定／トグル／サマリ [05-day-usecase] │
│  │       ルーティンマスタ CRUD             [05-day-usecase] │
│  ├ store: SQLite（WAL・routines＝正本）     [02-data-model]  │
│  └ vault: md 読み取り（初期 import のみ）   [06-cli-serve]  │
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
| 04 | [`04-routine-parse.md`](./04-routine-parse.md) | due 判定・ソート・task_id（domain）＋初期 import 用 md パース | Backend |
| 05 | [`05-day-usecase.md`](./05-day-usecase.md) | 日取得・スナップショット ensure・トグル・サマリ・マスタ CRUD（usecase） | Backend |
| 06 | [`06-cli-serve.md`](./06-cli-serve.md) | CLI（serve / import-routines）・起動・静的配信・health・常駐 | Backend |
| 07 | [`07-web-foundation.md`](./07-web-foundation.md) | Next.js 基盤（構成・データ取得・スタイル・PWA下準備） | Frontend |
| 08 | [`08-web-today.md`](./08-web-today.md) | 「今日」画面（表示・消し込み） | Frontend |
| 09 | [`09-web-history.md`](./09-web-history.md) | 「履歴」画面（日付ナビ・過去日読み取り専用・サマリ） | Frontend |
| 10 | [`10-web-routines.md`](./10-web-routines.md) | 「ルーティン」画面（マスタ編集） | Frontend |
| 11 | [`11-digest.md`](./11-digest.md) | 朝ダイジェストの取り込み・パース（domain/usecase/API） | Backend |
| 12 | [`12-web-digest.md`](./12-web-digest.md) | ダイジェスト詳細ビュー（タスクからの導線・読了チェック） | Frontend |
| 13 | [`13-web-nightshift.md`](./13-web-nightshift.md) | 夜勤詳細ビュー（1夜1 run・PRリンク/検証動画） | Frontend |
| 14 | [`14-learning.md`](./14-learning.md) | 学習セットの取り込み・成績記録（domain/usecase/API） | Backend |
| 15 | [`15-web-learning.md`](./15-web-learning.md) | 学習セッションビュー（レッスン→問題→回答→感想の一本道） | Frontend |
| 16 | [`16-web-navigation.md`](./16-web-navigation.md) | ナビゲーション改訂（タブバー廃止→ヘッダー＋ドロワー） | Frontend |
| 17 | [`17-harness-approval.md`](./17-harness-approval.md) | ハーネス取り込み提案の受け入れ・承認記録（domain/usecase/API） | Backend |
| 18 | [`18-web-harness.md`](./18-web-harness.md) | ハーネス承認ビュー（1行要約で判断・チェックが翌朝の適用入力になる） | Frontend |
| 19 | [`19-web-dev-history.md`](./19-web-dev-history.md) | 「開発」画面（夜勤・手動 run の履歴一覧と詳細） | Frontend |
| 20 | [`20-web-office.md`](./20-web-office.md) | 「オフィス」画面（automation の勤務帯と直近報告） | Frontend |
| 21 | [`21-web-office-roster.md`](./21-web-office-roster.md) | 社員名簿（プロフィール・手動起動社員。20 の増分） | Frontend |
| 22 | [`22-daily-intake.md`](./22-daily-intake.md) | daily取り込み候補の受け入れ・承認記録（domain/usecase/API）**superseded → 24** | Backend |
| 23 | [`23-web-waiting.md`](./23-web-waiting.md) | 「あなた待ち」画面（daily取り込みの承認・レーン別タップ）**superseded → 25** | Frontend |
| 24 | [`24-inbox.md`](./24-inbox.md) | 人間待ち項目（汎用）の受け入れ・決定記録・summary（domain/usecase/API） | Backend |
| 25 | [`25-web-inbox.md`](./25-web-inbox.md) | 「今日」の3種集約（日課・学習・確認待ち）と「あなた待ち」汎用画面 | Frontend |
| 26 | [`26-web-office-company.md`](./26-web-office-company.md) | オフィスの会社案内追補（所属部署・人間確認の印・会社案内シート。20/21 の増分） | Frontend |
| 27 | [`27-web-office-departments.md`](./27-web-office-departments.md) | オフィス全景を部署ベースに（4部屋の廃止・8部署の部屋・`departments` の受け取り。20/26 の増分） | Frontend |
| 28 | [`28-inbox-history.md`](./28-inbox-history.md) | 決着済み人間待ち項目の日付読み出し（`?date=`。24 の増分） | Backend |
| 29 | [`29-web-inbox-history.md`](./29-web-inbox-history.md) | 「あなた待ち」の決着済み表示と日付切り替え（25 の増分） | Frontend |
| 30 | [`30-web-today-order.md`](./30-web-today-order.md) | 「今日」画面の段の並び替え（計器盤を残して WAITING → LEARNING → TASKS。25 の増分） | Frontend |

## 4. 確定済みの初期値（横断・変更禁止）

| 項目 | 確定値 | 詳細 |
|---|---|---|
| ルーティン表の正本 | SQLite `routines`（2026-07-27 に Vault md から移管）。編集は `/api/routines` と「ルーティン」画面から | [02](./02-data-model.md)・[10](./10-web-routines.md) |
| Vault の扱い | `import-routines`（初期移行）でのみ読む。`serve` は参照しない。**書き込みは常に禁止** | [06](./06-cli-serve.md) |
| ダイジェスト | second-brain 側が生成し `POST /api/digests` で送る（push）。cerebellum は生成も Slack 送信もしない | [11](./11-digest.md) |
| 学習セット | second-brain の `night-study` が生成し `POST /api/learning/sets` で送る（push）。正本は cerebellum SQLite（2026-07-29 に Vault `40_Projects/learning` から移管決定）。cerebellum は生成も verify 実行もしない | [14](./14-learning.md) |
| ハーネス提案 | second-brain の `night-harness` が判定し `POST /api/harness/proposals` で送る（push）。画面のチェック＝承認の正本、翌朝06:20 の無人 `--apply` がそれを読んで適用する。cerebellum は判定も適用もしない（2026-07-29 決定・Slack 廃止） | [17](./17-harness-approval.md) |
| daily取り込み候補 | second-brain の `daily-harness` が毎晩 00:40 に仕分けて `POST /api/intake/candidates` で送る（push・0件の日も送る）。**正本は Vault の候補ファイル**で、画面の✅は同じ 00:40 の実行冒頭に候補ファイルへ書き戻されてから適用される。cerebellum は仕分けも適用も Linear 起票もしない（2026-08-29 決定） | [22](./22-daily-intake.md) |
| 人間待ち項目 | second-brain の各 skill が `POST /api/inbox/batches` で送る（push・**0件でも送る**）。kind は `approve` / `choose` / `read` / `alert` の4値固定。cerebellum が持つのは人間の意思（`status`）と機械の結果（`apply_state`）だけ。「今日届いているべき送信元」は名簿（office.json の `profile.review`）が正本で、サーバは受信の事実だけを持つ。ハーネス承認（17）と daily取り込み（22）はこの口へ移し、専用 API は移行完了後に撤去する（2026-09-02 決定） | [24](./24-inbox.md) |
| detail_ref | `digest.connection` / `digest.derive` / `digest.idea` / `digest.consolidate` ＋ `nightshift.report`（2026-07-28）＋ `learning.session`（[14](./14-learning.md)・実装時追加）＋ `harness.proposals`（[17](./17-harness-approval.md)・実装時追加）＋ `inbox.items`（[24](./24-inbox.md)・実装時追加。`intake.candidates` は出荷しない） | [02](./02-data-model.md) §6 |
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

## 5. スコープ外（Phase 1 / 1.5 では実装しない）

- 下書き一覧・通知の自前実装・メトリクス可視化（Phase 2 以降）
  ※**承認フローはハーネス取り込みに限り Phase 1.7 として前倒し**（[17](./17-harness-approval.md)・[18](./18-web-harness.md)）。X ポスト等の下書き承認は対象外のまま
  ※**automation の勤務帯と直近報告の表示に限り Phase 1.8 として前倒し**（[20](./20-web-office.md)）。集計・コスト可視化は対象外のまま
  ※**daily取り込み候補の承認に限り Phase 1.9 として前倒し**（[22](./22-daily-intake.md)・[23](./23-web-waiting.md)）。承認の前倒しはハーネス取り込みと daily取り込みの2つだけで、X ポスト等の下書き承認は対象外のまま
- digest の**生成**（second-brain の `daily-digest` skill が持つ。cerebellum は受け取って表示するだけ → [11](./11-digest.md)）
- **時計駆動の仕組み全般**（日次 ensure・リマインド・launchd の定期実行）。Phase 2 の通知と一体で設計する（[05](./05-day-usecase.md) §7 にトレードオフを記載）
- 単発 TODO の追加（対象は繰り返しのルーティンのみ）
- 過去日の消し込み変更・確定済みスナップショットの当日書き換え
- ルーティンの並び替え UI・編集履歴・md へのエクスポート
- Vault への書き込み・既存スキル/routine の変更・インターネット公開

## 6. 用語

| 用語 | 意味 |
|---|---|
| Vault | second-brain の Obsidian ディレクトリ（Google Drive 同期） |
| ルーティン表 | 繰り返しタスクのマスタ。正本は SQLite `routines`（移行元は `人間のルーティン.md` の md テーブル。列: 間隔/時間/実施/確認ツール/内容） |
| due | ルーティン行がその日の対象であること（毎日/平日/週末/曜日で判定） |
| スナップショット | その日の対象タスク一覧を SQLite `task_days` に確定保存したもの。過去日表示の正 |
| 消し込み | タスクのチェック ON/OFF（`task_checks`）。当日のみ変更可 |
