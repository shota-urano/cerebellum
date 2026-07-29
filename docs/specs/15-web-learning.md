---
status: confirmed
confirmed_rev: 9db4adc
---

# 15. 学習セッションビュー仕様（画面）

**親**: [`00-overview.md`](./00-overview.md) ｜ **担当**: Frontend ｜ **範囲**: `app/learning/page.tsx`・`features/learning/`・「今日」画面の詳細導線

## 1. 目的

「今日」のタスク **「40_Projectsにて新たな学習」** をタップしたら、**レッスン → 問題 → 回答 → 当日の感想** の一本道を歩いて、最後にタスクが消し込まれる。見えるのは常に今日の1セットだけ——リストも在庫も出さない（当日集中モデル・2026-07-29 ユーザー決定）。「溜まっていくプレッシャー」を構造的に発生させない。

## 2. 入出力

- **入力**: `GET /api/learning/sets/{date}`（[`14-learning.md`](./14-learning.md)）。タスク側の `detailRef = learning.session` は `GET /api/days/{date}` の DTO に含まれる
- **出力**: `POST /api/learning/sets/{date}/result`（自己採点＋感想）、既存 `POST /api/days/today/checks/{taskId}`（消し込み）
- **経路**: `/learning?date=YYYY-MM-DD&taskId=...`（date 省略時は今日）。「今日」画面のタップ分割規約は [`12-web-digest.md`](./12-web-digest.md) §のとおり（`detailRef` 持ちの行は面全体が遷移）

## 3. 処理詳細

ステッパー4段。上部に `レッスン ─ 問題 ─ 回答 ─ 感想` の進捗インジケータ。md 描画・パネル様式はダイジェスト詳細（`panel dg`）と同じ。

### 3.1 レッスン

- 見出し: `今日の学習 — {theme}`
- `lesson_md` を表示 → 下部ボタン「問題へ」

### 3.2 問題

- `problems[]` を1問ずつカードで表示（`no`・`question_md`）
- `kind = "code"` の問題は `workdir` パスを**コピーボタン付き**で表示し、「ターミナルで解いてから戻ってきてください」の一文を添える（解く行為はこの画面の外。verify もターミナルの領分）
- 下部ボタン「答え合わせへ」——**この時点では入力を求めない**（quiz も頭の中で答えてから進む方式。入力欄を作ると code 問題と体験が割れる）

### 3.3 回答

- 各問題カードに `answer_md`（正解と解説）を展開し、**○ / △ / × の3択を必ずタップ**（全問タップするまで「感想へ」ボタンは無効）
- タップ状態はローカル state。まだ送信しない

### 3.4 当日の感想

- テキストエリア1つ（プレースホルダ「どこで詰まった？何が腑に落ちた？（1〜2行）」・空でも進める）
- ボタン「完了」で: ① `POST .../result`（grades＋feeling）→ ② 成功したら `POST /api/days/today/checks/{taskId}`（taskId が無いクエリなら省略）→ ③ 完了画面（「記録しました。明日のセットに反映されます」）→「今日へ戻る」

## 4. 状態と縁ケース

| 事象 | 挙動 |
|---|---|
| セットが無い（404） | 「今日の学習セットはありません（生成失敗か休み。ログ: night-study）」とだけ表示 |
| 途中離脱 | ローカル state のみ・永続しない。再訪時は最初から（1セット10分想定なので復元機構は作らない） |
| result 送信済みの日に再訪 | 記録済みの採点・感想を表示し「やり直す」ボタンで再度一本道（result は UPSERT・上書き） |
| result POST 失敗 | トーストで再試行。checks は result 成功後にしか呼ばない（記録なしに消し込まれるのが最悪ケース） |
| 過去日の `?date=` 直叩き | 表示・採点とも可（仕様上は動く）が、導線は作らない（当日集中） |

## 5. スコープ外

- 過去セットの一覧・ナビゲーション（当日集中モデル。復習は night-study が×△を翌日以降の生成に混ぜ込むことで実現 → [`14-learning.md`](./14-learning.md) §3.4）
- 画面内でのコード実行・verify
- メモキュー（学習インボックス）の入力 UI —— 将来スペック

## 6. 関連仕様

- データ・API: [`14-learning.md`](./14-learning.md)
- タスク行のタップ分割・detailRef 導線: [`12-web-digest.md`](./12-web-digest.md)
- 先例（1タスク=1詳細ビュー）: [`13-web-nightshift.md`](./13-web-nightshift.md)

## 実装単位

- [ ] [Frontend] 今日画面からの導線: `detailRef = learning.session` のタスク行タップで `/learning?date=...&taskId=...` へ遷移（[`12-web-digest.md`](./12-web-digest.md) §3.1 の分岐に追加）＋ `shared/api/types.ts` の DTO 追従
  - 受け入れ基準: E2E（`web/e2e/<task-id>.spec.ts`）で、learning.session 付きタスク行のタップ→ `/learning` 遷移と、リングタップ→トグルの分離が通る。`make verify` PASS
- [ ] [Frontend] 学習セッションビュー本体: 4段ステッパー（レッスン→問題→回答→感想）・○△×全問必須・記録成功後にのみタスク消し込み・セット無し/送信失敗/再訪（記録済み表示＋やり直し）の各状態
  - 受け入れ基準: E2E で一本道の完走（採点未完了時に「感想へ」が無効・完了→記録→消し込み→今日へ戻る）と、result POST 失敗時にタスクが消し込まれないことの検証が通る。`make verify` PASS
