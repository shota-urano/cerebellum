# Office 2D Design QA

- source visual truth: `docs/design/screenshots/cerebellum-office-2d-night-operations.png`
- implementation: `http://localhost:48212/office`（release バイナリ、本番DBのコピー、実 `office.json`）
- implementation screenshot: `/private/tmp/cerebellum-office-2d-first-viewport-final.png`
- report-sheet screenshot: `/private/tmp/cerebellum-office-2d-sheet-final.png`
- combined comparison: `/private/tmp/cerebellum-office-2d-comparison-final.png`
- viewport: 390 × 844 CSS px、devicePixelRatio 1
- source pixels: 853 × 1844。比較時に 390 × 844 へ正規化
- implementation pixels: 390 × 844、density normalization 不要
- desktop check: 1024 × 844、`.office-page` 760px、2列維持、横 overflow なし
- state: 一覧初期表示＋席タップ後の報告シート＋報告全文展開

## Full-view comparison evidence

採用画像と実装を同じ 390 × 844 に正規化して横並び比較した。HUD、3区分の状態サマリー、暗い見下ろしフロア、2列の座席、ネームプレート、社員画像、勤務時刻、状態表示の順序と色トークンは一致している。実データは `勤務中 0 / 待機 17 / 失敗 0`、採用画像はモックの `4 / 2 / 1` なので件数・状態色の差は意図的。

最終実装は最初の 844px に6席が見え、採用画像の高密度なオフィス感を保ちながら、社員名と状態をタップ可能なサイズで読める。17人は同じ2列フロアを縦スクロールし、停止中3人は末尾の別区画に分離される。

## Focused region comparison evidence

報告シートを開いた同一状態も確認した。採用画像の下端シート、accent/error 枠、グリップ、社員名、勤務時間、headline、主操作の階層を維持している。実装は仕様で要求される `run_number / scheduled_for / started_at / status / trigger` を読めるサイズで追加したため、採用画像よりシートが高い。これは機能要件と可読性のための意図的差分。

## Required fidelity surfaces

- fonts and typography: JetBrains Mono / Noto Sans JP を既存システムのまま使用。HUD、名前、時刻、状態の階層と letter-spacing を維持。長い社員名は2行まで自然に折り返す
- spacing and layout rhythm: 390pxで2列、各席約200px高、最初の画面に6席。1024pxでも2列・中央760pxを維持し、重なりと横 overflow なし
- colors and tokens: `#050B1A / #0D1B36 / #16305E / #D7E9FF / #5F7AA6 / #38E5FF / #FF5C7A` を使用。状態は色だけでなく文言と丸印でも表現
- image quality and asset fidelity: フロア背景1種、通常社員3種、失敗社員1種を生成画像として実装。全画像の `naturalWidth > 0`、透過端とクロマキー残りを確認。CSS/SVGの代替絵なし
- copy and content: 名前・勤務時間・状態・件数・headline・全文は `office.json` 由来。画像への文字焼き込みなし
- accessibility and interaction: 席は意味のあるリンク名、報告は `dialog`、44px以上の閉じる/展開操作、focus-visible、色以外の状態表現あり

## Comparison history

1. P1: `next/image` の optimizer URL が Rust 静的配信で解決されず社員画像が壊れた。静的 `/images/office/*.png` を直接読む装飾画像へ変更。再確認で broken images = 0
2. P2: 初回は1席が約249px高で最初の画面に4席しか見えなかった。席を約200pxへ圧縮し、最初の画面に6席が見えるよう修正
3. P2: 同じ社員画像の反転だけでは採用画像の人物差が弱かった。白・灰・失敗状態を追加し、社員IDから安定して3種、失敗時は専用1種を使うよう修正
4. post-fix: 390 × 844 と 1024 × 844、席タップ、URL更新、報告展開、ブラウザバック、console error/warn、画像ロードを再確認。P0/P1/P2なし

## Remaining intentional deviations

- 報告シートは5つのメタ情報と読みやすい本文を持つため、採用画像より高い
- 採用画像は7席の固有キャラクター、実装は社員IDで3種を安定割当＋失敗専用1種。P3の追加バリエーション余地はあるが、同一画像反復によるP2は解消済み
- 実データの outcome が現時点でほぼ `unknown` のため、採用画像より中立状態が多い。判定を画面側で捏造しない仕様どおり

final result: passed
