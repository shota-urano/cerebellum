---
status: confirmed
confirmed_rev: 44c069f
---

# 19. 「開発」画面仕様（run 履歴の一覧と詳細）

**親**: [`00-overview.md`](./00-overview.md) ｜ **担当**: Frontend ｜ **範囲**: `app/dev/page.tsx`・`features/dev/`・`shared/ui/RunCard`（夜勤ビューとの共通化）・ドロワー項目の変更

## 1. 目的

dev-loop の実行履歴——**夜勤（night-shift）も、人間が日中に手で回した分も**——を、新しい順の一覧からアプリ内で確認できるようにする。行を選ぶと PR リンクと検証動画（run 詳細）が見られる。

これにより夜勤ビューア（:48310）の人間向けページを開く理由がなくなり、「人間が見る画面は cerebellum 一つ」が完成する（2026-07-29 ユーザー決定）。夜勤ビューアは runs.json と動画ファイルの配信役（裏方）に徹する。

## 2. 入出力

- **入力**: 夜勤ビューアの `GET runs.json`（接続規則・https 時の path マウントは [`13-web-nightshift.md`](./13-web-nightshift.md) §4 と同一。`source` 付き——`night-shift` | `manual`、無記載は `night-shift` 扱い）
- **出力**: なし（表示のみ）
- **経路**: `/dev`（ドロワー4項目目「開発」）。詳細は `/dev?run={pj}/{run_id}`

## 3. 処理詳細

### 3.1 一覧（`/dev`）

1. `runs.json` の全件を**新しい順**に表示（サーバー返却順をそのまま。再ソートしない）
2. 1行に出すもの: **日付（run_id）**・**プロジェクト名**・**夜勤/手動のバッジ**（source。夜勤=🌙・手動=🔧 等で判別できる形）・**完了/失敗/blocked 数**（失敗・blocked が 0 でないときは目立たせる）
3. 行タップで詳細（§3.2）へ。`?run=` を付けた URL 遷移（ブラウザバックで一覧に戻れる）
4. 0件なら空状態「実行履歴はありません」

### 3.2 詳細（`/dev?run={pj}/{run_id}`）

- [`13-web-nightshift.md`](./13-web-nightshift.md) §3 の表示と**同じカード**（見出し・メタ行・PR ボタン・検証動画・フル確認ページリンク。動画の表示名規則・`#t=0.1` サムネも同一）
- 夜勤ビューとの差分は2つだけ: **「確認した」チェックが無い**（タスクではないため）／対象 run を日付でなく `?run=` で特定する
- 該当 run が無ければ「この run は見つかりません」＋一覧へ戻る導線

### 3.3 run カードの共通化

run 詳細カード（PR＋動画）は夜勤ビュー（13）と本画面の2箇所で使う。**feature 間 import は禁止**（[`07-web-foundation.md`](./07-web-foundation.md) §3）のため、カードを `shared/ui/RunCard` へ降ろし、nightshift feature と dev feature の両方が barrel 経由で使う。データ取得（runs.json フェッチ・https 分岐）も共通のため `shared/api` へ降ろしてよい。

## 4. 設定値・確定値

- ドロワー項目は「今日・履歴・ルーティン・開発」＋ハーネス（[`18`](./18-web-harness.md) 実装時）になる（[`16-web-navigation.md`](./16-web-navigation.md) §3 の 2026-07-29 夕方改訂とセット。ダイジェスト・夜勤の項目は撤去）
- `source` の正本は viewer の `meta.json`（build-viewer.py が公開時に刻む。dev-loop=manual／night-shift=night-shift。無記載の旧データは night-shift 扱い）
- 一覧は全件表示（ページング・絞り込みは持たない。件数が問題になったら仕様改訂で扱う）

## 5. インターフェース

- 構成規約: `app → features → shared`・feature 間 import 禁止・barrel 経由（[`07-web-foundation.md`](./07-web-foundation.md) §3）
- 夜勤ビュー（13）は本仕様の RunCard 共通化後も**振る舞いを変えない**（当日の夜勤 run 1件＋「確認した」チェック）

## 6. エラー処理

| 状況 | 表示 |
|---|---|
| runs.json 取得失敗 | `ErrorBanner`（「夜勤ビューアに接続できません」） |
| 履歴 0件 | 空状態（エラーにしない） |
| `?run=` が見つからない | 「この run は見つかりません」＋一覧への導線 |

## 7. スコープ外

- ページング・検索・プロジェクト絞り込み
- run の削除・編集（表示のみ）
- 受け入れ基準・スクショの再実装（フル確認ページへのリンクで足りる。13 と同じ）
- 夜勤ビューア（:48310）の人間向け HTML の廃止作業（当面は残す。入口として案内しないだけ）

## 8. 見た目

- 専用のデザイン仕様は作らない（[`16-web-navigation.md`](./16-web-navigation.md) §8 と同じ方針）。一覧は履歴画面のリスト様式・詳細は `panel dg` 様式を流用

## 9. 関連仕様

- run 詳細の表示規則・接続規則: [`13-web-nightshift.md`](./13-web-nightshift.md)
- ドロワー: [`16-web-navigation.md`](./16-web-navigation.md) ／ データ形の正本: `~/workspace/kit/develop/night-shift/scripts/build-viewer.py`（meta.json / runs.json の `source`）

## 実装単位

- [ ] [Frontend] RunCard・runs.json 取得の共通化（nightshift feature から `shared/` へ降ろし、夜勤ビューを置き換え）＋夜勤ビューの当日 run 選択を `source=night-shift`（無記載含む）限定へ
  - 受け入れ基準: 夜勤ビューの表示・「確認した」動線が従来どおり動き（既存 E2E・smoke を含む）、run 選択が source で絞られていることをコードレビューで確認できる。`make verify` PASS
- [ ] [Frontend] 「開発」画面（`/dev` 一覧＋ `?run=` 詳細）とドロワー項目変更（開発を追加・ダイジェスト/夜勤を撤去。ハーネス項目は [`18`](./18-web-harness.md) の実装単位が担当）
  - 受け入れ基準: E2E（`web/e2e/<task-id>.spec.ts`）で検証が通る——ドロワーに「開発」があり、ダイジェスト・夜勤が無い・`/dev` で一覧が新しい順に出る（夜勤/手動バッジ含む）・行タップで詳細（PR ボタン・動画枠）が出る・ブラウザバックで一覧へ戻る。runs.json は E2E 用のフィクスチャを配信して検証する（:48310 実サーバに依存しない）。`make verify` PASS
