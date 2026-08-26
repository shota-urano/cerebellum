# Office MY DESK / Room Detail Design QA

- source overview: `docs/design/screenshots/cerebellum-office-my-desk-focus.png`
- source room: `docs/design/screenshots/cerebellum-office-studio-room-detail.png`
- implementation: `http://100.114.109.98:48213/office`（releaseバイナリ、本番DBコピー、実 `office.json`）
- overview screenshot: `/private/tmp/cerebellum-office-overview-final.png`
- room screenshot: `/private/tmp/cerebellum-office-room-final.png`
- MY DESK empty screenshot: `/private/tmp/cerebellum-office-desk-empty.png`
- desktop screenshot: `/private/tmp/cerebellum-office-overview-desktop.png`
- combined overview: `/private/tmp/cerebellum-office-overview-comparison.png`
- combined room: `/private/tmp/cerebellum-office-room-comparison.png`
- viewport: 390 x 844 CSS px、devicePixelRatio 1
- source pixels: 853 x 1844。比較時に390 x 844へ正規化
- implementation pixels: 390 x 844、density normalization不要
- desktop check: 1024 x 844、`.office-page` 760px、横overflowなし
- browser: in-app Browserが利用不可だったため、ユーザー環境のChromeで実機確認

## Full-view comparison evidence

採用した一覧案と実装を同じ390 x 844へ正規化し、同一画像内で横並び比較した。暗い見下ろしフロア、四隅の4部署、中央MY DESK、上部の「昨夜 / あなたの仕事」、低輝度の正常信号という主構造は一致している。実データは `正常 / あなたの仕事 0件` のため、採用案にある承認書類2件は表示されない。これは状態の捏造を避ける意図的差分。

部署詳細も同様に横並び比較した。部署名、戻る導線、室内のワークステーション、所属メンバー、下部の部署ナビという階層は一致する。実装は実データを欠落させないため、部署内人数に応じて2列で縦スクロールする。

## Required fidelity surfaces

- fonts and typography: 既存のJetBrains Mono / Noto Sans JPを維持。HUD、部署名、人数、状態、社員名の階層を採用案に合わせた
- spacing and layout rhythm: 390pxの初期画面内に4部署とMY DESKが収まり、部署詳細は2列。1024pxでも中央760px、重なり・横overflowなし
- colors and tokens: 既存のnight navy、cyan、amber、error redを利用。正常ほど低輝度、実行中・判断待ち・失敗ほど強く表示
- image quality and asset fidelity: 一覧フロア、部署フロア、承認フォルダを生成画像として実装。背景透明のフォルダを検証し、CSS/SVGの代替絵は使用していない
- copy and content: 部署人数、社員名、時刻、状態、報告は `office.json` 由来。判断待ちは `outcome=produced && note=承認待ち` の機械可読条件だけで判定
- accessibility and interaction: 部署・MY DESK・社員席は意味のあるリンク/ボタン名を持ち、レポートはdialog。focus-visible、状態文言、44px以上の主要操作を維持

## Interaction verification

- 一覧からStudioへ遷移し、URLが `/office?room=studio`、遷移後scrollTopが0になることを確認
- Studioでは所属社員だけが表示され、社員席からレポートを開閉しても `room=studio` を保持することを確認
- MY DESKは実データ0件の空状態をChromeで確認し、承認待ちだけが並ぶ状態とレポート復帰はE2E fixtureで確認
- 戻る、部署ナビ、個別レポート、空状態、停止中社員、API error、console error/warnなしを確認

## Comparison history

1. P1: 初期分類ではLibraryに13人が集中した。skill/nameの既存データ語彙を調べ、Market / Studio / Labの機械的分類語を追加して `3 / 6 / 3 / 5` に修正
2. P2: 部署遷移時に前画面のscrollTop 115pxを引き継いだ。内部リンクの `scroll={false}` を外し、遷移後0pxを確認
3. P2: 初回キャプチャがロード中スケルトンだった。実データ描画完了を待って再撮影し、画像ロードとDOMを確認
4. post-fix: 390 x 844と1024 x 844、一覧、部署詳細、MY DESK、個別レポート、URL復帰、横overflow、consoleを再確認。P0/P1/P2なし

## Remaining intentional deviations

- 採用画像は承認待ち2件の演出、実データは0件。実装は正常状態の存在感を意図どおり抑えている
- 採用画像の部署詳細は3人の焦点構成、実装は所属社員を欠落させず2列スクロールで表示する
- アプリ共通ヘッダーを維持するため、採用画像より上部HUDが高い

final result: passed
