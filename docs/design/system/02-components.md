# 基本部品と状態（正本）

トークンは [`01-tokens.md`](./01-tokens.md) を参照（値をここに再定義しない）。

## TaskItem（タスク行）

surface 面・border 1px・高さ 44px 以上・行全体がタップターゲット。
左にチェックリング（円形アウトライン。HUD のゲージリング風）、中央に content、
右または content 直前に time / effort / tool（等幅・muted。`-` と空は非表示）。

| 状態 | 表現 |
|---|---|
| default | surface 面・text 色・チェックリングは border 色のアウトライン |
| pressed | surface をわずかに明るく（操作フィードバック） |
| done | チェックリングが accent で発光（glow）・content は muted＋打ち消し線 |
| readonly | チェックリングを非表示 or 無効外観。タップ不可 |

## ProgressHeader（進捗ヘッダ）

日付＋曜日（例 `2026-07-26（日）`・等幅）と `done / total`（等幅・大きめ 22px）。
進捗は**セグメントバー**（total 分の区画。done 区画は accent＋glow、未達は border 色）。
全完了時はバー全体が発光し「ALL CLEAR」的な完了表示（文言は画面仕様で確定）。

## ErrorBanner

surface 面・左 border 3px を danger・text は本文色。閉じるボタンは持たない
（SWR の自動再検証で消えるまで表示）。

## Badge（読み取り専用）

4px 角丸・border 1px・muted 文字のアウトラインバッジ。マイクロラベル書式。

## DateNav（履歴の日付ナビ）

前日/翌日ボタン（44px ターゲット・アウトライン式）＋中央に日付（等幅）。
未来方向が無効のときはボタンを muted＋操作不可。

## SummaryCard（7日サマリ）

surface のカード。日付昇順の行: 日付（等幅）・done/total（等幅）・達成率のミニセグメントバー。
記録なしの日は muted で「記録なし」。

## Skeleton / 空状態

- ロード中: surface トーンのスケルトン行（レイアウトシフトさせない）
- 空状態: muted の1行メッセージ（文言は画面仕様から。装飾しない）
