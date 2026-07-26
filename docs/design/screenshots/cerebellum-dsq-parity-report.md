# cerebellum-dsq [Frontend] パリティ検収レポート: 「今日」画面

**対象**: `app/page.tsx` ＋ `features/day/`（[`../02-today.md`](../02-today.md) のコンポーネント一覧が照合チェックリスト）
**比較の正本**: `docs/design/reference/nextjs/`（`app/page.tsx` ほか 02-today.md「素材」節の全ファイル）
**Linear**: [USL-269](https://linear.app/uslab/issue/USL-269) ／ **実施日**: 2026-07-26 ／ **判定: 乖離ゼロ（修正 0 件）**

## 1. 検証方法

| 項目 | 内容 |
|---|---|
| 実アプリ | `web/` を `next dev -p 65274` で起動。API は Playwright `page.route()` で全モック |
| プロトタイプ | `docs/design/reference/nextjs` を `next dev -p 65275` で起動（**素材は読み取りのみ・無改変**） |
| 状態バリアント | 素材をスクラッチパッドへコピーし `VAULT_ERROR` / `BASE_TASKS=[]` だけ env 切替に置換したものを 65277 / 65276 で起動（リポジトリ内の素材は触っていない） |
| データ | 両者とも **プロトタイプの `lib/data.ts` `BASE_TASKS` と同一**（13件・4完了）。アプリ側は `docs/specs/03-api.md` §3 の DTO 形（camelCase）へ変換して返す |
| ビューポート | 1024×1366（iPad 縦・幅上限）／ 440×956（狭幅追従）・`deviceScaleFactor: 2` |
| DOM 実測 | `main` 配下を深さ優先で全列挙し、同一 index で **tag / class / 文言 / `main` 相対座標 (x,y,w,h) / `disabled`・`aria-pressed`・`aria-busy`・`role` / 正規化インラインスタイル / 実効枠（辺ごとの width+style+color）/ 計算済み CSS 26プロパティ** を突き合わせ |
| ピクセル実測 | dev オーバーレイ（`nextjs-portal` 等）を CSS で非表示 → ページ全高までビューポートを伸ばして（fullPage の継ぎ合わせによる fixed 要素ずれを回避）`animations: 'disabled'` で撮影 → pixelmatch で全画素比較 |
| 擬似クラス | 行ボタンに実際の hover / mousedown(active) を発生させて計算済みスタイルを実測 |
| 実 API 保護 | モックで**非 GET を遮断**。実施前後に `GET http://localhost:48210/api/days/today` を採取し**バイト同一**を確認（`done:12 / total:13` のまま） |

計算済み CSS 26プロパティ: display・position・width・height・min-height・flex・gap・margin・padding・border-{width,style,color,radius}・font-{family,size,weight}・letter-spacing・line-height・color・background-color・box-shadow・opacity・text-align・text-decoration-line・cursor・overflow
（`font-family` は next/font のハッシュ付きファミリ名を正規化して比較）

## 2. 機械判定の結果

| 状態 | ビューポート | 比較ノード数（app / ref） | DOM 乖離 | ピクセル差分 |
|---|---|---|---|---|
| 通常（13件・4完了） | 1024×1366 | 109 / 109 | **0** | **0** / 5,595,136 px |
| 全完了（ALL CLEAR） | 1024×1366 | 112 / 112 | **0** | **0** / 5,595,136 px |
| 空（0件） | 1024×1366 | 20 / 20 | **0** | **0** / 5,595,136 px |
| エラー（503・タスク保持） | 1024×1366 | 112 / 112 | **0** | **0** / 5,595,136 px |
| 行タップ後（t05 を done） | 1024×1366 | 109 / 109 | **0** | **0** / 5,595,136 px |
| 通常 | 440×956 | 109 / 109 | **0** | **0** / 1,943,040 px |
| 全完了 | 440×956 | 112 / 112 | **0** | **0** / 2,090,880 px |
| 空 | 440×956 | 20 / 20 | **0** | **0** / 1,682,560 px |
| エラー | 440×956 | 112 / 112 | **0** | **0** / 2,038,080 px |
| 行タップ後 | 440×956 | 109 / 109 | **0** | **0** / 1,943,040 px |
| **合計** | 2条件 × 5状態 | **924 ノード**（約 37,884 フィールド比較） | **0** | **0 / 37,673,280 px** |

保存した並置スクショ 6 ペアは **md5 がすべてバイト同一**（`cerebellum-dsq-today-{,allclear-,empty-,error-,toggled-,narrow-}{app,ref}.png`）。

### 唯一の計算済み CSS 差（描画に出ないため乖離に数えない）

| 内容 | 件数 | 判定根拠 |
|---|---|---|
| `border-style`: 実装 `solid` / プロトタイプ `none`（`.hdr__top` などの枠なし要素、`.list__head` の上下左右） | 638 | Tailwind v4 preflight の `*, ::before, ::after { border-style: solid; border-width: 0 }` 由来。**辺ごとの実効枠（width+style+color）は全ノードで完全一致**しており、幅 0 の辺は描画されない。ピクセル差分 0 が裏取り |

## 3. 照合チェックリスト（`02-today.md` コンポーネント一覧）

| # | 照合項目 | 判定 | 根拠 | 乖離の内容 | 対応 |
|---|---|---|---|---|---|
| 1 | レイアウト構造（ErrorBanner → HeaderPanel → AllClear/EmptyState → TaskList） | ✅ 一致 | DOM ノード順・`main` 相対座標が 5 状態すべてで完全一致 | なし | 不要 |
| 2 | 余白（`.shell`/`.col`/各 marginTop） | ✅ 一致 | margin・padding・座標すべて一致（`ErrorBanner` marginBottom 12・`AllClear` marginTop 12・`TaskList` marginTop 18） | なし | 不要 |
| 3 | フォント（`--font-mono` / `--font-sans`） | ✅ 一致 | 計算済み `font-family` がハッシュ正規化後に一致。ピクセル差分 0（字形・アンチエイリアスまで同一） | なし | 不要 |
| 4 | トークン値（bg/surface/border/text/muted/accent/error/radius） | ✅ 一致 | 全ノードの color・background-color・border-color・border-radius が一致 | なし | 不要 |
| 5 | ERR バナー文言 `ERR` ＋ `Vault が読み取れません。同期完了後に自動で再試行します` | ✅ 一致 | error 状態の DOM 文言が一致（`role="alert"`・左 border 3px `--error` も一致） | なし | 不要 |
| 6 | `ALL CLEAR` ＋ `本日のタスクはすべて消し込み済みです` | ✅ 一致 | allclear 状態で文言・letter-spacing .24em・text-shadow・内側グロー（inset 0 0 24px）まで一致 | なし | 不要 |
| 7 | 空状態 `今日のタスクはありません` | ✅ 一致 | empty 状態で文言・破線 border・中央寄せ・padding 34px 16px が一致 | なし | 不要 |
| 8 | `TASKS` / `{n} ITEMS` | ✅ 一致 | `TASKS` / `13 ITEMS`。font-size 10px・letter-spacing .16em・下 border 1px が一致 | なし | 不要 |
| 9 | `PROGRESS {n}%` / `REMAINING {n}` | ✅ 一致 | `PROGRESS 31%` / `REMAINING 9`（全完了時 `100%` / `0`、空時 `0%` / `0`）が一致 | なし | 不要 |
| 10 | `DATE` / `CLEARED` ラベル | ✅ 一致 | 10px・.16em・muted。marginBottom 6px も一致 | なし | 不要 |
| 11 | HeaderPanel 値（日付 17px・進捗 22px accent・tabular-nums） | ✅ 一致 | `2026-07-26（日）` / `4 / 13`。font-size・weight 500・line-height 1・色が一致 | なし | 不要 |
| 12 | コーナーブラケット（四隅・accent・14×1px・opacity .7） | ✅ 一致 | 4 要素の座標・寸法・背景・opacity が一致 | なし | 不要 |
| 13 | セグメントバー（区画数・点灯・高さ 6px・gap 3px・角丸 2px） | ✅ 一致 | 13 区画（4 on / 9 off、全完了 13 on、空は `Math.max(total,1)`=1 区画）。点灯グロー `0 0 7px rgba(56,229,255,.55)` まで一致 | なし | 不要 |
| 14 | CheckRing（22px・枠 1.5px・内点 9px・発光） | ✅ 一致 | done 時 `0 0 8px rgba(56,229,255,.4), inset 0 0 6px rgba(56,229,255,.25)`／未完了 `box-shadow: none`・内点 `transform: scale(.4)` が一致 | なし | 不要 |
| 15 | done 行の発光・打ち消し線（線色 accent 60%）・行背景 | ✅ 一致 | `text-decoration-line: line-through`・`text-decoration-color: rgba(56,229,255,.6)`・行背景 `rgba(56,229,255,0.038)` が一致 | なし | 不要 |
| 16 | TaskRow メタ `{time}  [{tool}]`（空/`-` は非表示・区切り半角空白2つ） | ✅ 一致 | t06/t08（tool 空）は時刻のみ、t10（tool `-`）・t11〜t13（両方空）はメタ行ごと非表示。文言・ノード数が一致 | なし | 不要 |
| 17 | 行のタップ領域（min-height 44px・行全体が `<button>`・`aria-pressed`） | ✅ 一致 | `button.row.row--tap`・`min-height: 44px`・`aria-pressed` の true/false が一致 | なし | 不要 |
| 18 | 行タップ時の連動（リング・打ち消し線・行背景・ヘッダ数字・セグメントバー） | ✅ 一致 | 両者で 5 行目をクリック → `4 / 13` → `5 / 13`・`PROGRESS 38%` / `REMAINING 8`・セグメント 5 点灯。DOM 0 差・ピクセル 0 差 | なし | 不要 |
| 19 | hover / active の見え方 | ✅ 一致 | 行に hover・mousedown を実発生。cursor `pointer`・背景・box-shadow・outline・リング色が両者一致（素材に `.row` の hover/active 規則が無く、実装も追加していない） | なし | 不要 |
| 20 | シェル（HudStatus / TabBar）との整合 | ✅ 一致 | `ROUTINE / DAILY`・`TODAY`・タブ 2 列の座標／スタイル一致（`main` 外だがピクセル比較に含まれる） | なし | 不要 |

**乖離リスト: 空（0 件）。実装コードの修正は 0 件。**

## 4. 意図的差分（乖離に数えない・退行させないこと）

| 項目 | 実装 | プロトタイプ | 実測結果 | 根拠 |
|---|---|---|---|---|
| `effort`（実施列） | 表示しない | 概念なし | 全 13 件の `effort` に `EFFORT_{i}_30分` を入れた DTO を返しても画面テキストに出現せず、プロトタイプとの DOM 差 0・ピクセル差 0 | 2026-07-26 裁定・`docs/specs/08-web-today.md` §3 |
| ロード中スケルトン | あり（`.skel`・`aria-busy="true"`） | なし | ヘッダ `y=0 / h=115`・リスト `y=133` がスケルトン時と実データ時で**完全一致（シフト 0px）**。行 6 本のプレースホルダ | `docs/specs/08-web-today.md` §6 |
| `prefers-reduced-motion` | 発光・遷移・点滅を無効化 | 未対応 | `reducedMotion: 'reduce'` で `.ring--done` / `.ring__dot` / `.seg--on` の box-shadow が `none`、`.hud__dot` の animation-name が `none`、`.ring` の transition が `none` | `docs/design/system/03-principles.md` |
| `.ring` の `box-shadow: none` | あり | なし | 未完了リングの計算済み box-shadow は両者とも `none`（実装は Tailwind v4 の同名 `ring` ユーティリティを打ち消して同値に揃えている） | 実測で発見・修正済み |
| コンテンツ幅 | `max-width: 1024px`・以下は画面幅追従 | 同じ | 1024 / 440 の両条件でページ全高まで一致 | 素材も 2026-07-26 に更新済み |
| 連続タップの直列化 | POST を直列化 | 該当なし（localStorage） | POST 遮断時にロールバックが効き `4 / 13` に戻る（下記） | 実機検証で発見・修正済み |
| データ源 / 状態管理 / エラー状態 | API＋SWR＋optimistic／503 → ErrorBanner | 内蔵ダミー／`useState`＋localStorage／`VAULT_ERROR` フラグ | 依存置き換え（当然の差） | `docs/design/02-today.md` |
| Tailwind preflight の `border-style: solid` | あり | なし | 実効枠は全ノード一致・ピクセル差 0（§2 参照） | Tailwind v4 導入の副作用 |

## 5. 実 API 保護の実測

- モックの非 GET 遮断は実際に発火: 観測リクエストは `GET /api/days/today` → `POST /api/days/today/checks/t05`（**599 で遮断**）→ `GET /api/days/today`。ブラウザ側 `page.route()` で握るため Rust サーバー（`localhost:48210`）へは 1 度も届かない
- 遮断時の挙動: optimistic 表示がロールバックし `.ring--done` は 4 のまま・`CLEARED` は `4 / 13`・ErrorBanner に `ERR BLOCKED BY MOCK (non-GET)` を表示（`docs/specs/08-web-today.md` §6 の要求どおり）
- 実施前後の `GET http://localhost:48210/api/days/today` が**バイト同一**（`2026-07-26` / `done:12, total:13`）。ユーザーの実ルーティン記録は無変更

## 6. 成果物

| ファイル | 内容 |
|---|---|
| `cerebellum-dsq-today-app.png` / `cerebellum-dsq-today-ref.png` | **最終並置（通常状態・1024×1366・同一データ 13件4完了）**。md5 一致 |
| `cerebellum-dsq-today-allclear-{app,ref}.png` | 全完了（ALL CLEAR）。md5 一致 |
| `cerebellum-dsq-today-empty-{app,ref}.png` | 空状態。md5 一致 |
| `cerebellum-dsq-today-error-{app,ref}.png` | エラー（503・タスク保持）。md5 一致 |
| `cerebellum-dsq-today-toggled-{app,ref}.png` | 行タップ後（5/13）。md5 一致 |
| `cerebellum-dsq-today-narrow-{app,ref}.png` | 狭幅追従 440×956。md5 一致 |
| `cerebellum-dsq-today-skeleton-app.png` | ロード中スケルトン（意図的差分・プロトタイプに対応物なし） |

検証スクリプトはスクラッチパッドに置き、リポジトリの追跡ファイル・`web/package.json` は変更していない。
