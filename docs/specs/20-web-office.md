---
status: confirmed
confirmed_rev: 033fac1
---

# 20. 「オフィス」画面仕様（自動化の勤務帯と直近の報告）

**親**: [`00-overview.md`](./00-overview.md) ｜ **担当**: Frontend ｜ **範囲**: `app/office/page.tsx`・`features/office/`・ドロワー項目の追加

## 1. 目的

second-brain 側で無人稼働している **Orca automation 19本**が「いつ動く役なのか」「直近で何を出したのか」を1画面で把握できるようにする。人格を持った社員が増えたのと同じで、名前と勤務時間と直近の報告が並んでいないと、誰が何をしているのか本人にも分からなくなる（2026-08-21 ユーザー起点）。

**手書きの静的HTMLでは解決しない**ことが先に分かっている。second-brain の `80_運用ガイド/運用ダッシュボード.html`（最終更新 2026-07-12）と `運用フロー全体図.html`（同 07-29）は同じ目的で作られたが、両方とも現状と合っていない——市場候補仕入れ（market-intake）と夜勤（night-shift）は両方に未記載、ハーネス取り込み・導出・ブラインドスポットはダッシュボード側に無い。だから**実行履歴を入力に取り、手で書き足す欄をゼロにする**のがこの画面の要件であり、それが手書きHTMLに対する存在理由になる。

## 2. 入出力

- **入力**: `GET office.json`（夜勤ビューアと同じ :48310 の静的サーバが配信。接続規則・https 時の path マウントは [`13-web-nightshift.md`](./13-web-nightshift.md) §4 と同一）
- **出力**: なし（表示のみ。automation の起動・停止・編集はしない → §7）
- **経路**: `/office`（ドロワー項目。詳細は `/office?run={run_id}`）

cerebellum のサーバーは経由しない（Rust・SQLite・API の変更なし）。[`19-web-dev-history.md`](./19-web-dev-history.md) が runs.json を直に読むのと同じ構図で、**Frontend だけで完結する**。

`office.json` の形（正本は second-brain の `.claude/scripts/build_office.py`。§8）:

```
{ generated_at, window_days,
  employees: [ { automation_id, name, skill, enabled,
                 shift: { hour, minute, days, label },   // days = 毎日 | 平日 | 週末 | 月・水 …
                 next_run_at, last_run_at, last_run_id } ],   // 勤務開始時刻の昇順
  runs:      [ { run_id, automation_id, title, run_number,
                 scheduled_for, started_at, status, trigger,   // trigger = scheduled | manual
                 outcome, items, note, headline, output, truncated } ] }   // 新しい順
```

- 時刻はすべて Asia/Tokyo のローカル ISO 文字列（生成側で解決済み。画面で時差計算をしない）
- `skill` は automation の prompt から取れたときだけ入る（素のシェル実行ジョブは `null`。**名前を捏造しない**）
- `output`（報告全文）は直近3日の run にだけ入る。それより古い run は `null` で `headline` だけ（office.json の重さ対策。実測 206KB / 206 run）
- `name` は automation の現在の表示名、`title` はその run 当時の表示名。**改名されるので同一視しない**（実測: daily-digest は「daily-digest (朝の脳ダイジェスト)」→「つながり発見：daily-digest」に改名済み）。安定キーは `automation_id`

## 3. 処理詳細

### 3.1 勤務帯（画面の主役・最上段）

1. `employees` を返却順（勤務開始時刻の昇順）のまま**1本の縦の帯**として並べる。夜勤 01:00 から 22:00 までが一直線に並び、これがそのまま「シフト表」になる
2. 1行 = 1社員。左に `shift.label`（等幅・`毎日 01:00`）、中央に `name`、右に**直近 run の状態**
3. 行の下に直近 run の `headline` を1行で出す（省略記号は生成側で付与済み。画面で再切り詰めしない）
4. `enabled: false` の社員は「停止中」として最後にまとめ、`headline` を出さない（休職者を勤務帯に混ぜない）
5. フロアマップ（座席の絵）は**作らない**（2026-08-21 ユーザー決定。情報密度が帯に劣り、1回見て終わるため → §7）

### 3.2 直近 run の状態表示

`runs` から `automation_id` 一致の先頭（＝直近）を引き、次の優先順で1つだけ出す:

| 条件 | 表示 |
|---|---|
| `outcome = failed` | 失敗様式（`dg__warn` 流用） |
| `outcome = running` | 「実行中」 |
| `outcome = produced` | 成果あり様式＋`items` があれば件数、`note` があれば併記 |
| `outcome = none` | 「今日は無し」（**エラーにしない**。0件は正常 → §4） |
| `outcome = unknown` | 中立様式（色で語らず `headline` を読ませる） |
| 直近 run 無し | 「まだ実行なし」＋ `next_run_at` |

**当日分が無い社員**（`scheduled_for` が今日でない）は、直近 run の日付を補助表示する。週次・平日限定の社員（x-pdca は月曜・night-incubate は土曜・night-blindspot は日曜）が毎日「未実行」に見えるのを防ぐため。

### 3.3 run 詳細

1. 行タップで `/office?run={run_id}`。`headline` ＋ `output`（報告全文）＋ メタ（`run_number`・`scheduled_for`・`started_at`・`status`・`trigger`）を出す
2. `output` が `null`（3日より古い）ときは「報告全文は保持期間外です」と出す（欠落を無言にしない）
3. `truncated: true` のときは「報告は途中で切れています」を添える
4. ブラウザバックで帯へ戻る（19 の一覧・詳細と同じ挙動）

### 3.4 outcome の扱い（重要）

**`outcome` の判定は生成側（second-brain）の責務**で、cerebellum は受け取った値で塗るだけ（`AGENTS.md` ルール7）。判定は各 skill が最終報告の末尾に置く機械可読行 `OFFICE: outcome=produced items=2 note=…` だけを根拠にし、**自然文からの推測はしない**。

この行を持たない run は `unknown` になる。2026-08-21 時点では**全 run が `unknown`**（トレーラを出す skill がまだ無い）。したがって**画面は色に依存せず `headline` だけで読める情報設計にする**こと。色は skill 側の対応が進むにつれて後から効いてくる、という順序になる。

（経緯: 自然文への正規表現マッチで outcome を当てる案を実測で試して棄却した。206 run のうち132件が誤 `none`——「2本登録しました」→ none、「実行成功、追記も確認できました」→ failed。orca の `status` は実測327件で completed 326 / error 0 なので、**status は「セッションが起動して終わった」しか意味せず成果の代理にならない**。ここを曖昧にすると全員緑の画面になり、1週間で見なくなる）

## 4. 設定値・確定値

- データ源は :48310 の `office.json` 固定。ホスト名・https 時の path マウント（`/loop-reports`）は [`13-web-nightshift.md`](./13-web-nightshift.md) §4 の規則をそのまま使う（混在コンテンツで死ぬため独自実装しない）
- cerebellum 側に**スキーマ・API を足さない**（[`02-data-model.md`](./02-data-model.md)・[`03-api.md`](./03-api.md) は無変更）。Backend 作業ゼロ
- 生成の定期実行は second-brain 側に置く（cerebellum に時計駆動を持ち込まない → [`00-overview.md`](./00-overview.md) §5）
- 0件（`outcome = none`）は正常。空状態もエラーバナーにしない
- フロアマップ・座席レイアウトは不採用（§3.1-5）
- コスト・トークン表示は持たない（orca の `usage` は実測で `usage_not_enabled`＝取得不能）

## 5. インターフェース

- 構成規約（`app → features → shared`・feature 間 import 禁止・barrel 経由）: [`07-web-foundation.md`](./07-web-foundation.md) §3
- `shared/ui/RunCard`（夜勤・開発の共通部品）は**流用しない**。dev-loop の run（PR・動画）と automation の run（勤務帯・報告文）は形が違う。共通化は3例目が出てから判断する
- 警告様式は `dg__warn` を流用する。パネルは 19 §8 と同じ書き分け——勤務帯（一覧）は `panel stack` のリスト様式、run 詳細は `panel dg` 様式を流用する（2026-08-24 承認。勤務帯に `dg` の左右 padding を加えると、390px 幅で区切り線の連続性と本文幅が損なわれるため）

## 6. エラー処理

| 状況 | 表示 |
|---|---|
| office.json 取得失敗（サーバ停止・非 tailnet） | `ErrorBanner`（「オフィスのデータに接続できません」） |
| office.json が古い（`generated_at` が24時間以上前） | 帯の上に「データが {n} 時間前のものです」（生成の停止に気付けるようにする。エラーにはしない） |
| `employees` が空 | 空状態（「登録されている automation がありません」） |
| 未知の `run` パラメータ | 「その run は見つかりません」＋帯へ戻る導線 |
| `outcome` が未知の値 | `unknown` と同じ中立様式で描く（落とさない） |

## 7. スコープ外

- **automation の操作**（起動・停止・編集・即時実行）。読むだけ。書き込みは Orca CLI の役割で、cerebellum に持たせると承認なしで夜間ジョブを止められる画面になる
- **outcome の判定・生成**（second-brain の `build_office.py` と各 skill のトレーラ行が持つ。`AGENTS.md` ルール7）
- フロアマップ・座席の絵・在席アニメーション
- コスト・トークン集計（取得不能。§4）
- dev-loop の run 履歴（「開発」[`19-web-dev-history.md`](./19-web-dev-history.md) の役割。automation の `night-shift` 行からは開発画面へリンクするだけ）
- second-brain の手書きHTML2枚の撤去（Vault 側の作業。この画面が動いてから人間が消す）

## 8. 関連仕様

- **データ形の正本**: second-brain `.claude/scripts/build_office.py`（`orca automations list --json` / `orca automations runs --json` → `~/workspace/loop-reports/office.json`）
- 配信: `dev.harness.loop-reports.plist`（launchd・:48310・CORS 全開放）。夜勤ビューアと同じサーバに相乗りする
- 接続規則: [`13-web-nightshift.md`](./13-web-nightshift.md) §4 ／ 一覧・詳細の作り: [`19-web-dev-history.md`](./19-web-dev-history.md) §3
- ナビゲーション: [`16-web-navigation.md`](./16-web-navigation.md) §3

## 9. 他仕様への追記（2026-08-22 の承認で反映済み）

`AGENTS.md` ルール9（実装だけ黙って変えない）に従い、承認まで確定済みファイルを書き換えずに保留していた3点。**2026-08-22 の spec-review で confirmed になった時点で反映済み**（索引の詳細仕様書一覧への 20 の行追加も同時に実施）:

1. [`00-overview.md`](./00-overview.md) の Phase 一覧に **Phase 1.8 =「オフィス」画面**を追加し、§5 スコープ外の「メトリクス可視化（Phase 2 以降）」に「※automation の勤務帯と直近報告の表示に限り Phase 1.8 として前倒し（20）」を注記する（digest を 1.6、ハーネス承認を 1.7 として前倒したのと同じ書き方）
2. [`16-web-navigation.md`](./16-web-navigation.md) §3 のドロワーに7項目目「オフィス（`/office`）」を追加（「開発」の次）。§6 の「読む系のタスク起点詳細ビューはドロワーに入れない」には抵触しない——タスク行起点ではなく常設の一覧だから（「開発」と同じ位置づけ）
3. `AGENTS.md` ルール7の前倒しリストに Phase 1.8 の1行を追加

## 実装単位

- [ ] [Frontend] `office.json` 取得フックと「オフィス」画面の勤務帯（`/office`）
  - 受け入れ基準: E2E（`web/e2e/<task-id>.spec.ts`・office.json はフィクスチャを配信して :48310 実サーバに依存しない）で、勤務帯が生成側の返却順（01:00→22:00）で並ぶ・各行に勤務ラベルと直近 run の headline が出る・`enabled:false` が末尾の「停止中」に入る・当日 run が無い社員に直近実行日が出る・`generated_at` が24時間以上前のとき鮮度警告が出ることを検証。`make verify` PASS
- [ ] [Frontend] run 詳細（`/office?run=`）とドロワー項目の追加
  - 受け入れ基準: E2E で、行タップで報告全文とメタが出る・`output: null` の run で保持期間外メッセージが出る・ブラウザバックで帯に戻る・ドロワーに「オフィス」があり遷移してアクティブ表示になることを検証。`make verify` PASS
