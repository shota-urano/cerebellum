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
├ next.config.ts             # output:'export'／devは rewrites で /api → localhost:3210
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
- モバイルファースト: `max-w-2xl` 中央寄せ・タップターゲット 44px 以上
- 常時ダーク（OS追従しない・light テーマなし。トークンの正本は `docs/design/system/01-tokens.md`）
- PWA は manifest＋ホーム画面追加まで（プッシュ通知は Phase 後半・スコープ外）

## 5. インターフェース

- fetcher は `shared/api/client.ts` に集約。エラーレスポンス（[`03-api.md`](./03-api.md) §4）を型付きで throw し、各画面が表示を決める
- dev: `next dev` ＋ rewrites → `localhost:3210`。本番: 同一オリジン

## 6. エラー処理

- 503 `vault_unavailable` は共通 `ErrorBanner`（shared/ui）で「Vault 同期中」系メッセージ＋SWR の自動再検証に任せる
- fetch 失敗（オフライン等）も ErrorBanner。クラッシュ画面を出さない

## 7. スコープ外

- プッシュ通知・Service Worker によるオフラインキャッシュ
- 状態管理ライブラリ（SWR のみで足りる規模）
- E2E テスト（Phase 1 は lint＋build を verify 対象とする。[`01-architecture.md`](./01-architecture.md) §7）

## 8. 関連仕様

- 画面: [`08-web-today.md`](./08-web-today.md)・[`09-web-history.md`](./09-web-history.md)
- API: [`03-api.md`](./03-api.md) ／ 配信: [`06-cli-serve.md`](./06-cli-serve.md)
