# 01. 共通シェル デザイン仕様

**対応機能**: [`../specs/07-web-foundation.md`](../specs/07-web-foundation.md)・[`../specs/16-web-navigation.md`](../specs/16-web-navigation.md) ｜ **ソース種別**: コード（系統B）＋実装（ナビ改訂分）

## 素材

- `docs/design/reference/nextjs/app/layout.tsx`（シェル構造・フォント・viewport）
- `docs/design/reference/nextjs/app/globals.css`（トークン `:root`・全クラス定義）
- `docs/design/reference/nextjs/components/HudStatus.tsx`（上部 HUD ステータス行）
- ナビゲーション（ハンバーガー＋ドロワー）は**素材なし**。specs 16 の決定に沿って実装から起こした（判定の正は既存実装との一貫性。`.navbtn` / `.drawer*` は `web/src/app/globals.css`、構造は `web/src/shared/ui/NavDrawer.tsx` が実物）

実装者は必ず素材自体も読むこと。**依存は本体スタックへ置き換え**（feature-based 構成への再配置・`next/font` はそのまま可）、**レイアウト構造・スタイル値・文言は忠実に転写**する（見た目を再構成しない）。

> 経緯: 2026-07-26〜07-28 は下部固定タブバー（素材 `reference/nextjs/components/TabBar.tsx`・`.tabs` / `.tab`、最終形は3タブ等分割）だった。画面が5つに増えたため 2026-07-29 に廃止し、ヘッダーのハンバーガー＋ドロワーへ移行（[`../specs/16-web-navigation.md`](../specs/16-web-navigation.md)）。**下部タブバーは現行仕様ではない**（E2E で非存在を検証している）。素材側の TabBar.tsx は履歴として残置し、転写対象から外す。

## レイアウト構造

```
.shell（min-height:100dvh・中央寄せ・padding:0）
└ .col（width:100%・max-width:1024px・padding:0 16px calc(24px + env(safe-area-inset-bottom))）
   ├ HudStatus（上部ステータス行。右端にハンバーガーが同居）
   └ {画面コンテンツ（今日 / 履歴 / ルーティン / ダイジェスト / 夜勤）}

.drawer（開いているときだけ DOM に存在。position:fixed inset:0・z-index:20・flex で右寄せ）
├ .drawer__backdrop（absolute inset:0・background rgba(5,11,26,.72)・要素は <button>）
└ .drawer__panel（<nav>・width:min(280px,82vw)・height:100%・surface 背景・左辺 border 1px
   ・padding 18px 16px calc(22px + env(safe-area-inset-bottom))・縦 flex gap:8px・overflow-y:auto）
   ├ .drawer__title（`NAVIGATION`・mono label・padding 0 2px 6px）
   └ .drawer__item ×5
```

- 常時ダーク（`color-scheme: dark`）。背景 `--bg`・文字 `--text`
- viewport: `themeColor #050B1A`・`viewportFit: cover`
- html lang="ja"・title「日次ルーティン」
- シェルは下部余白を持たない（タブ分の `padding-bottom:96px` は廃止）。コンテンツ下端の余白は `.col` 側が持つ
- 画面幅による分岐なし。md 以上でもハンバーガーのまま（デスクトップ常設サイドバーは不採用・specs 16 §4）

## コンポーネント一覧

| 要素 | 文言 | 状態・様式 |
|---|---|---|
| HudStatus（`.hud`） | — | flex・space-between・padding 18px 2px 12px |
| HudStatus 左（`.hud__live`） | `ROUTINE / DAILY` | 発光ドット（7px・accent・`pulse` 2.4s 点滅）＋等幅マイクロラベル（11px・letter-spacing .18em） |
| HudStatus 右（`.hud__right`） | `TODAY` / `HISTORY` / `ROUTINES` | 画面タグ（11px・letter-spacing .14em）＋ハンバーガー。gap 12px |
| ハンバーガー（`.navbtn`） | アイコンのみ（`aria-label="メニュー"`） | 44×44px・横棒3本（高さ 1.5px・gap 4px・`--muted`）。padding 0 11px／margin-right -10px で HUD 右端に光学的に揃える。hover で棒が accent |
| バックドロップ（`.drawer__backdrop`） | — （`aria-label="メニューを閉じる"`） | 全面 `rgba(5,11,26,.72)`。タップで閉じる |
| ドロワー項目（`.drawer__item`） | `今日` / `履歴` / `ルーティン` / `ダイジェスト` / `夜勤` | min-height 46px・padding 13px 14px・12.5px・letter-spacing .14em・border 1px `--border`・radius-sm・背景 `--bg`・文字 `--muted` |
| 　同 active（`--active`） | 現在画面の1件 | accent 枠＋accent 文字＋`rgba(56,229,255,.06)` 背景＋グロー `glowShadow(9,.2)`（インライン）。`aria-current="page"` |
| 　同 hover | — | 枠・文字が accent |

- 遷移先: `今日`=`/`・`履歴`=`/history`・`ルーティン`=`/routines`・`ダイジェスト`=`/digest`・`夜勤`=`/nightshift`。並びは使用頻度順（specs 16 §3.3）。追加は `NavDrawer.tsx` の `NAV_ITEMS` 1箇所で完結させる
- アクティブ判定はパス前方一致（`/` のみ完全一致）＝旧タブと同じ
- `prefers-reduced-motion: reduce` では HUD ドットの点滅とドロワー active のグローを止める

## インタラクション

- ハンバーガータップでドロワーを開く（`aria-expanded` が連動）。開いている間だけ `.drawer` を描画する
- 閉じる経路は3つ: 項目タップ（遷移とセット）・バックドロップタップ・**Escape キー**
- 遷移は `next/link`。項目タップでドロワーを閉じてから遷移する
- 実装は specs 07 / 16 の5ページ構成（`/`・`/history`・`/routines`・`/digest`・`/nightshift`）に対応する
- ドロワーはナビゲーションのみを持ち、feature を import しない（`shared/ui/`）

## 未定事項

- HUD 右の画面タグは `TODAY` / `HISTORY` / `ROUTINES` の3種のみで、`/digest`・`/nightshift` は既定の `TODAY` にフォールバックする（実装の事実）。タグ追加は未決（specs 16 は画面タグに触れていない。必要になったら specs 側の改訂とセットで行う）
- コンテンツ幅は 2026-07-26 に max-width 1024px へ改訂済み（実機 iPad で 440px 固定が狭かったため画面幅追従に変更。specs 07・system/01-tokens.md・デザイン素材も同値）
