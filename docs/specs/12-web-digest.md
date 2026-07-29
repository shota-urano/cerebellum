---
status: confirmed
confirmed_rev: 06bb148
---

# 12. ダイジェスト詳細ビュー仕様（画面）

**親**: [`00-overview.md`](./00-overview.md) ｜ **担当**: Frontend ｜ **範囲**: `app/digest/page.tsx`・`features/digest/`・「今日」画面の詳細導線

## 1. 目的

朝のダイジェスト（つながり／導出／アイデア／consolidate）を、Slack より読みやすい形で表示する。タスク「つながり発見」をタップして中身を読み、読み終えたらそのタスクを消し込む——という一連の動作を1画面内で完結させる。

## 2. 入出力

- **入力**: `GET /api/digests/{date}`（[`03-api.md`](./03-api.md) §2）。タスク側の `detailRef` は `GET /api/days/{date}` の DTO に含まれる
- **出力**: なし（表示のみ。消し込みは既存の `POST /api/days/today/checks/{taskId}`）
- **経路**: `/digest?date=YYYY-MM-DD&section=connection`（date 省略時は今日、section 省略時は全セクション）

## 3. 処理詳細

### 3.1 「今日」画面からの導線（重要）

`detailRef` を持つ行は**タップ領域を2つに割る**（2026-07-27 改訂。当初はシェブロンだけを遷移先にしていたが、読みに行く動作のほうが主なので反転させた）。

| 領域 | 動作 |
|---|---|
| **チェックリング** | チェックのトグル（従来どおり） |
| **それ以外の面全体**（内容・メタ・右端のシェブロン） | `/digest?date={その日}&section={detailRef の後半}&taskId={task_id}` へ遷移。`detailRef = nightshift.report` のときは `/nightshift?date={その日}&taskId={task_id}`（夜勤詳細ビュー → [`13-web-nightshift.md`](./13-web-nightshift.md)）へ遷移する（2026-07-28 追加） |

1. リングのタップターゲットは 44px 以上を確保する（リング自体は 22px なので、囲む領域で満たす）
2. 分割後も**通常行と同じ位置**に揃える（リング中心・本文開始位置を変えない）
3. 右端のシェブロン（›）は「詳細がある」ことの手がかりとして残す。単独のタップ領域ではなく、遷移面の一部
4. `detailRef` が無いタスク行は**従来どおり行全体がトグル**（見た目も変えない）
5. 読み取り専用（過去日）ではリングをボタンにせず、遷移面だけを生かす

### 3.2 詳細ビュー

1. `useDigest`（SWR・`GET /api/digests/{date}`）で取得
2. `section` 指定があればそのセクションを先頭に出し、他セクションは下に続ける（**切り捨てない**。ついでに読めるほうが良い）
3. 各ブロックを型に応じて描画する（[`11-digest.md`](./11-digest.md) §3.2 の block.kind）:

| kind | 表示 |
|---|---|
| `lead` | 起点。ラベル「起点」＋本文を目立たせる |
| `chain` | 連鎖。左に矢印の視覚要素を置き、`note_path` があれば末尾にノートリンク |
| `bullet` | 箇条書き。畳んだ続き行は同じブロック内の段落として出す |
| `saved` | 「保存済み」。ノートリンク＋控えめな注記スタイル |
| `warning` | 警告色（`--error`）の左ボーダー付き（ErrorBanner と同じ様式） |
| `text` | 本文段落 |

4. セクション見出しは絵文字＋日本語ラベル（§3.3）
5. 読了後の動線: 画面下部に**「読んだ」チェック**を置く。押すと元タスクの `POST /api/days/today/checks/{taskId}` を呼び、「今日」画面へ戻る。過去日（`readonly`）では出さない
6. 日付ナビは持たない（履歴を辿るのは「履歴」画面の役割）。`?date=` の直リンクだけ受け付ける

### 3.3 記法の変換（表示側の責務）

- `:name:` ショートコード → 絵文字。対応表は**この画面が持つ**（サーバーは変換しない）:
  `:brain:`🧠 `:jigsaw:`🧩 `:bulb:`💡 `:bar_chart:`📊 `:warning:`⚠️ `:chart_with_upwards_trend:`📈
  対応表に無いショートコードは**元の文字列のまま出す**（消さない）
- `emphasis` → 強調表示（太字ではなく accent 色でも良い。既存トークンの範囲で）
- `note_path` → Obsidian で開くリンク（`obsidian://open?vault=second-brain&file=<URL エンコード済みパス>`）。パスは可視のまま残す

### 3.4 状態

- ロード中: スケルトン（既存2画面と同じ様式）
- その日のダイジェストが無い（`sections: []`）: 「今朝のダイジェストはまだ届いていません」＋今日画面へ戻る導線
- 取得失敗: `ErrorBanner`

## 4. 設定値・確定値

- 経路 `/digest`。当初はタスクからの導線のみ（タブバーには追加しない・2026-07-28）→ 2026-07-29 のナビ改訂でドロワー項目に追加（[`16-web-navigation.md`](./16-web-navigation.md)）。タスクからの導線は従来どおり残す
- 表示順はサーバー返却順（セクション・ブロックとも再ソートしない）
- ノートリンクは `obsidian://` スキーム固定（Web で中身を表示しない → [`11-digest.md`](./11-digest.md) §7）

## 5. インターフェース

- API: [`03-api.md`](./03-api.md) §2・§3 ／ 型: `shared/api/types.ts`（手動同期）
- 構成規約（`app → features → shared`・feature 間 import 禁止・barrel 経由）: [`07-web-foundation.md`](./07-web-foundation.md) §3
- 「読んだ」チェックは day feature のトグルを使う。**digest feature が day feature を import しない**——`app/digest/page.tsx` が両者を合成する

## 6. エラー処理

| 状況 | 表示 |
|---|---|
| 取得失敗・500 | `ErrorBanner`（描画済みは保持） |
| 400 `bad_request`（date 不正） | 「不正な日付」＋今日へのリンク（履歴画面と同じ扱い → [`09-web-history.md`](./09-web-history.md) §6） |
| トグル失敗 | ロールバック＋`ErrorBanner`（今日画面と同じ） |

## 7. スコープ外

- ダイジェストの編集・再生成の起動
- 全文検索・過去分の一覧
- ノート本体の表示（Obsidian に渡すだけ）
- 常設ナビ導線の定義（[`16-web-navigation.md`](./16-web-navigation.md) の責務）

## 8. 関連仕様

- 取り込み・パース: [`11-digest.md`](./11-digest.md) ／ データ: [`02-data-model.md`](./02-data-model.md) §6
- 導線元: [`08-web-today.md`](./08-web-today.md) ／ 基盤: [`07-web-foundation.md`](./07-web-foundation.md)
- 見た目: 専用のデザイン仕様・プロトタイプは作らない。トークンは `docs/design/system/01-tokens.md`、様式は既存画面（`web/src/features/day/` ・ `web/src/features/history/`）から流用する
