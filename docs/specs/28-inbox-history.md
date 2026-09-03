---
status: confirmed
confirmed_rev: 9f77c39
---

# 28. 決着済み人間待ち項目の日付読み出し（domain・usecase・API）

**親**: [`00-overview.md`](./00-overview.md) ｜ **担当**: Backend ｜ **範囲**: `usecase/manage_inbox.rs`・`usecase/ports.rs`・`adapters/sqlite_repo.rs`・`infra/api`（`/api/inbox/items`）

[`24-inbox.md`](./24-inbox.md)（confirmed・実装済み）への**増分**。テーブル・DTO・決定の記録・適用ループの接続はすべて変更しない。**足すのは読み出しのクエリ1形だけ**。

## 1. 目的

24 が定めた読み出しは3形（`status=open` / `source={source}&status=decided&applyState=pending` / `applyState=failed`）で、いずれも「これから処理するもの」を引く口である。その結果、**決着した項目を読み返す経路が存在しない**。

- `read` / `alert` は決定した瞬間（`status = read` / `acknowledged`）に3形のどれにも掛からなくなる。`bodyMd` ごと画面から消える
- `approve` / `choose` は係が適用した瞬間（`apply_state = applied`）に `decided&pending` から外れて同じく消える

2026-09-03 に本人が「承認とか読んだとかにしたらデータが見れなくなる」と報告した。行は SQLite に残っており（同日時点で `read` 2件・`acknowledged` 2件・`approved` 6件・`rejected` 1件）、失っているのは読み出し口だけである。

「読んだ印を付けるだけ」（25 §3.2）と説明したボタンが、押すと本文を視界から永久に落とす。**印を付ける操作が破棄の操作になっている**のが解くべき不整合で、これは画面側の描き方（25 §3.2 の「今日決めたもの」はキャッシュ上の残骸で、再取得すると消える）では塞げない。サーバに読み出し口が要る。

## 2. 入出力

- **入力**: `GET /api/inbox/items?date=YYYY-MM-DD`
- **出力**: `{ "items": [...] }`（既存の items と同形・[`03-api.md`](./03-api.md) §3）
- 新しいテーブル・カラム・DTO は作らない（[`02`](./02-data-model.md) §7 の `inbox_items` をそのまま読む）

## 3. 処理詳細

### 3.1 クエリ

1. `date` が単独で指定されたとき、その業務日（`inbox_items.date`）の項目を **`status` を問わず全件**返す
2. 並びは **id 降順**（新しい順。既存3形の `date DESC, id DESC` と同じ向き。単一日なので date は効かない）
3. **`expires_at` 超過の行も返す**。24 §4 が既定表示から外しているのは「これから決めるもの」の話で、履歴では期限切れこそ読み返す対象になる（自分が見落としたまま流れた項目は、この経路でしか見えない）
4. `date` は他のパラメータと**併用不可**。`source` / `status` / `applyState` のいずれかと同時に来たら 400。組み合わせを増やすと、24 §3.4 が「クエリ専用の合成値」で保っている読み出しの単純さが崩れる
5. 件数の上限は設けない。日付で絞られており、1日ぶんは取り込み時の batch サイズ制限（24 §3.1）で既に有界

### 3.2 未来日・記録の無い日

- 該当行が無ければ `{ "items": [] }` を 200 で返す。404 にしない（24 §6 の「受信ゼロなら空配列」と揃える）
- 今日より後の日付も拒否しない（空が返るだけ）。**サーバは日付の意味を判断しない**。未来へ進ませない制御は画面の責務（[`29-web-inbox-history.md`](./29-web-inbox-history.md) §3.2・[`09`](./09-web-history.md) §3 と同じ分担）

### 3.3 日付の妥当性

`YYYY-MM-DD` として解釈できない値は 400（既存の日付クエリと同じ扱い・[`03`](./03-api.md) §2）。

## 4. 設定値・確定値

- 読み出しは4形に固定する（`status=open` / `source&status=decided&applyState=pending` / `applyState=failed` / `date`）。それ以外の組み合わせは 400（24 §3.4 の規律を維持）
- 期間指定（`from` / `to`）・全文検索・ページングは持たない（§7）
- `date` は業務日（`inbox_items.date`）であって受信時刻（`received_at`）ではない。送信側が業務日を決める原則（24 §3.1）は読み出しでも同じ

## 5. インターフェース

- `usecase/ports.rs` の `InboxRepository` に `list_inbox_items_by_date(&self, date: &str)` を1つ足す
- `adapters/sqlite_repo.rs` は既存の `list_inbox_items` ヘルパへ条件 `date = ?1` と並び `id DESC` を渡すだけ（`inbox_items_status_date` は複合先頭が `status` のため date 単独では効かないが、テーブル規模が小さく走査で足りる。インデックスは足さない）
- `usecase/manage_inbox.rs` に `by_date(&self, date: &str)` を1つ。`Clock` は使わない（期限切れを除外しないため）
- `infra/api/handlers.rs` の `get_inbox_items` のマッチに `(None, None, None)` + `date` の分岐を1つ。DTO 変換は既存の `InboxItemsDto` を流用

## 6. エラー処理

| 事象 | 応答 |
|---|---|
| `date` が日付として不正 | 400 |
| `date` と他パラメータの併用 | 400（既存の「3形以外は 400」のメッセージに4形目を追記） |
| 該当0件 | 200 `{ "items": [] }` |

## 7. スコープ外

- 期間指定・全文検索・送信元での絞り込み（履歴を「探す」機能。必要になってから足す）
- 決着済み項目の削除・アーカイブ（24 は行を消さない設計）
- ページング（§3.1-5 の理由により不要）

## 8. 関連仕様

- 受け口の正: [`24-inbox.md`](./24-inbox.md) ／ 画面: [`29-web-inbox-history.md`](./29-web-inbox-history.md)
- API 契約: [`03-api.md`](./03-api.md) §3 ／ スキーマ: [`02-data-model.md`](./02-data-model.md) §7

## 実装単位

- [ ] [Backend] `date` クエリの読み出し（ports・sqlite_repo・usecase・handlers・`03-api.md` §3 の表と例に4形目を追記）
  - 受け入れ基準: 単体テストで、①その日の項目が status を問わず id 降順で返る ②`expires_at` 超過の行も含まれる ③該当0件の日は空配列を 200 で返す ④`date` と `status` / `source` / `applyState` の併用が 400 ⑤不正な日付が 400 ⑥既存3形の挙動が無変更（回帰）を検証。`make verify` PASS
