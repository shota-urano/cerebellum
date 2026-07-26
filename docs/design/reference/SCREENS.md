# 採用画面 → ファイル対応表（design-writer の入力契約）

採用: **系統B（Claude design コードプロトタイプ）**・全画面。
出典: claude.ai/design プロジェクト `86a73959-42e7-4279-b568-a165fe0815b5`（2026-07-26 取り込み）。
`support.js` はプレビュー用ランタイム（生成物・読む必要なし）。詳細な要素対応は [`README.md`](./README.md) の表を参照。

| 画面 | 対応spec | 素材ファイル |
|---|---|---|
| 今日（消し込み） | `docs/specs/08-web-today.md` | `docs/design/reference/Daily Routine HUD.dc.html`（`isToday` 分岐＋共通シェル） |
| 履歴（読み取り専用＋サマリ） | `docs/specs/09-web-history.md` | `docs/design/reference/Daily Routine HUD.dc.html`（`isHistory` 分岐＋共通シェル） |

- 単一プロトタイプのため両画面とも同一ファイル。画面内の該当ブロックは README の対応表で特定する
- 不採用案: 系統A（gpt-image）2枚は `docs/design/candidates/a-image/` に残置（design-writer は読まない）
- `mockups/` は空（採用A なし）。**同一画面を mockups/ と reference/ の両方に置かないこと**
