---
status: confirmed
confirmed_rev: 9db4adc
---

# 18. ハーネス承認ビュー仕様（画面）

**親**: [`00-overview.md`](./00-overview.md) ｜ **担当**: Frontend ｜ **範囲**: `app/harness/page.tsx`・`features/harness/`・ドロワー項目の追加

## 1. 目的

その日のハーネス取り込み提案3件を読み、**採用したいものにチェックを付けるだけ**の画面。チェックの結果は翌朝の無人 `--apply` が読んで適用する（[`17-harness-approval.md`](./17-harness-approval.md)）。

判断に必要なのは各提案の**1行要約だけ**で足りるように送信側が書いている（night-harness「判定文の書き方」）。全文は読みたい人が開く。**スマホで上から流し読みして、指2〜3回で今日の分が終わる**のが達成状態。

## 2. 入出力

- **入力**: `GET /api/harness/proposals?date={date}`（date 省略時は今日）
- **出力**: `POST /api/harness/proposals/{id}/decision`
- **経路**: `/harness?date=YYYY-MM-DD&taskId=...`。ドロワーの項目（[`16-web-navigation.md`](./16-web-navigation.md)）と、`detailRef = harness.proposals` を持つタスク行からの遷移の2経路

## 3. 処理詳細

見出しは `ハーネス取り込み — {date}`。カードを縦に並べる（`panel dg` 様式・ダイジェスト詳細と揃える）。

### 3.1 提案カード

上から: **判定バッジ** → **1行要約** → **Insight名** → **操作**。

| verdict | バッジ | 操作 |
|---|---|---|
| `adopt` | 🟢 採用提案（`category` を併記） | 採用チェック |
| `experiment` | 🧪 実験提案 | 採用チェック |
| `killed` | ⚫️ 見送り | **操作なし**（表示のみ・淡色） |

- **1行要約（`summary`）を最も大きく置く**。Insight名はその下に小さく（正式名は長く、判断材料にならないため）
- 要約の直下に**敵対レビューの結論**（`challengeVerdict` / `challengeNote`）を1行で出す。⚔️ `崩せず` / `条件付き` の別が分かる様式にし、`challengeNote` をそのまま添える。**この提案が既に一度殴られていることが承認前に見える**のが目的（[`17`](./17-harness-approval.md) §3.1）
- 「全文を読む」で `detailMd` をその場に展開（md 描画はダイジェスト詳細と共通。別画面へ遷移しない——1画面で3件片付ける導線を割らないため）
- `detailPath` は全文の末尾にコピーボタン付きで表示（ターミナルで開くとき用）

### 3.2 承認チェック

- チェックリング（`shared` の消し込み様式を流用）をタップで `proposed ⇄ approved` をトグルし、**optimistic update**（既存 `useToggleCheck` と同じ作法）
- 「見送る」は別ボタン（`rejected`）。無操作（`proposed`）のまま翌朝を迎えた提案は**適用されないだけで消えない**——見送りと未決を区別する
- 翌朝の適用までは何度でも変えられる。画面下部に「チェックしたものが翌朝06:20に自動で適用されます」を常時表示（**押した先で何が起きるかを画面上で明示する**）

### 3.3 適用結果の表示

`applyState` が `pending` 以外の提案は、カード上部に結果帯を出す。

- `applied` … ✅「適用済み（{appliedAt}）」＋ `snapshotPath` をコピー可能に（**戻したくなったときの入口**）
- `failed` … 🚨「適用失敗」＋ `error` 全文。**カードを一覧の先頭に固定し、赤帯で出す**（失敗が下に埋もれるとSlack廃止で気づけなくなる）

失敗カードは日付をまたいでも当日の一覧に出す（`applyState=failed` を別枠 `未処理の失敗` として上部に表示）。

## 4. 状態と縁ケース

| 事象 | 挙動 |
|---|---|
| **未着**（`receivedAt: null`・`proposals: []`） | 🚨「今朝の判定が届いていません（night-harness の停止かPOST失敗。ログ: `~/Library/Logs/second-brain-harness.log`）」を赤帯で表示。**空リストを「今日は提案なし」と書かない**（[`17`](./17-harness-approval.md) §3.5） |
| 3件すべて `killed` | 通常表示（「今日は見送り3件」）。**これは正常**であり異常表示にしない |
| `kind` が `prune` / `model_switch` の日（月次・不定期） | 見出しを `資産剪定` / `補助輪の点検` に差し替え、件数が十数件になる。カードの構造・操作は同じ（[`17`](./17-harness-approval.md) §3.1） |
| decision の POST 失敗 | トーストで再試行。optimistic の巻き戻しは既存作法に従う |
| 適用済み行へのタップ | チェックを無効化（サーバも `bad_request`。§3.3 の帯で理由が見えている） |
| 過去日の `?date=` 直叩き | 表示は可・チェックも可（サーバが許す限り）。導線は作らない（当日集中） |

## 5. スコープ外

- 提案の一覧・検索・過去分ナビゲーション（当日集中モデル）
- 画面からの適用実行（適用は翌朝の無人 cron のみ。**「今すぐ適用」ボタンは作らない**——承認と適用を切り離した設計が崩れる）
- スナップショットからの復元操作（パスを見せるところまで。復元はターミナルの領分）
- 通知・バッジ（Phase 2 の通知と一体で設計 → [`16-web-navigation.md`](./16-web-navigation.md) §7）

## 6. 見た目

専用のデザイン仕様・プロトタイプは作らない（[`16-web-navigation.md`](./16-web-navigation.md) §8 と同じ方針）。トークンは `docs/design/system/01-tokens.md`、パネル・md 描画・チェックリングは既存画面から流用する。

## 7. 関連仕様

- データ・API: [`17-harness-approval.md`](./17-harness-approval.md)
- ドロワーへの項目追加: [`16-web-navigation.md`](./16-web-navigation.md) §3
- パネル様式・md 描画の先例: [`12-web-digest.md`](./12-web-digest.md)／1タスク=1詳細ビュー: [`13-web-nightshift.md`](./13-web-nightshift.md)

## 実装単位

- [ ] [Frontend] `/harness` 画面（提案カード・全文展開・承認トグル・適用結果帯・未着表示）
  - 受け入れ基準: E2E（`web/e2e/<task-id>.spec.ts`）で検証が通る——承認チェックのトグル（`proposed ⇄ approved`）・「見送る」・「全文を読む」のその場展開・`killed` カードに操作が無いこと・未着（`receivedAt: null`）の赤帯表示・`failed` カードの先頭固定と赤帯。`make verify` PASS
- [ ] [Frontend] ドロワーに「ハーネス」項目を追加（[`16`](./16-web-navigation.md) の項目リスト1箇所）
  - 受け入れ基準: E2E でドロワーの「ハーネス」タップ→ `/harness` 遷移とアクティブ表示が通る。`make verify` PASS
- [ ] [Frontend] `shared/api/types.ts` を [`03-api.md`](./03-api.md) の追加 DTO と手動同期
  - 受け入れ基準: 追加 DTO（proposals 一覧・decision・apply-result）が [`03-api.md`](./03-api.md) の定義と一致し、TS strict の型チェック込みで `make verify` PASS
