# 08. 「今日」画面仕様（Frontend）

**親**: [`00-overview.md`](./00-overview.md) ｜ **担当**: Frontend ｜ **範囲**: `app/page.tsx`＋`features/day/`（F1 表示・F2 消し込み）

## 1. 目的

今日の due タスクを開いた瞬間に見せ、タップ1回で消し込める画面。Slack スレッド✅運用の置き換え先。

## 2. 入出力

- **入力**: `GET /api/days/today`（SWR・`useDay`）
- **出力**: `POST /api/days/today/checks/{taskId}`（`useToggleCheck`・optimistic）

DTO は [`03-api.md`](./03-api.md) §3 を正とする。

## 3. 処理詳細

- **ProgressHeader**: 日付＋曜日（例: `2026-07-26（日）`）と進捗（`progress.done / progress.total`。例: `2 / 9`）。セグメントバー＋PROGRESS/REMAINING 行を含む計器盤様式（正本 `docs/design/02-today.md`）。全完了時は ALL CLEAR バナーを表示する
- **TaskList ヘッダ行**: `TASKS` / `{n} ITEMS`（デザイン確定 2026-07-26 で追加）
- **TaskList / TaskItem**: `tasks` を受領順（= sort_no 順）に表示。各行に:
  - チェック状態（done でチェック済みスタイル・打ち消し線等）
  - `content` と、メタ行 `{time}  [{tool}]`（区切りは半角空白2つ。`tool` が空または `-` のときはツール部を出さない。両方無ければメタ行ごと非表示）。正本は `docs/design/02-today.md` のコンポーネント一覧
  - **`effort`（実施列）は画面に表示しない**（2026-07-26 裁定）。行のメタは時刻とツールに絞り、所要時間を出したい場合は Vault 側で内容に含める運用とする（例: `英語学習（1時間）`）。API・スキーマ・パースは従来どおり `effort` を保持する（[`03-api.md`](./03-api.md) §3・[`02-data-model.md`](./02-data-model.md)・[`04-routine-parse.md`](./04-routine-parse.md) は変更しない）
  - 行全体がタップターゲット（44px 以上）。タップで `useToggleCheck` を呼びトグル
- optimistic update: タップ即時に UI 反映 → POST 失敗時ロールバック＋ErrorBanner（[`07-web-foundation.md`](./07-web-foundation.md) §6）
- `tasks` が空（今日 due 0件）: 「今日のタスクはありません」の空状態表示（エラーにしない）
- SWR `revalidateOnFocus` により、復帰時に他端末での消し込みが反映される

## 4. 設定値・確定値

- 表示順はサーバー返却順をそのまま使う（クライアントで再ソートしない）
- 過去日はこの画面では扱わない（履歴画面の責務）

## 5. インターフェース

`features/day` は `index.ts` barrel で `DayView`（読み書き可否 prop 付き）等を公開し、履歴画面（[`09-web-history.md`](./09-web-history.md)）が readonly モードで再利用する。内部構成は [`07-web-foundation.md`](./07-web-foundation.md) §3。

## 6. エラー処理

- 500 `internal` / 通信失敗: ErrorBanner＋再検証待ち（既に描画済みのタスクは保持）
- トグル 404（当日スナップショットに無い ID を叩いた等）: ロールバック＋再検証
- ロード中はスケルトン（レイアウトシフトを避ける）

## 7. スコープ外

- タスクの追加・編集・削除（正本はルーティン表）
- 通知・リマインド

## 8. 関連仕様

- 基盤: [`07-web-foundation.md`](./07-web-foundation.md) ／ API: [`03-api.md`](./03-api.md)
- サーバー側ロジック: [`05-day-usecase.md`](./05-day-usecase.md)
- 履歴での再利用: [`09-web-history.md`](./09-web-history.md)
