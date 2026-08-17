---
status: confirmed
confirmed_rev: be0410a
---

# 07. Web 基盤仕様（Next.js）

**親**: [`00-overview.md`](./00-overview.md) ｜ **担当**: Frontend ｜ **範囲**: `web/` の構成・データ取得・スタイル・PWA 下準備（画面そのものは 08/09）

## 1. 目的

画面2枚（今日・履歴）が乗る共通基盤を固定する。Feature-based 構成で app/ は合成だけの薄い層に保つ。

## 2. 入出力

- **入力**: [`03-api.md`](./03-api.md) の API（同一オリジン `/api/...`）
- **出力**: `next build` による静的 export（`web/out/`）。Rust が rust-embed で取り込む

## 3. 処理詳細（構成・確定）

Next.js 15 / React 19 / TypeScript strict / App Router / `output: 'export'` / Tailwind v4。

```
web/
├ next.config.ts             # output:'export'／devは rewrites で /api → localhost:48210
├ public/
│ ├ manifest.webmanifest     # PWA下準備（ホーム画面追加まで）
│ └ icons/
└ src/
  ├ app/                     # ルーティング層（featureを組むだけ。ロジック禁止）
  │ ├ layout.tsx             # viewport・テーマ・manifest読込
  │ ├ page.tsx               # 「今日」→ 08-web-today.md
  │ ├ history/page.tsx       # 「履歴」→ 09-web-history.md（?date= クエリ方式）
  │ └ globals.css            # Tailwind @import
  ├ features/
  │ ├ day/                   # components: TaskList/TaskItem/ProgressHeader
  │ │                        # hooks: useDay（SWR）/ useToggleCheck（optimistic）
  │ └ history/               # components: DateNav/SummaryCard ／ hooks: useSummary
  └ shared/
    ├ api/                   # client.ts（fetcher）/ types.ts（03-api.md の DTO を手動同期）
    ├ ui/                    # ErrorBanner 等の汎用UI
    └ lib/                   # date.ts 等
```

**依存ルール（規約・lint では縛らない）**

- `app → features → shared` の一方向のみ。**feature 間 import 禁止**（横断は shared に降ろすか app 層で合成）
- feature の外部公開は `index.ts`（barrel）経由のみ。内部ファイル直 import 禁止
- 履歴画面でのタスク一覧表示は、history が day を import するのではなく `app/history/page.tsx` が両 feature を並べて合成

## 4. 設定値・確定値

- 履歴は動的セグメントではなく**クエリパラメータ方式**（`/history?date=...`。静的 export と相性の良い標準解）
- 型共有は手書き（`shared/api/types.ts` に Rust DTO を写す）。コード生成は導入しない
- SWR 標準設定＋`revalidateOnFocus: true`（スマホでアプリに戻った瞬間に最新化）
- トグルは optimistic update: `mutate` で UI 即時反映 → POST → 失敗時ロールバック
- **md 描画（`shared/ui/Markdown`）の対応記法**（`lessonMd` / `questionMd` / `answerMd`（[`14`](./14-learning.md) §3.1）・`detailMd`（[`17`](./17-harness-approval.md)）の共通描画。各画面はここを参照し、記法を二重定義しない）:
  ブロックは**見出し・箇条書き・番号付き・引用・コードブロック・パイプテーブル**、インラインは `` `code` ``・`**強調**`・`[text](url)`。外部ライブラリは入れず自前パーサで、**未対応の記法は素のテキストとして出す**（壊れても読める側に倒す。`dangerouslySetInnerHTML` は使わない）
  - パイプテーブルは GFM 形式（ヘッダ行＋`|---|` 区切り行）。区切り行の `:` による整列指定は読み飛ばす（整列は付けない）。ヘッダとセル数が食い違う行は不足を空セルで埋め、超過は捨てる
  - 表示: はみ出す表は**横スクロール**（本文レイアウトを広げない）。**2列の表だけ**は狭幅（≤520px）でヘッダを見出しに畳んだ**縦積み**へ落とす（3列以上は縦積みにすると対応関係が壊れるため横スクロールのまま）
  - 2026-08-16 追加。それ以前はテーブル未対応で `| A | B |` が段落テキストのまま出ており、実機で読めなかった
- モバイルファースト: `max-width: 1024px` 中央寄せ・それ以下は画面幅に追従・タップターゲット 44px 以上（2026-07-26 改訂。当初 440px 固定だったが実機 iPad で狭かったため画面幅追従へ変更。上限 1024px は超大画面での間延び防止）
- 共通シェル: 上部 HUD ステータス行（ROUTINE / DAILY＋画面タグ）＋ハンバーガードロワー（[`16-web-navigation.md`](./16-web-navigation.md)。2026-07-29 に下部固定タブバーから移行）。見た目の正本は `docs/design/01-shell.md`
- フォント: Noto Sans JP（本文）＋ JetBrains Mono（数字・等幅）を `next/font/google` でセルフホスト
- 常時ダーク（OS追従しない・light テーマなし。トークンの正本は `docs/design/system/01-tokens.md`）
- PWA は manifest＋ホーム画面追加まで（プッシュ通知は Phase 後半・スコープ外）

## 5. インターフェース

- fetcher は `shared/api/client.ts` に集約。エラーレスポンス（[`03-api.md`](./03-api.md) §4）を型付きで throw し、各画面が表示を決める
- dev: `next dev`（**ポート 48211 固定**。`web/package.json` の `dev` スクリプトに `-p` で指定）＋ rewrites → `localhost:48210`。本番: 同一オリジン
  - 常駐ポート 48210 / dev ポート 48211 はいずれも **macOS の ephemeral 範囲（49152 以上）を避けた値**。ephemeral 帯に置くと、再起動直後に他プロセスが一時ポートとして先に掴んでいて bind に失敗することがある（[`06-cli-serve.md`](./06-cli-serve.md) §6 の「ポート使用中: 起動失敗」を散発的に踏む）

## 6. エラー処理

- API エラー（[`03-api.md`](./03-api.md) §4）は共通 `ErrorBanner`（shared/ui）＋SWR の自動再検証に任せる
- fetch 失敗（オフライン等）も ErrorBanner。クラッシュ画面を出さない
- 503 `vault_unavailable` は廃止（2026-07-27 のマスタ移管）。既存の ErrorBanner 文言「Vault が読み取れません…」は汎用の通信/サーバーエラー文言へ置き換える

## 7. スコープ外

- プッシュ通知・Service Worker によるオフラインキャッシュ
- 状態管理ライブラリ（SWR のみで足りる規模）
- E2E テスト（Phase 1 は lint＋build を verify 対象とする。[`01-architecture.md`](./01-architecture.md) §7）

## 8. 関連仕様

- 画面: [`08-web-today.md`](./08-web-today.md)・[`09-web-history.md`](./09-web-history.md)
- API: [`03-api.md`](./03-api.md) ／ 配信: [`06-cli-serve.md`](./06-cli-serve.md)
