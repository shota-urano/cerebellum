# 02. 「今日」画面 デザイン仕様

**対応機能**: [`../specs/08-web-today.md`](../specs/08-web-today.md) ｜ **ソース種別**: コード（系統B）

## 素材

- `docs/design/reference/nextjs/app/page.tsx`（画面組み立て・状態出し分け）
- `docs/design/reference/nextjs/components/HeaderPanel.tsx`・`SegmentBar.tsx`（ヘッダ計器盤）
- `docs/design/reference/nextjs/components/TaskList.tsx`・`TaskRow.tsx`・`CheckRing.tsx`（リスト）
- `docs/design/reference/nextjs/components/AllClear.tsx`・`EmptyState.tsx`・`ErrorBanner.tsx`（状態）
- `docs/design/reference/nextjs/lib/data.ts`（`metaOf` の表示規則）・`lib/theme.ts`（GLOW）

実装者は必ず素材自体も読むこと。**依存は置き換え**（ダミーデータ/localStorage → `/api/days/today`＋SWR optimistic、`VAULT_ERROR` フラグ → 実エラー状態）、**レイアウト構造・スタイル値・文言は忠実に転写**。

## レイアウト構造（上から）

1. （エラー時のみ）ErrorBanner
2. HeaderPanel（計器盤カード）
3. （全完了時）AllClear ／（空時）EmptyState
4. TaskList（ヘッダ行付きパネル）

## コンポーネント一覧

| 要素 | 文言（転記） | 状態・様式 |
|---|---|---|
| ErrorBanner | `ERR` ＋ `Vault が読み取れません。同期完了後に自動で再試行します` | surface 面・左 border 3px error 色・role="alert" |
| HeaderPanel ラベル | `DATE` / `CLEARED` | 等幅マイクロラベル（10px・.16em） |
| HeaderPanel 値 | 日付 `YYYY-MM-DD（曜）`（17px）・進捗 `{done} / {total}`（22px・accent） | 等幅・tabular-nums。四隅にコーナーブラケット装飾（accent・14×1px） |
| SegmentBar | — | total 区画・done 区画は accent＋glow、未達は surface＋border。高さ6px・gap 3px・角丸2px |
| HeaderPanel 下段 | `PROGRESS {n}%` / `REMAINING {n}` | 等幅・muted |
| TaskList ヘッダ | `TASKS` / `{n} ITEMS` | 等幅マイクロラベル・下 border |
| TaskRow | タスク文言＋メタ `{time}  [{tool}]`（tool 空・`-` は非表示。区切りは半角空白2つ） | 行高 44px 以上・行全体が `<button>`・`aria-pressed`。done: リング発光＋文言打ち消し線（線色 accent 60%）＋行背景に淡い accent |
| CheckRing | — | 22px リング。done: accent 枠＋内点 9px 発光（transform遷移 .18s）。未完了: border 枠・内点透明 |
| AllClear | `ALL CLEAR` ＋ `本日のタスクはすべて消し込み済みです` | accent 枠・淡い accent 背景・内側グロー・タグは .24em＋text-shadow |
| EmptyState | `今日のタスクはありません` | 破線 border・muted・中央寄せ |

## インタラクション（コードの事実）

- 行タップで done 即時トグル（リング・打ち消し線・行背景・ヘッダ数字・セグメントバーが連動）
- 発光強度は `GLOW` 係数（0〜2）で一括制御。done 行が増えるほど画面の発光が増える
- 実装では specs 08 の通り optimistic update（POST 失敗時ロールバック）に置き換える

## 未定事項

- ロード中スケルトン（素材に無し。specs 08 §3 の要求どおり実装時に作る——レイアウトシフトさせない）
- `prefers-reduced-motion` 時の挙動（system/03-principles.md の方針に従い発光・遷移を無効化）
