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
- **経路**: `/office`（全景）／`/office?room={library|lab|market|studio}`（部署内）／`/office?desk=1`（自分の机）／`run` 併用で報告詳細

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

### 3.1 オフィス全景（4部屋＋MY DESK）

1. 全景では社員名・勤務時刻・個別 run を出さない。`LIBRARY` / `LAB` / `MARKET` / `STUDIO` の4部屋と中央の `MY DESK` だけを見せる
2. 最上部は「昨夜：正常（または失敗 n）」「あなたの仕事：n件」だけにする。全員を同じ強さで読ませず、正常なものほど暗く静かにする
3. 部屋は `skill` と現在の `name`（`skill:null` の補助だけ）を次の順で分類する。市場・ベンチ・フォロワー → MARKET、write/publish/pdca/post/reply/quote・ポスト/リプ/引用 → STUDIO、harness/study/seed/experiment/incubate/blindspot/auto-plug → LAB、それ以外（`null` を含む）→ LIBRARY。分類は表示上のグルーピングだけで outcome 判定には使わない
4. 部屋の信号は、人間対応（黄）→失敗（赤）→実行中（シアン）→正常（中立）の順で1つを強調する。色だけでなく「確認 n」「失敗 n」「処理中…」「正常」の文言を併記する
5. 部屋タップで `/office?room={id}` へ入り、初めて所属社員を表示する。`enabled:false` は全景では「停止中 n名」だけを弱く表示し、所属部屋内で停止中社員として確認できる
6. 390px の最初の viewport に4部屋とMY DESKを収める。全景で社員数に応じた縦スクロールは発生させない

（経緯: 2026-08-24 の2列フロアはoffice感を得られた一方、全社員の名前・勤務時間・状態が同じ強さで視界に入り、社員増加時の認知負荷が残った。2026-08-26 に「正常なものほど存在感を消す」「部屋＝役割、自分の机＝人間の仕事」という方針をユーザーが採用し、`cerebellum-office-my-desk-focus.png` と `cerebellum-office-studio-room-detail.png` を正本として本節を置き換えた）

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

全景ではこの詳細ラベルを常時出さず、部署内の社員席で出す。正常・`none`・`unknown` の社員は低コントラスト、`running` はシアン、`failed` は赤で示す。

### 3.3 MY DESK（人間の仕事）

1. 自然文から「要対応」を推測しない。直近 run が `outcome = produced` かつ `note = "承認待ち"` の完全一致の場合だけMY DESKへ載せる
2. 件数は `items` が正の数ならその値、無い・数でない場合はそのrunを1件と数える
3. 全景のMY DESKタップで `/office?desk=1` のシートを開き、対象社員・`headline`・件数と「内容を確認」を表示する
4. `failed` は「AIの失敗」であり「人間の承認待ち」ではない。赤い失敗件数へ含めるが、MY DESKには載せない

### 3.4 部署ルーム

1. 部署内では所属社員だけを `employees` の返却順で配置し、社員名・`shift.label`・直近状態を表示する
2. 承認待ち社員だけ黄で強調し `headline` を席に出す。実行中は「処理中…」、失敗は「失敗」。正常・待機は暗くして情報の背景へ退かせる
3. 下部に4部署とMY DESKへの導線を置く。ブラウザバックまたは「‹ OFFICE」で全景へ戻る
4. 所属社員が画面高を超える場合は部署内だけを縦スクロールし、社員を省略しない

### 3.5 run 詳細

1. 席タップで `/office?run={run_id}` に遷移し、フロア下端から報告シートを開く。最初に `headline` と主要メタを出し、「報告を見る」で `output`（報告全文）を展開する
2. `output` が `null`（3日より古い）ときは「報告全文は保持期間外です」と出す（欠落を無言にしない）
3. `truncated: true` のときは「報告は途中で切れています」を添える
4. 「閉じる」またはブラウザバックでシートを閉じ、同じフロアへ戻る

### 3.6 outcome の扱い（重要）

**`outcome` の判定は生成側（second-brain）の責務**で、cerebellum は受け取った値で塗るだけ（`AGENTS.md` ルール7）。判定は各 skill が最終報告の末尾に置く機械可読行 `OFFICE: outcome=produced items=2 note=…` だけを根拠にし、**自然文からの推測はしない**。

この行を持たない run は `unknown` になる。2026-08-21 時点では**全 run が `unknown`**（トレーラを出す skill がまだ無い）。したがって**画面は色に依存せず `headline` だけで読める情報設計にする**こと。色は skill 側の対応が進むにつれて後から効いてくる、という順序になる。

（経緯: 自然文への正規表現マッチで outcome を当てる案を実測で試して棄却した。206 run のうち132件が誤 `none`——「2本登録しました」→ none、「実行成功、追記も確認できました」→ failed。orca の `status` は実測327件で completed 326 / error 0 なので、**status は「セッションが起動して終わった」しか意味せず成果の代理にならない**。ここを曖昧にすると全員緑の画面になり、1週間で見なくなる）

## 4. 設定値・確定値

- データ源は :48310 の `office.json` 固定。ホスト名・https 時の path マウント（`/loop-reports`）は [`13-web-nightshift.md`](./13-web-nightshift.md) §4 の規則をそのまま使う（混在コンテンツで死ぬため独自実装しない）
- cerebellum 側に**スキーマ・API を足さない**（[`02-data-model.md`](./02-data-model.md)・[`03-api.md`](./03-api.md) は無変更）。Backend 作業ゼロ
- 生成の定期実行は second-brain 側に置く（cerebellum に時計駆動を持ち込まない → [`00-overview.md`](./00-overview.md) §5）
- 0件（`outcome = none`）は正常。空状態もエラーバナーにしない
- 全景・ルーム背景、社員、書類は `web/public/images/office/` の生成画像を使う。名前・勤務時間・状態・件数・操作は画像に焼き込まず、`office.json` からネイティブUIとして描画する
- コスト・トークン表示は持たない（orca の `usage` は実測で `usage_not_enabled`＝取得不能）

## 5. インターフェース

- 構成規約（`app → features → shared`・feature 間 import 禁止・barrel 経由）: [`07-web-foundation.md`](./07-web-foundation.md) §3
- `shared/ui/RunCard`（夜勤・開発の共通部品）は**流用しない**。dev-loop の run（PR・動画）と automation の run（勤務帯・報告文）は形が違う。共通化は3例目が出てから判断する
- 採用デザインの正本は全景 `docs/design/screenshots/cerebellum-office-my-desk-focus.png`、部署内 `docs/design/screenshots/cerebellum-office-studio-room-detail.png`
- 全景背景は `campus-floor.png`、部署背景は `room-floor.png`、社員は `employee-station*.png`、MY DESKの書類は `approval-folders.png`。すべて装飾画像（読み上げ対象外）で、アクセシブル名はリンク側に持たせる
- 警告様式は `dg__warn` を流用する。報告はフロア下端のモーダルシートとして表示する

## 6. エラー処理

| 状況 | 表示 |
|---|---|
| office.json 取得失敗（サーバ停止・非 tailnet） | `ErrorBanner`（「オフィスのデータに接続できません」） |
| office.json が古い（`generated_at` が24時間以上前） | フロアの上に「データが {n} 時間前のものです」（生成の停止に気付けるようにする。エラーにはしない） |
| `employees` が空 | 空状態（「登録されている automation がありません」） |
| 未知の `run` パラメータ | 報告シートに「その run は見つかりません」＋フロアへ戻る導線 |
| `outcome` が未知の値 | `unknown` と同じ中立様式で描く（落とさない） |

## 7. スコープ外

- **automation の操作**（起動・停止・編集・即時実行）。読むだけ。書き込みは Orca CLI の役割で、cerebellum に持たせると承認なしで夜間ジョブを止められる画面になる
- **outcome の判定・生成**（second-brain の `build_office.py` と各 skill のトレーラ行が持つ。`AGENTS.md` ルール7）
- 社員がフロア内を歩くアニメーション（状態を表す最小限の発光以外は動かさない）
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

- [ ] [Frontend] `office.json` 取得フックと2D「オフィス」全景＋部署ルーム（`/office`）
  - 受け入れ基準: E2E（`web/e2e/<task-id>.spec.ts`・office.json はフィクスチャを配信して :48310 実サーバに依存しない）で、全景に4部屋とMY DESKだけが出る・正常社員の名前は全景に出ない・部屋信号の優先順・MY DESKの承認件数・部屋タップ後に所属社員が返却順で出る・停止中社員は所属部屋内だけで出る・当日 run が無い社員に直近状態が出る・`generated_at` が24時間以上前のとき鮮度警告が出ることを検証。`make verify` PASS
- [ ] [Frontend] 報告シート（`/office?run=`）とドロワー項目の追加
  - 受け入れ基準: E2E で、部署内の席またはMY DESKからURL付きシートに `headline` とメタが出る・「報告を見る」で全文が展開される・閉じると直前の部署/MY DESKへ戻る・`output: null` の run で保持期間外メッセージが出る・ブラウザバックで全景へ戻れる・ドロワーに「オフィス」があり遷移してアクティブ表示になることを検証。`make verify` PASS
