# 02. 「今日」画面 デザイン仕様

**対応機能**: [`../specs/08-web-today.md`](../specs/08-web-today.md)（第1段）・[`../specs/25-web-inbox.md`](../specs/25-web-inbox.md) §3.1（第2段・第3段・赤点） ｜ **ソース種別**: コード（系統B）＋実装（3段構成の追加分）

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
5. LearningTodayLine（第2段・パネル）
6. InboxSummaryStrip（第3段・パネル）

1〜4 が**第1段**（日課）で、素材から転写した部分。5・6 は 2026-09-02 に足した第2段（学習）・
第3段（AI からの確認待ち）で、**素材なし**——構成・文言の正本は
[`../specs/25-web-inbox.md`](../specs/25-web-inbox.md) §3.1（判定の正は既存実装との一貫性）。
第1段のファーストビューを侵食しないよう TaskList の下に置く。様式は第1段と同じ
`panel` ＋ `.list__head` で、同じ画面の中で様式を割らない。

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
| HeaderPanel 赤点（`.hdr__alert`） | — （`aria-label="確認待ちに異常があります"`・`role="img"`） | `CLEARED` ラベルの行末（計器盤の右端）に 7px の error 色の丸＋グロー。**第3段の異常が1件でもあるときだけ**出す（specs 25 §3.1）。押す操作は持たない。**進捗・ALL CLEAR の判定には入らない** |
| AllClear | `ALL CLEAR` ＋ `本日のタスクはすべて消し込み済みです` | accent 枠・淡い accent 背景・内側グロー・タグは .24em＋text-shadow。判定は日課の `done === total > 0` だけ（第3段の異常に影響されない） |
| LearningTodayLine（`.lx__today`） | ヘッダ `LEARNING` / `今日の学習`。1行に `未着` ／ `未回答` ／ `済 ○x △y ×z` | 行全体が `/learning` へのリンク（44px 以上・右端にシェブロン）。未着は異常様式＝左辺 3px error 色＋文字も error 色 |
| InboxSummaryStrip（`.wt__strip`） | ヘッダ `WAITING` / `確認待ち`。件数4つ `⚠ 異常` / `承認` / `選択` / `読む` | 4等分グリッド（区切りは縦 border）。件数は 19px・accent、**0 は muted＋opacity .6 で薄く残す**。各枠が `/waiting?kind=…` へのリンク（66px 以上）。下に未着行（`.dg__warn` 様式・specs 25 §3.3） |
| EmptyState | `今日のタスクはありません` | 破線 border・muted・中央寄せ |

## インタラクション（コードの事実）

- 行タップで done 即時トグル（リング・打ち消し線・行背景・ヘッダ数字・セグメントバーが連動）
- 発光強度は `GLOW` 係数（0〜2）で一括制御。done 行が増えるほど画面の発光が増える
- 実装では specs 08 の通り optimistic update（POST 失敗時ロールバック）に置き換える

## 未定事項

- ロード中スケルトン（素材に無し。specs 08 §3 の要求どおり実装時に作る——レイアウトシフトさせない）
- `prefers-reduced-motion` 時の挙動（system/03-principles.md の方針に従い発光・遷移を無効化）
