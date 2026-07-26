# 画面インベントリ

specs から導出（2026-07-26）。既定通り**全画面 A・B 両方**のプロンプトを生成。

| # | 画面名 | 対応spec | プロンプトに含める状態 | A生成順 |
|---|---|---|---|---|
| 01 | 今日（消し込み） | [`../../specs/08-web-today.md`](../../specs/08-web-today.md) | 通常（一部完了）／全完了／空（今日のタスクはありません）／エラーバナー | **1（基準画面）** |
| 02 | 履歴（読み取り専用＋サマリ） | [`../../specs/09-web-history.md`](../../specs/09-web-history.md) | 過去日 readonly＋7日サマリ／記録なし | 2（基準画面参照） |

- A用: `a-image/01-today.prompt.md` → `a-image/02-history.prompt.md` の順に生成（01 が基準画面）
- B用: `b-code/brief.md` を Claude design の新規セッションに1回貼る（両画面を含む単一プロトタイプ）
- 採用フロー: 画面ごとに A/B を比較し、採用A→`../mockups/<screen>.png`、採用B→`../reference/`＋`SCREENS.md`。**同一画面の両案を置かない**
