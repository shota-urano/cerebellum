---
status: draft
---

# 26. 「オフィス」の会社案内追補（所属部署・人間確認の印・会社案内シート）

**親**: [`00-overview.md`](./00-overview.md) ｜ **担当**: Frontend ｜ **範囲**: `features/office/`（社員カードへの2項目追加・部署絞り込み・会社案内シート）

[`20-web-office.md`](./20-web-office.md)・[`21-web-office-roster.md`](./21-web-office-roster.md)（いずれも confirmed・実装済み）への**増分**。20 の情報設計（部屋＝役割・正常なものほど静かに・読むだけ）と 21 の名簿の運び方（正本は second-brain の `SKILL.md` frontmatter・`office.json` 経由・cerebellum に対応表を持たない）は変更しない。

## 1. 目的

second-brain 側の組織再設計（Vault `85_定義/ハーネス組織.md`・2026-09-01〜02）で、自動化群は「8部署 × 5職種 × 技能 × シフト × 身体 × 頭脳」で管理すると決まった。その社員カード節に「**会社案内1枚ビュー（cerebellum）はこのブロック（`office:`）を機械で集めて描く。カードが書けない一体は編成に載せない**」とあり、これが本仕様の出どころ。second-brain 側の移行工事④（シフト表の正式化・社員カードへの `review` 追記・`build_office.py` の改修）は 2026-09-02 に完了し、画面が読むデータは `office.json` に載っている。**残っているのは cerebellum 側の描画だけ**。

いまの `/office` に足りないのは3つ。

1. **所属部署が無い**。20 の4部屋（LIBRARY / LAB / MARKET / STUDIO）は skill 名からの表示上の分類で、組織図の8部署（second-brain-harness / x-harness / note-harness / rakuten-harness / biz-harness / marketing-harness / growth-harness / engineering）と一致しない。組織図を見た人が画面で同じ部署を探せない
2. **人間確認の有無が無い**。21 の `checks[]` は「何を見るか」の文で、**この社員が cerebellum に確認項目を送ってくる係かどうか**（[`24`](./24-inbox.md) §9 の `review`）が読めない。名簿に `review` が載った今、画面に出さないと「枠が自動で立つ」達成状態が見えない
3. **1枚で一望する面が無い**。全景は4部屋の信号だけ、部署内は席の並びで、「うちの会社に誰がいて、いつ働き、どこで自分の判断を求めてくるか」を1枚のテキストで読む面が無い。組織図（Vault の HTML）は設計書であって生きたデータを描かない

**勤務帯・手動起動は 21 §3.2 で既に出ている**ので本仕様では触らない。[`24`](./24-inbox.md) §10 の「20・21 オフィス: 名簿に `profile.review` が増える。画面は『人間確認あり』の社員に印を出す程度の追補」を実装に落とすのが本仕様。

## 2. 入出力

- **入力**: `GET office.json`（20 §2 と同一。接続規則も同一）。本仕様が読む追加項目:
  - `employees[].profile.review: { kinds: string[], cadence: "shift"|"adhoc" } | null` — **second-brain 側で 2026-09-02 実装済み**（`build_office.py` が値域を検査して運ぶ。不正値は `null`。19/31 社員に載っている）
  - `employees[].profile.dept: string | null` — **未実装・§9 で second-brain 側へ提案**。届くまでは全社員 `null` として扱う（§3.1-3）
- **出力**: なし（表示のみ。20 §7 を踏襲）
- **経路**: 既存の `/office?room=`・`?employee=`・`?line=` は不変。追加は `/office?dept={id}`（部署絞り込み・§3.3）と `/office?company=1`（会社案内シート・§3.4）の2つ

## 3. 処理詳細

### 3.1 社員カードへの2項目追加（21 §3.2 の増分）

| 名簿項目 | データ | 席 | 社員カード |
|---|---|---|---|
| **所属部署** | `profile.dept` | 出さない | 部署 id を等幅で出し、タップで `/office?dept={id}`（§3.3） |
| **人間確認** | `profile.review` | 出さない | §3.1-1 の文言で1行 |

1. 人間確認の文言は `review` から機械的に決める。`kinds` を並べ、`cadence` を括弧で添える:
   - `review` あり・`kinds` が `alert` のみ → 「人間確認: 異常のみ通知（{cadence}）」
   - `review` あり・それ以外 → 「人間確認: {kinds を「・」で連結}（{cadence}）」。`cadence` の表示は `shift` → 「勤務帯どおり毎回」、`adhoc` → 「不定期」
   - `review` が `null` → 「人間確認: なし」。**欠損ではなく正常な状態**（24 §9「`review` が無い skill は人間確認なし」）なので 21 §3.2-3 の「未記載」様式は使わない
2. `kinds` の値は画面で翻訳しない（`approve` / `choose` / `read` / `alert` のまま等幅で出す）。[`25`](./25-web-inbox.md) の「あなた待ち」画面が同じ語を使うので、画面間で語を揃える
3. `profile.dept` が `null` → 「部署 未記載」（21 §3.2-3 の欠損様式）。**skill 名や `line` から推測して埋めない**
4. 席には両方とも出さない（20 §3.1-2「正常なものほど暗く静かに」）。MY DESK（20 §3.3）の判定にも混ぜない——`review` は「送ってくる係かどうか」の宣言であって、いま承認待ちがあるかどうかは [`24`](./24-inbox.md) の summary が持つ

### 3.2 部署ヘッダの内訳（21 §3.4-3 の増分）

1. 部屋（20 の4部屋）のヘッダ内訳に「人間確認あり n名」を足す。`review` が `null` でない社員を数える
2. 名簿未記載（`profile` が無い）の社員数も足す（例 `勤務帯 4名・手動 2名・人間確認あり 3名・名簿未記載 1名`）。正本の「カードが書けない一体は編成に載せない」を画面で可視化するため。**未記載の社員を隠さない**（隠すと設定漏れが永久に見えなくなる。21 §3.3-1 と同じ理由）

### 3.3 部署絞り込み（`/office?dept={id}`）

21 §3.7 のライン絞り込みと**同型**。別軸のグルーピングであって別の画面ではない。

1. `profile.dept` が `{id}` に一致する在籍社員だけを、部署ルームと同じ席・同じブロック分け（勤務帯→手動→停止中）・同じ状態表示で出す。部屋をまたぐ
2. ヘッダは `DEPT: {id}` と内訳（§3.2 と同じ形）。`dept` の日本語ラベル対応表を cerebellum に持たない（21 §4）ので id のまま出す
3. 矢印・連結線を描かない。並びは返却順のまま
4. `room`・`line`・`dept` が同時に指定されたら `room` → `line` → `dept` の優先順（既存の `room > line` を壊さない）
5. 該当社員が居ない `dept` は空状態＋全景への導線
6. **全景に部署の導線を増やさない**（20 §3.1-1 の4部屋＋MY DESK のまま。入口は社員カードの所属部署タップと会社案内シートだけ）

### 3.4 会社案内シート（`/office?company=1`）

正本の「会社案内1枚ビュー」の本体。**テキストだけの1枚**で、読むだけ。

1. 部署ごとに区切り、各部署に §3.2 の内訳と所属社員を1行ずつ出す。1行の内容は **名前・勤務帯 or 手動起動・仕事の一言（`profile.job`）・人間確認（§3.1-1 の文言）** の4つ。正本の社員カード4点（仕事の一言／いつ働くか／人間が確認すること／成果物の行き先）のうち前3つで、成果物の行き先は 21 §3.6 のミニラインに任せて1行には入れない（行が伸びて一望できなくなる）
2. 部署の並びは **`employees` の返却順で最初に現れた `dept` の順**。cerebellum 側に部署の順序表を持たない。`dept` が `null` の社員は末尾に「部署 未記載」としてまとめる（隠さない）
3. 部署見出しタップで `/office?dept={id}`、社員行タップで `/office?employee={automation_id}`（21 §3.1 の社員カード）
4. 停止中（`enabled:false`）の社員は各部署の末尾に「停止中」の小見出しで出す（21 §3.4-1 と同じ順）
5. 席・部屋・書類の画像を使わない。CSS のみ。SVG のノードグラフも持ち込まない（21 §5・§7 の「一望させない」境界はミニラインに対する規律で、会社案内は**名簿の一覧**であって流れの図ではない）
6. 全景（`/office`）からの導線は**1つだけ**（ヘッダの「会社案内」リンク）。全景の4部屋＋MY DESK の構図を変えない
7. `generated_at` の鮮度警告（20 §6）はシートにも同じ位置で出す。名簿専用の鮮度表示は持たない（21 §4）

## 4. 設定値・確定値

- データ源・接続規則・生成の定期実行は 20 §4 と同一。cerebellum 側に**スキーマ・API を足さない**（[`02-data-model.md`](./02-data-model.md)・[`03-api.md`](./03-api.md) は無変更・Backend 作業ゼロ）
- `review.kinds` の値域は `approve` / `choose` / `read` / `alert`、`cadence` の値域は `shift` / `adhoc`（24 §2・§9）。検査は `build_office.py` の責務で、画面は届いた値をそのまま出す（不正値は届かない）
- `dept` の値域は Vault `85_定義/ハーネス組織.md` の8部署 id。画面は値域を検査しない・翻訳しない（未知の値も文字列のまま出す）
- 名簿の正本は各 skill の `SKILL.md` frontmatter（second-brain 側）。**cerebellum リポジトリに部署の対応表・順序表・日本語ラベル表を持たない**（21 §4 と同じ。作った時点で 20 §1 の手書きHTMLと同じ末路になる）

## 5. インターフェース

- 構成規約（`app → features → shared`・feature 間 import 禁止・barrel 経由）: [`07-web-foundation.md`](./07-web-foundation.md) §3
- `office.json` の取得は `features/office` の既存 `useOffice` を使う（25 §5 と同じ。取得経路の重複実装をしない）
- 部署絞り込みは 21 §3.7 と同じく `OfficeRoomView` 相当の部品を流用する。見た目を作り直さない
- 会社案内シートは既存のモーダルシート様式（21 §5 の `OfficeReportSheet` と同系）か全画面のどちらでもよいが、**画像を使わない・CSS のみ**は守る
- `web/src/shared/api/types.ts` の `office.json` 型に `profile.review`・`profile.dept` を足す（どちらも `| null`）。`03-api.md` は cerebellum の API ではない `office.json` を定義していないので追記しない（20 §2 の扱いを踏襲）

## 6. エラー処理

| 状況 | 挙動 |
|---|---|
| `office.json` 取得失敗・鮮度切れ | 20 §6 と同一（本仕様で新しい状態を増やさない） |
| `profile` が無い社員 | 21 §3.2-3 のまま「名簿 未記載」。会社案内シートでは部署末尾ではなく「部署 未記載」の束に入る |
| `review` が `null` | 「人間確認: なし」（正常。§3.1-1） |
| `dept` が `null` | 「部署 未記載」（欠損。§3.1-3） |
| `dept` が未知の値 | 文字列のまま出す（検査しない。§4） |
| 未知の `dept` で絞り込み | 空状態＋全景への導線（§3.3-5） |

## 7. スコープ外

- **未着判定**（「今日届いているべきなのに届いていない」）は [`25`](./25-web-inbox.md) §3.3 の責務。本仕様は `review` を名簿項目として**表示するだけ**で、`summary` との突合をしない
- 承認・選択・既読の操作は [`25`](./25-web-inbox.md)。会社案内から項目を操作させない（読むだけ・20 §7）
- 20 §3.1-3 の部屋分類規則（4部屋）の変更。部署（`dept`）で部屋を切り直さない——部屋は表示上の役割グルーピング、部署は組織図の所属で、別軸として並存させる（ライン絞り込みと同じ整理）
- 職種（orchestrator / collector / creator / adversary / judge）の表示。`office.json` に職種は無く、正本の編成表でも「進行役が立てる個体」として skill の進行手順が持つ情報。名簿項目に足すかは second-brain 側の判断待ち
- 縮退方針（codex代替可／翌日繰り越し／model不要）・runtime・model の表示。正本のシフト表が持つが `office.json` に無い。必要になったら `profile` への追加を §9 と同じ経路で提案する
- 画像の追加・差し替え（20 §5・21 §5）
- Vault ファイルへのリンク（`profile.doc` は等幅テキストのまま。21 §3.2-4）

## 8. 関連仕様

- 土台: [`20-web-office.md`](./20-web-office.md)（全景・部屋・席・直近 run）／[`21-web-office-roster.md`](./21-web-office-roster.md)（社員カード・手動起動・ミニライン・ライン絞り込み）
- `review` の定義と送信側の責務: [`24-inbox.md`](./24-inbox.md) §9・§10
- `review` を未着判定に使う側: [`25-web-inbox.md`](./25-web-inbox.md) §3.3
- 契約の正本（second-brain 側）: Vault `85_定義/ハーネス組織.md`「社員カード」節・「シフト表」節・「移行工事」④／組織図 `85_定義/図/ハーネス組織図.html`（表1 編成表・表5 シフト表）
- 名簿の運び手: `~/workspace/office-view/build_office.py`（launchd 10分ごと・`profile.review` は 2026-09-02 から運んでいる）

## 9. `office.json` スキーマへの提案（second-brain 側へ）

**`profile.dept` を足す**（`string | null`）。正本は各 skill の `SKILL.md` frontmatter `office:` ブロックに `dept: <8部署 id>` を1行足す形で、`build_office.py` が `profile.dept` として運ぶ。`review` と同じ経路・同じ原則（cerebellum に対応表を持たない）。

- 値域は正本の8部署 id: `second-brain-harness` / `x-harness` / `note-harness` / `rakuten-harness` / `biz-harness` / `marketing-harness` / `growth-harness` / `engineering`
- 既存の `line`（knowledge / x / harness / learning / note / incubate / dev / rakuten / none）は**廃止しない**。`line` は上下流のパイプライン軸、`dept` は組織図の所属軸で、`harness` ラインには second-brain-harness と engineering の両部署の社員が乗るなど1対1でない
- 届くまで画面は全社員を「部署 未記載」として扱う（§3.1-3）。**画面側で `line` から `dept` を推測して埋めない**
- script 社員（小垢ベンチ収集・フォロワー日次スナップショット・watchdog）は `SKILL.md` を持たないので `profile` ごと無く、会社案内では「部署 未記載」に入る。正本の編成表では x-harness / engineering 所属なので、この3件をどう名簿に載せるか（automation 名で引く `auto:` 相当の別経路か、載せないか）は second-brain 側の判断

## 10. 他仕様への追記（confirmed 時に反映）

`AGENTS.md` ルール9 に従い、承認まで確定済みファイルを書き換えずに保留する4点:

1. [`00-overview.md`](./00-overview.md) §3 の索引に 26 の行を追加。Phase 2.0 の記述に「オフィスへの会社案内追補（[26](./26-web-office-company.md)）」を併記する（Phase を増やさない。20・21 と同じ Frontend 増分で、スキーマ・API は無変更のまま）
2. [`21-web-office-roster.md`](./21-web-office-roster.md) §3.2 の表に「所属部署」「人間確認」の2行を足し、§3.7 に「部署絞り込みは 26 §3.3（同型）」の参照を足す
3. [`24-inbox.md`](./24-inbox.md) §10 の「20・21 オフィス」行を「→ 26 で実装」に改める
4. `AGENTS.md` ルール7 の Phase 1.8 の行に 26 を併記する

## 実装単位

- [ ] [Frontend] 社員カードへの所属部署・人間確認の追加と部署ヘッダ内訳（§3.1・§3.2）
  - 受け入れ基準: E2E（`web/e2e/<task-id>.spec.ts`・office.json はフィクスチャを配信して :48310 実サーバに依存しない）で、`review: {kinds:[approve,read], cadence:shift}` の社員カードに「人間確認: approve・read（勤務帯どおり毎回）」が出る・`kinds:[alert]` で「異常のみ通知」が出る・`cadence:adhoc` で「不定期」が出る・`review:null` で「人間確認: なし」が出て未記載様式にならない・`dept:null` で「部署 未記載」が出て skill 名から推測した値が出ない・席には両項目が出ない・MY DESK の件数が `review` の有無で変わらない・部署ヘッダに「人間確認あり n名」と「名簿未記載 m名」が出ることを検証。`make verify` PASS
- [ ] [Frontend] 部署絞り込み（`/office?dept=`）（§3.3）
  - 受け入れ基準: E2E で、社員カードの所属部署タップで `/office?dept={id}` へ入る・部屋をまたいで `dept` 一致の在籍社員だけが部署ルームと同じ席・ブロック分け・状態表示で出る・ヘッダに `DEPT: {id}` と内訳が出る・矢印や連結線を描かない・未知の `dept` で空状態＋全景への導線が出る・`room`/`line`/`dept` 同時指定で `room` → `line` → `dept` の優先順になる・**全景に部署導線が増えていない**ことを検証。`make verify` PASS
- [ ] [Frontend] 会社案内シート（`/office?company=1`）（§3.4）
  - 受け入れ基準: E2E で、全景ヘッダの「会社案内」から開く・部署が `employees` の返却順で最初に現れた順に並ぶ・各部署に内訳と社員1行（名前・勤務帯 or 手動起動・`job`・人間確認）が出る・`dept:null` の社員が末尾の「部署 未記載」に出て消えていない・停止中社員が各部署末尾の「停止中」小見出しの下に出る・部署見出しタップで `/office?dept=`、社員行タップで `/office?employee=` に移る・画像要素（`img`）を含まない・`generated_at` が24時間以上前のとき鮮度警告が出る・全景の4部屋＋MY DESK の構図が変わっていないことを検証。`make verify` PASS
