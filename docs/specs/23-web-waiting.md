---
status: superseded
superseded_by: 25-web-inbox.md
---

> **2026-09-02 superseded**: 専用 API・専用画面としては出荷しない。作業ツリーの未コミット実装は [`25-web-inbox.md`](./25-web-inbox.md) の汎用「人間待ち項目」に作り替える素材にする。本文は判断の履歴として残す。

# 23. 「あなた待ち」画面仕様（daily取り込みの承認）

**親**: [`00-overview.md`](./00-overview.md) ｜ **担当**: Frontend ｜ **範囲**: `app/waiting/page.tsx`・`features/waiting/`・ドロワー項目の追加

## 1. 目的

前夜の `daily-harness` が仕分けた候補（ToDo・考え・口調）を読み、**残すものにタップするだけ**の画面。✅は翌晩 00:40 の書き戻し＋適用が読む（[`22-daily-intake.md`](./22-daily-intake.md)）。

いまは Obsidian で候補ファイルの `- [ ]` を手でチェックしている。**スマホで上から流し見して、指数回で今朝の分が終わる**のが達成状態。

名前が「daily取り込み」ではなく「あなた待ち」なのは、**この画面が将来この種の判断の集約先になる**ため（second-brain 側 Phase 2 で 00_Inbox→10_Sources の昇格判断・idea-forge の選抜印が同居する）。**器はレーンの追加に耐える形で作る**が、Phase 1 で受け取るのは3レーンだけ（[`22`](./22-daily-intake.md) §7）。

## 2. 入出力

- **入力**: `GET /api/intake/candidates?status=proposed`（未決を日付問わず新しい順）＋ `GET /api/intake/candidates?applyState=failed`（失敗枠）
- **出力**: `POST /api/intake/candidates/{id}/decision`
- **経路**: `/waiting`。ドロワーの項目（[`16-web-navigation.md`](./16-web-navigation.md)）と、`detailRef = intake.candidates` を持つタスク行からの遷移の2経路

## 3. 処理詳細

見出しは `あなた待ち`。`panel dg` 様式（ハーネス承認・ダイジェスト詳細と揃える）。

### 3.1 レーン別のグルーピング

未決をレーンで束ね、**ToDo → 考え → 口調** の順に並べる。レーン見出しに件数を出す。

| lane | 見出し | 補足 |
|---|---|---|
| `todo` | 📌 ToDo | ✅した行は翌晩 Linear へ起票される |
| `thought` | 💭 考え | ✅した行は `20_Insights/` に Insight として作られる |
| `tone` | 🗣 口調 | ✅した行は `05_口調.md` に追記される |

- レーン見出しの直下に**そのレーンの✅が何を起こすか**を1行で書く（**押した先で何が起きるかを画面上で明示する**——[`18-web-harness.md`](./18-web-harness.md) §3.2 と同じ原則）
- 未決0件のレーンは見出しごと省く
- 日付が複数日にまたがる場合（後日タップぶんが残っているとき）は、行の右下に元ノートの日付を小さく添える。**日付でグループを割らない**（レーンで束ねるほうがタップの流れが速い）

### 3.2 候補カード

上から: **原文** → **補足（`note`・あれば）** → **操作**。

- **原文（`text`）を最も大きく置き、引用の様式で出す**。要約は存在しない（送信側が原文引用主義のため）ので、判断材料は原文そのもの
- 操作は ✅（`approved`）と ❌（`rejected`）の2つ。チェックリング（`shared` の消し込み様式を流用）をタップで `proposed ⇄ approved` をトグルし、**optimistic update**（既存 `useToggleCheck` と同じ作法）
- ❌は別ボタン。**❌と無操作は別物**——❌はカードを一覧から落とすが、無操作（`proposed`）の行は翌日以降も残り続ける（後日タップすれば拾われる）。この違いを画面下部に1行で常時表示する
- 決着した（✅/❌した）カードはその場で淡色に落とし、リストからは消さない（誤タップの取り消し路。もう一度タップで `proposed` に戻せる）
- 元ノートへのリンクは作らない（cerebellum は Vault を参照しない）。`sourcePath` は行の詳細としてコピー可能に置くだけ

### 3.3 タップの締切を書く

画面下部に「✅したものが**今晩 00:40** に反映されます」を常時表示する。ハーネス承認（`翌朝06:20`）と時刻が違うので、同じ文言を使い回さない。

### 3.4 反映失敗の表示

この画面に出る適用結果は**失敗だけ**である。画面が引くのは `?status=proposed`（未決）と `?applyState=failed`（失敗）の2つで、**反映が成功した行はどちらにも入らず、画面から消える**——「あなた待ち」は待っているものだけを出す画面であり、済んだ結果は Vault 側（`20_Insights/` ・ `05_口調.md` ・ Linear の issue）が正本だから（[`22`](./22-daily-intake.md) §1 の分界）。成功を見に行く導線はこの画面には作らない。

- `failed` … 🚨「反映失敗」＋ `error` 全文。**`未処理の失敗` 枠として一覧の先頭に固定し、赤帯で出す**（取得元は `GET ?applyState=failed`・日付問わず新しい順。[`22`](./22-daily-intake.md) §3.4）。失敗行は `status = approved` なので未決一覧には現れず、両者は重複しない
- 失敗カードには**元ノートの日付を必ず併記する**（日をまたいで出続けるため、いつの分か分からないと直せない）
- 失敗の主因は「候補ファイルの原文が編集されて行が見つからない」（[`22`](./22-daily-intake.md) §8）なので、**エラー文をそのまま出す**（人間がターミナルで直すための情報）
- 失敗行の ✅/❌ は**無効化して見せる**（消さない。§4）

## 4. 状態と縁ケース

| 事象 | 挙動 |
|---|---|
| **未着**（`latestReceivedAt` が今日でない・`null`） | 🚨「今晩の抽出が届いていません（daily-harness の停止か POST 失敗。ログ: `~/Library/Logs/second-brain-daily-intake.log`）」を赤帯で表示。**空リストを「今日は候補なし」と書かない**（[`22`](./22-daily-intake.md) §3.5） |
| 今日の受信あり・`latestItemCount = 0` | 「前夜のノートから拾う行はありませんでした」と通常表示。**これは正常**であり異常表示にしない |
| 今日の受信あり・未決0件（全部タップ済み） | 「今朝の分は片付いています」と通常表示 |
| 未決が前日以前の行だけ残っている | 通常表示（日付を添える）。**古いから消す、はしない**（後日タップしても拾われる仕様） |
| decision の POST 失敗 | トーストで再試行。optimistic の巻き戻しは既存作法に従う |
| 適用済み行へのタップ | 無効化（サーバも `bad_request`。§3.4 の帯で理由が見えている） |

## 5. スコープ外

- 候補の編集（原文を直したくなったら Obsidian で候補ファイルを直す。**画面から Vault は書けない**）
- 画面からの適用実行・画面からの Linear 起票（適用は無人 cron のみ・起票は `--apply` の責務。[`22`](./22-daily-intake.md) §7）
- 痛点・種・週次反復パターンの表示（別の関門がある → [`22`](./22-daily-intake.md) §7）
- 過去の決着ぶんの一覧・検索、**反映が成功した行の表示**（未決と失敗だけを出す → §3.4）
- 通知・バッジ（Phase 2 の通知と一体で設計 → [`16-web-navigation.md`](./16-web-navigation.md) §7）

## 6. 見た目

専用のデザイン仕様・プロトタイプは作らない（[`16-web-navigation.md`](./16-web-navigation.md) §8 と同じ方針）。トークンは `docs/design/system/01-tokens.md`、パネル・チェックリング・赤帯は既存画面（ハーネス承認・今日）から流用する。

## 7. 関連仕様

- データ・API: [`22-daily-intake.md`](./22-daily-intake.md)
- ドロワーへの項目追加: [`16-web-navigation.md`](./16-web-navigation.md) §3
- 同型の画面（承認 → 翌日の無人適用）: [`18-web-harness.md`](./18-web-harness.md)

## 実装単位

- [ ] [Frontend] `/waiting` 画面（レーン別グルーピング・候補カード・✅/❌・適用結果帯・未着表示・失敗枠）
  - 受け入れ基準: E2E（`web/e2e/<task-id>.spec.ts`）で検証が通る——✅のトグル（`proposed ⇄ approved`）・❌（`rejected`）・決着カードが淡色で残ること・レーン順（ToDo→考え→口調）と未決0レーンの省略・未着（`latestReceivedAt` が今日でない）の赤帯・0件受信（`latestItemCount: 0`）が正常表示になること・`failed` の先頭固定と赤帯。`make verify` PASS
- [ ] [Frontend] ドロワーに「あなた待ち」項目を追加（[`16`](./16-web-navigation.md) の項目リスト1箇所）
  - 受け入れ基準: E2E でドロワーの「あなた待ち」タップ→ `/waiting` 遷移とアクティブ表示が通る。`make verify` PASS
- [ ] [Frontend] `shared/api/types.ts` を [`03-api.md`](./03-api.md) の追加 DTO と手動同期
  - 受け入れ基準: 追加 DTO（候補一覧・decision・apply-result）が [`03-api.md`](./03-api.md) の定義と一致し、TS strict の型チェック込みで `make verify` PASS
