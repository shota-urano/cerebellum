---
status: confirmed
confirmed_rev: 9f77c39
---

# 30. 「今日」画面の段の並び替え（計器盤を残して WAITING → LEARNING → TASKS）

**親**: [`00-overview.md`](./00-overview.md) ｜ **担当**: Frontend ｜ **範囲**: `app/page.tsx`・`features/day/`（`DayView` の2分割）・`docs/design/02-today.md`

[`25-web-inbox.md`](./25-web-inbox.md) §3.1（confirmed・実装済み）への**増分**。3段の中身・文言・判定・タップ先・赤点の意味は一切変更しない。**変えるのは並びだけ**——`AGENTS.md` ルール9 に従い、実装を先に動かさず本仕様で置き換えを宣言する。

## 1. 目的

25 §3.1 は「TASKS（日課）→ LEARNING → WAITING」の順で並べ、第1段のファーストビューを侵食しないことを条件にした。2026-09-03 に本人が並びを **WAITING → LEARNING → TASKS** に変更すると判断した。開いた瞬間に見えるのを「AI からの確認待ち」にする。

ただし計器盤ヘッダ（`HeaderPanel`＝日付・進捗バー・`CLEARED {done}/{total}`・**確認待ちの赤点**）は**最上部に残す**。赤点は 25 §3.1 が定めた「第3段の異常の合図」であり、WAITING の直上に置くことで合図と中身が隣り合う。TASKS 一覧と一緒に最下段へ下げると、合図がスクロールの先に隠れて機能を失う。

## 2. 入出力

- **入力**: 変更なし（`GET /api/days/today`・`GET /api/learning/sets/today`・`GET /api/inbox/summary`・`office.json`。25 §2・[`08`](./08-web-today.md) §2）
- **出力**: 変更なし
- **経路**: `/`（今日）のみ。`/history`（[`09`](./09-web-history.md)）は**無変更**

## 3. 処理詳細

### 3.1 並び（25 §3.1 の表と `docs/design/02-today.md`「レイアウト構造」の置き換え）

上から:

| # | 要素 | 出どころ |
|---|---|---|
| 1 | （エラー時のみ）ErrorBanner | 既存 |
| 2 | **計器盤ヘッダ**（`HeaderPanel`。日付・進捗バー・`CLEARED`・赤点） | 08 §3・25 §3.1（赤点） |
| 3 | **WAITING**（`InboxSummaryStrip`。kind 別4件数＋未着行） | 25 §3.1 第3段・§3.3 |
| 4 | **LEARNING**（`LearningTodayLine`。状態1行） | 25 §3.1 第2段 |
| 5 | （全完了時）AllClear ／（空時）EmptyState | 08 §3 |
| 6 | **TASKS**（`TaskList`。ヘッダ行付きパネル） | 08 §3 |

- **段の呼び名を捨てる**。25 §3.1 の「第1段／第2段／第3段」は並び順を指す語だったので、以後は見出し名（TASKS / LEARNING / WAITING）で呼ぶ。25 の本文中の「第n段」は並びの意味を失い、**枠の識別子として読む**（§8-1 で注記する）
- **ALL CLEAR と EmptyState は TASKS の直上に置く**（表の5）。どちらも日課の一覧に対する状態表示なので一覧と離さない。計器盤の直下（画面最上部）には置かない——計器盤は合図に徹する
- 赤点の判定（`hasInboxAlert`）・ALL CLEAR と進捗の計算（AI 側の異常を混ぜない）は 25 §3.1 のまま。**並び替えで判定を触らない**

### 3.2 ファーストビューの条件（25 §3.1 の条件の置き換え）

- 390px 幅（[`07`](./07-web-foundation.md) §4）の最初の viewport に **計器盤ヘッダと WAITING（見出し＋kind 別4件数）が入る**こと。LEARNING・TASKS はスクロールして見えてよい
- 未着行（25 §3.3）は WAITING の中で件数の下に続く。未着が複数あって LEARNING が押し出されるのは許容する（未着は異常なので押し出す側が正しい）
- 旧条件「第1段（日課）のファーストビューを侵食しない」は**破棄**する。TASKS はスクロールの先になる

### 3.3 変えないもの

- TASKS の中身・トグル・行の様式（08）／LEARNING の状態判定と 404 の読み方（25 §3.1・[`15`](./15-web-learning.md)）／WAITING の kind 並び順・固定文言・0 件の薄字・タップ先 `/waiting?kind={kind}`（25 §3.1・§4）
- 未着判定（25 §3.3）・名簿未登録バッジ（25 §3.4）・ドロワー（25 §3.5・[`16`](./16-web-navigation.md)）
- 過去日（`/history`・09）の構成。`ReadonlyHead` と読み取り専用の並びは現状のまま
- パネルの様式（`panel` ＋ `.list__head`）。同じ画面で様式を割らない（`docs/design/02-today.md`）

## 4. 設定値・確定値

- 並びは §3.1 の表に固定。**画面内に並び替えの設定・トグルを持たない**
- 計器盤ヘッダは常に最上部（`/` のみ。`/history` は対象外）
- スキーマ・API は無変更（[`02`](./02-data-model.md)・[`03`](./03-api.md) に追記しない・**Backend 作業ゼロ**）
- 取得の回数を増やさない。`useDay('today')` を2箇所から呼んでも SWR が同一キーで束ねる（重複 fetch を発生させない・[`07`](./07-web-foundation.md) §5）

## 5. インターフェース

- 構成規約（`app → features → shared`・feature 間 import 禁止・barrel 経由）: [`07`](./07-web-foundation.md) §3。**3枠を並べるのは `app/page.tsx`** のまま（25 §5）
- `features/day/components/DayView.tsx` を**2つに割る**（外科的分割・見た目は変えない）:
  - `DayHeader`（ErrorBanner・取得前のヘッダスケルトン・`HeaderPanel`／`ReadonlyHead`。props は `date`・`readonly`・`alert`）
  - `DayTasks`（取得前のリストスケルトン・`AllClear`・`EmptyState`・`TaskList`。props は `date`・`readonly`）
  - `DayView` は上記2つを順に描くだけの薄い合成に残す。`/history` の呼び出し（`DayView` に `readonly`）は**書き換えない**
  - `DaySkeleton` もヘッダ用とリスト用に割る（`docs/design/02-today.md` のスケルトン様式・寸法は転写のまま）
- `features/day` の barrel に `DayHeader`・`DayTasks` を公開する。`app/page.tsx` はこの2つ＋既存の `InboxSummaryStrip`・`LearningTodayLine` を §3.1 の順に並べる
- `shared/api/types.ts` は無変更

## 6. エラー処理

| 事象 | 表示 |
|---|---|
| `/api/days/today` 500・通信失敗 | ErrorBanner は最上部（`DayHeader` 側）。TASKS 枠はスケルトンを出さずバナーだけ（08 §6 の「永久スケルトンにしない」を踏襲） |
| 取得前（読み込み中） | ヘッダ・TASKS それぞれのスケルトン。**WAITING と LEARNING の描画を待たない**（枠ごとに独立。25 §6） |
| LEARNING・WAITING の失敗 | 25 §6 のまま。並びが変わっても互いを止めない |

## 7. スコープ外

- 3枠それぞれの中身・文言・判定の変更（すべて 08・15・25 のまま）
- 過去日（`/history`）の並び・`ReadonlyHead` の変更
- 計器盤ヘッダの中身の変更（赤点の意味・押せないこと・進捗の計算）
- 並び順をユーザーが変えられる設定
- MY DESK やオフィス側の表示（[`20`](./20-web-office.md)・[`27`](./27-web-office-departments.md)）

## 8. 他仕様への追記（confirmed 時に反映）

`AGENTS.md` ルール9 に従い、承認まで確定済みファイルを書き換えずに保留する3点:

1. [`25-web-inbox.md`](./25-web-inbox.md) §3.1 の表と「第1段のファーストビューを侵食しない」の記述に「→ 30 §3.1・§3.2 で置き換え。第n段は並びではなく枠の識別子として読む」を注記
2. `docs/design/02-today.md`「レイアウト構造（上から）」を §3.1 の表に差し替え、「第1段のファーストビューを侵食しないよう TaskList の下に置く」の1文を §3.2 の条件に改める。**スタイル値・文言の転写部分は触らない**
3. [`00-overview.md`](./00-overview.md) §3 の索引に 30 の行を追加（Phase 2.0 の Frontend 増分。Phase を増やさない）

## 9. 関連仕様

- 置き換える元: [`25-web-inbox.md`](./25-web-inbox.md) §3.1（3段構成）／`docs/design/02-today.md`「レイアウト構造」
- 枠の中身の正: [`08-web-today.md`](./08-web-today.md)（TASKS・計器盤）／[`15-web-learning.md`](./15-web-learning.md)（LEARNING）／[`24-inbox.md`](./24-inbox.md)・[`25-web-inbox.md`](./25-web-inbox.md)（WAITING）
- 基盤: [`07-web-foundation.md`](./07-web-foundation.md)

## 実装単位

- [ ] [Frontend] `DayView` を `DayHeader` / `DayTasks` に割り、`app/page.tsx` を §3.1 の順に並べ替える（§5・デザイン正本 `docs/design/02-today.md` のレイアウト構造も差し替え）
  - 受け入れ基準: E2E（`web/e2e/<task-id>.spec.ts`）で、①`/` が上から 計器盤 → WAITING → LEARNING → TASKS の順で描かれる ②390px の最初の viewport に計器盤と WAITING の kind 別4件数が入る ③確認待ちに異常があるとき計器盤右端に赤点が出て、日課の進捗・ALL CLEAR は変わらない ④全完了時の ALL CLEAR とタスク0件の EmptyState が TASKS の直上に出る ⑤`/api/days/today` の失敗でエラーバナーが最上部に出て WAITING・LEARNING は描かれ続ける ⑥`/history`（過去日）の並びと読み取り専用ヘッダが無変更（既存 E2E が無改修で PASS）⑦`useDay('today')` の fetch が1回に束ねられている（重複リクエストなし）ことを検証。`make verify` PASS
