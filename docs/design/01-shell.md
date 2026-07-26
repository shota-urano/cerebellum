# 01. 共通シェル デザイン仕様

**対応機能**: [`../specs/07-web-foundation.md`](../specs/07-web-foundation.md) ｜ **ソース種別**: コード（系統B）

## 素材

- `docs/design/reference/nextjs/app/layout.tsx`（シェル構造・フォント・viewport）
- `docs/design/reference/nextjs/app/globals.css`（トークン `:root`・全クラス定義）
- `docs/design/reference/nextjs/components/HudStatus.tsx`（上部 HUD ステータス行）
- `docs/design/reference/nextjs/components/TabBar.tsx`（下部固定タブ）

実装者は必ず素材自体も読むこと。**依存は本体スタックへ置き換え**（feature-based 構成への再配置・`next/font` はそのまま可）、**レイアウト構造・スタイル値・文言は忠実に転写**する（見た目を再構成しない）。

## レイアウト構造

```
.shell（min-height:100dvh・中央寄せ・下部タブ分 padding-bottom:96px）
└ .col（width:100%・max-width:1024px・padding:0 16px）
   ├ HudStatus（上部ステータス行）
   └ {画面コンテンツ（今日 / 履歴）}
.tabs（position:fixed 下端・背景は bg への上方向グラデ）
└ .tabs__inner（max-width:1024px・2列グリッド・gap:8px）
```

- 常時ダーク（`color-scheme: dark`）。背景 `--bg`・文字 `--text`
- viewport: `themeColor #050B1A`・`viewportFit: cover`
- html lang="ja"・title「日次ルーティン」

## コンポーネント一覧

| 要素 | 文言 | 状態・様式 |
|---|---|---|
| HudStatus 左 | `ROUTINE / DAILY` | 発光ドット（7px・accent・`pulse` 2.4s 点滅）＋等幅マイクロラベル |
| HudStatus 右 | `TODAY` / `HISTORY` | 現在パスで切替（`/history` 判定） |
| タブ「今日」 | `今日` | `/` へ遷移。active: accent 枠＋文字＋淡い背景＋グロー |
| タブ「履歴」 | `履歴` | `/history` へ遷移。inactive: border 枠・muted 文字・surface 背景 |

- タブは 46px 高・等幅フォント・letter-spacing .14em。アクティブ判定はパス前方一致（`/` は完全一致）

## インタラクション

- タブタップで画面遷移（コードの事実。プロトタイプは `next/link`）
- 実装では specs 07 の2ページ構成（`/`・`/history`）にそのまま対応する

## 未定事項

- なし（コンテンツ幅は 2026-07-26 に max-width 1024px へ改訂。実機 iPad で 440px 固定が狭かったため画面幅追従に変更。specs 07・system/01-tokens.md・デザイン素材も同値に改訂済み）
