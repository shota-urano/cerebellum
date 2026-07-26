# cerebellum-axh パリティ検収レポート: 履歴画面

**対象**: `/history`（`docs/specs/09-web-history.md` / 見た目の正本 `docs/design/03-history.md`）
**Linear**: USL-270 ｜ **実施日**: 2026-07-26 ｜ **判定**: **乖離ゼロ**

## 1. 検証条件

| 項目 | 値 |
|---|---|
| 実装 | `web/` を `next dev -p 63268`（`/history?date=YYYY-MM-DD`） |
| プロトタイプ | `docs/design/reference/nextjs` を `next dev -p 63269`（`/history`。週サマリ行クリックで日付を合わせる） |
| データ | Playwright `page.route('**/api/**')` のモック。プロトタイプ `lib/data.ts` の `WEEK` / `BASE_TASKS` と同一値を `docs/specs/03-api.md` §3 の DTO（camelCase）へ変換 |
| 実 API | 一切叩かない。モックは非 GET を 405 で遮断（実 POST ゼロを実測確認） |
| ビューポート | 1024×1366（iPad 縦・コンテンツ幅上限）と 440×956（狭幅追従）の 2 条件・`deviceScaleFactor: 2` |
| 比較ケース | `past`=07-25（記録あり・13件/8完了）／`empty`=07-22（記録なし）／`oldest`=07-20（11/13）／`today`=07-26（意図的差分） |

**比較手法**（2 系統を併用）

1. **DOM 実測比較**: `main` 配下の全要素を深さ優先で列挙し、タグ / class / テキスト / `main` 相対座標（x,y,w,h）/ `disabled`・`aria-pressed`・`aria-busy` / 計算済み CSS 22プロパティ（display・position・width・height・min-height・flex・gap・margin・padding・border-{width,style,color,radius}・font-{family,size,weight}・letter-spacing・line-height・color・background-color・box-shadow・opacity・text-align・text-decoration-line・cursor・overflow）を実装/プロトタイプ双方から採取し、同一 index で全件突き合わせ。
2. **ピクセル比較**: dev オーバーレイを隠し、ページ全高までビューポートを伸ばして（fullPage の継ぎ合わせで fixed 要素位置がぶれるのを避ける）`animations: 'disabled'` で撮影 → pixelmatch で全画素比較。

**結果（機械判定）**

| ケース | ノード数 app/ref | DOM 差分 | ピクセル差分 @1024 | ピクセル差分 @440 |
|---|---|---|---|---|
| past（07-25） | 204 / 204 | **0** | **0 / 5,783,552 px** | **0 / 2,522,080 px** |
| empty（07-22） | 130 / 130 | **0** | **0 / 5,595,136 px** | **0 / 1,682,560 px** |
| oldest（07-20） | 204 / 204 | **0** | **0 / 5,783,552 px** | **0 / 2,522,080 px** |
| today（07-26） | 233 / 204 | 意図的差分のみ（下表 §3） | 意図的差分のみ | 意図的差分のみ |

最終並置スクショ（`past` @1024）は **PNG バイト列まで完全一致**（`md5 = ee858e4f39916a443cc08b0b131c9ae6`）。

- 実装: `cerebellum-axh-history-app.png`（`http://localhost:63268/history?date=2026-07-25`）
- プロトタイプ: `cerebellum-axh-history-ref.png`（`http://localhost:63269/history` の初期表示 = TODAY-1 = 2026-07-25）

`today` ケースは DateNav / WeekSummary の部分木のみを切り出して比較し、こちらも **差分 0**（app 4/ref 4 ノード・app 120/ref 120 ノード）。

## 2. 照合チェックリスト（39項目・すべて一致）

判定の根拠列は `DOM`=DOM 実測比較で一致、`PX`=ピクセル比較で一致、`擬似`=hover/disabled を実際に発生させて計算済みスタイルを実測、`挙動`=クリック操作で遷移・状態を実測。

| # | 照合項目 | 判定 | 乖離の内容 | 対応 | 根拠 |
|---|---|---|---|---|---|
| 1 | レイアウト構造（DateNav → 読み取り専用行 → TaskList／EmptyState → WeekSummary の順） | 一致 | なし | 不要 | DOM |
| 2 | コンテンツ幅・外周余白（`.shell` / `.col`・max-width 1024px・padding 0 16px） | 一致 | なし | 不要 | DOM/PX |
| 3 | フォント（`.mono`=JetBrains Mono / 本文=Noto Sans JP の適用箇所） | 一致 | なし | 不要 | DOM |
| 4 | トークン値（bg/surface/border/text/muted/accent・radius 6/4px） | 一致 | なし | 不要 | DOM/PX |
| 5 | DateNav 文言 `◀ 前日` / `翌日 ▶` | 一致 | なし | 不要 | DOM |
| 6 | DateNav ボタン寸法・様式（min-height 44px・padding 10/12・1px border・11.5px・.1em） | 一致 | なし | 不要 | DOM |
| 7 | DateNav ボタン hover（border/文字が accent） | 一致 | なし | 不要 | 擬似 |
| 8 | DateNav ボタン disabled（文字 `#2C4470`・opacity .55・cursor default） | 一致 | なし | 不要 | 擬似 |
| 9 | DateNav 日付フォーマット `YYYY-MM-DD（曜）`・等幅 15px/500 | 一致 | なし | 不要 | DOM/PX |
| 10 | DateNav 配置（panel・space-between・padding 8px） | 一致 | なし | 不要 | DOM |
| 11 | 読み取り専用バッジ文言 `読み取り専用` | 一致 | なし | 不要 | DOM |
| 12 | 読み取り専用バッジ様式（10px・.16em・muted・アウトライン・radius-sm・padding 5/9） | 一致 | なし | 不要 | DOM/PX |
| 13 | バッジと進捗を繋ぐ 1px 罫線（`.ro__rule`・flex:1・border 色） | 一致 | なし | 不要 | DOM/PX |
| 14 | 進捗 `{done} / {total}`・等幅・accent・11px/.1em | 一致 | なし | 不要 | DOM/PX |
| 15 | 記録なし時の進捗 `— / —` | 一致 | なし | 不要 | DOM（empty ケース） |
| 16 | readonly の TaskRow が `<div>`（button でない・`aria-pressed` なし・タップ不可） | 一致 | なし | 不要 | DOM/挙動 |
| 17 | 完了行の打ち消し線・muted 化（`.row__text--done`） | 一致 | なし | 不要 | DOM/PX |
| 18 | 完了リングの発光（外側 8px + inset 6px・accent border・ドット表示） | 一致 | なし | 不要 | DOM/PX |
| 19 | 未完了リング（発光しない・border は border 色・ドット scale .4） | 一致 | なし | 不要 | DOM/PX |
| 20 | 完了行の背景（`rgba(56,229,255,.038)`） | 一致 | なし | 不要 | DOM/PX |
| 21 | 行メタ `{time}  [{tool}]`（tool が空 / `-` のときは括弧を出さない） | 一致 | なし | 不要 | DOM |
| 22 | TaskList パネル（readonly はヘッダ行なし・marginTop 14・overflow hidden・行間 1px 罫線） | 一致 | なし | 不要 | DOM/PX |
| 23 | EmptyState 文言 `記録なし` | 一致 | なし | 不要 | DOM |
| 24 | EmptyState 様式（破線 border・muted・中央寄せ・padding 34/16・marginTop 14） | 一致 | なし | 不要 | DOM/PX |
| 25 | WeekSummary ラベル `LAST 7 DAYS`（等幅マイクロラベル・marginBottom 12） | 一致 | なし | 不要 | DOM/PX |
| 26 | WeekSummary パネル（margin-top 22・padding 14 14 8） | 一致 | なし | 不要 | DOM |
| 27 | WeekSummary 行高 44px・padding 9/6・gap 10 | 一致 | なし | 不要 | DOM |
| 28 | 日付列 `MM-DD`・幅 48px・12px | 一致 | なし | 不要 | DOM |
| 29 | 比率列 `{done}/{total}`・幅 62px・12px・muted | 一致 | なし | 不要 | DOM |
| 30 | 記録なし日の比率列文言 `記録なし` | 一致 | なし | 不要 | DOM |
| 31 | セグメントバー height 4 / gap 2 / radius 2 | 一致 | なし | 不要 | DOM/PX |
| 32 | `seg--on` の発光・`seg--off`・`seg--void`（opacity .5） | 一致 | なし | 不要 | DOM/PX |
| 33 | 記録なし日はバー全区画 void（区画数 11） | 一致 | なし | 不要 | DOM/PX |
| 34 | 選択行ハイライト（`rgba(56,229,255,.06)` + inset 0 0 0 1px border） | 一致 | なし | 不要 | DOM/PX |
| 35 | WeekSummary 行全体が `<button>`（行タップ領域） | 一致 | なし | 不要 | DOM |
| 36 | 7日を日付昇順・末尾が今日 | 一致 | なし | 不要 | DOM |
| 37 | 前日/翌日タップで表示日が移動 | 一致 | なし | 不要 | 挙動 |
| 38 | サマリ行タップでその日へ移動＋選択行が追従 | 一致 | なし | 不要 | 挙動 |
| 39 | 未来（今日より先）へ進めない（今日表示で翌日 disabled） | 一致 | なし | 不要 | 挙動/擬似 |

**修正した乖離: 0 件**（実装変更なし）。コンソールエラー 0 件・非 GET リクエスト 0 件も併せて実測。

## 3. 意図的差分（乖離に数えない）

| 項目 | 実装 | プロトタイプ | 根拠 |
|---|---|---|---|
| 初期表示日 | 今日（`date` 省略時） | 前日（TODAY-1）起点 | `docs/specs/09-web-history.md` §3「date 省略時は今日」 |
| 当日のトグル | 可（`aria-pressed` あり・行が `<button>`） | 不可（常時 readonly） | 同 §3「date が今日のときはトグル可」 |
| 当日表示時のヘッダ | 計器盤ヘッダ（`.hdr`）＋ `TASKS` 見出し＋ ALL CLEAR | 読み取り専用バッジ行 | 上記トグル可の帰結。「読み取り専用」バッジとタップ可能行は両立しないため、当日は今日画面と同じ様式（`docs/specs/08-web-today.md`）に寄せる |
| コンテンツ幅 | max-width 1024px・以下は画面幅追従 | 同じ（素材も 2026-07-26 に更新済み） | 実機 iPad 対応の改訂。実測でも一致（差分ゼロ） |
| `effort`（実施列） | 表示しない | 概念なし | 2026-07-26 裁定・`docs/specs/08-web-today.md` §3 |
| ロード中スケルトン | あり（`.skel` / `SkeletonRows`） | なし | `docs/specs/07-web-foundation.md` §6 |
| `prefers-reduced-motion` | 発光・遷移・pulse を無効化 | 未対応 | アクセシビリティ対応 |
| `.ring { box-shadow: none }` | あり | なし | Tailwind v4 の同名ユーティリティ `ring` の打ち消し（無いと未完了リングが誤発光） |
| データ | API 由来（本検収ではモック） | 内蔵ダミー | 当然の差 |
| エラー状態 | API 由来（`ErrorBanner`・503 は共通文言） | `VAULT_ERROR` フラグ | 当然の差 |
| 不正 `?date=` | 「不正な日付」＋「今日へ」リンク（`.empty` 様式を流用） | 状態なし | `docs/specs/09-web-history.md` §6・`docs/design/03-history.md`「未定事項」 |

## 4. `features/day/` 側について

履歴画面は `DayView` を readonly で再利用しているが、readonly 表示（バッジ行・静的行・打ち消し線・リング発光・記録なし）は上記のとおり **プロトタイプとピクセル一致**。参考に今日画面（`/`）も同一データ・同条件で並置比較したところ**ピクセル差分 0** だったため、**day 側に報告すべき乖離は無し**（今日画面の検収本体は `dsq` の担当）。

## 5. 再現手順

検証スクリプト（Playwright・pixelmatch）はスクラッチパッドに置き、リポジトリには追加していない（`web/package.json` も未変更）。再現時は次を用意する。

1. プロトタイプ: `cd docs/design/reference/nextjs && npm install && npx next dev -p 63269`
2. 実装: `cd web && npx next dev --turbopack -p 63268`
3. Playwright で `**/api/**` をモック（`WEEK` / `BASE_TASKS` を `03-api.md` §3 の DTO に変換・非 GET は遮断）し、`/history?date=...` と プロトタイプの同日表示を撮影して全画素比較
