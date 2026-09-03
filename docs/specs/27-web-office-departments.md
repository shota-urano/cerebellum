---
status: draft
---

# 27. 「オフィス」全景を部署ベースに作り替える（4部屋の廃止・8部署の部屋・部署一覧の受け取り）

**親**: [`00-overview.md`](./00-overview.md) ｜ **担当**: Frontend ｜ **範囲**: `features/office/`（全景の部屋分類・部署ルーム・会社案内の並びと表示名）

[`20-web-office.md`](./20-web-office.md)・[`21-web-office-roster.md`](./21-web-office-roster.md)・[`26-web-office-company.md`](./26-web-office-company.md)（いずれも confirmed・実装済み）への**増分**。20 の情報設計（正常なものほど静かに・読むだけ・全景で社員名を出さない）と 21 の名簿の運び方（正本は second-brain の `SKILL.md` frontmatter・`office.json` 経由・cerebellum に対応表を持たない）は変更しない。**変えるのは「部屋の切り方」だけ**——20 §3.1-3 の skill 名からの4分類を捨て、名簿の `profile.dept`（8部署 id）で部屋を切る。

## 1. 目的

26 は「部屋（LIBRARY / LAB / MARKET / STUDIO）は表示上の役割グルーピング、部署（`dept`）は組織図の所属で、別軸として並存させる」と整理し（26 §7）、全景の4部屋を据え置いた。2026-09-03 に本人が全景を見て「**部署が古い。4つしか無い**」と読んだ（会社案内シートは8部署で出ていたのに、全景が4部屋だったため）。並存の整理は画面上では伝わらず、名簿の正本が `dept` になった以上、`line` や skill 名から導いた4部屋は**正本と二重の分類**になっている。

いまの `/office` の問題は3つ。

1. **全景の部屋が組織図と一致しない**。組織図（Vault `85_定義/図/ハーネス組織図.html`）は8部署を並べるが、画面は4部屋。同じ会社に見えない
2. **部屋の分類規則が cerebellum 側の正規表現**（`office.ts` の `roomOf`）で、second-brain 側で所属を変えても画面が追随しない。21 §4「cerebellum に対応表を持たない」に反する例外が、部屋の分類だけに残っている
3. **部署の表示名と並び順が無い**。26 §3.3-2・§3.4-2 の決定どおり cerebellum は日本語ラベル表・順序表を持たないので、会社案内は `second-brain-harness` のような id を返却順に出す。正本の編成表（記憶整備 / X運用 / note / 楽天 / 事業開発 / マーケ / 学習・成長 / 技術、この順）と見た目が揃わない

3 は cerebellum に表を持って解くのではなく、**名簿の運び手（`build_office.py`）が `office.json` に部署一覧を載せる**ことで解く（§9）。`build_office.py` は `dept` の値域検査のために8部署 id を既に持っているので、表を置く場所は新しく増えない。

## 2. 入出力

- **入力**: `GET office.json`（20 §2 と同一。接続規則も同一）。本仕様が読む項目:
  - `employees[].profile.dept: string | null`（26 §9 で提案・**second-brain 側で 2026-09-02 実装済み**。29/31 社員に載っている）
  - `departments: { id: string, label: string, order: number }[] | undefined` — **未実装・§9 で second-brain 側へ提案**。届くまでは無いものとして扱う（§3.1-4）
- **出力**: なし（表示のみ。20 §7 を踏襲）
- **経路**: `/office`（全景）・`/office?room={deptId}`（部署ルーム。§3.2）・`/office?dept={id}` は `?room=` の別名として残す・`/office?line=`・`?employee=`・`?desk=1`・`?company=1` は不変

## 3. 処理詳細

### 3.1 全景（8部署＋MY DESK）— 20 §3.1 の置き換え

1. 全景に出す部屋は **`profile.dept` の値ごとに1つ**。skill 名・`name`・`line` から部屋を推測する規則（20 §3.1-3）は廃止し、`roomOf` 相当の正規表現を削る。LIBRARY / LAB / MARKET / STUDIO の4部屋は無くなる
2. `dept` が `null`、または `profile` が無い社員は、末尾の1部屋「**部署 未記載**」に入れる。**隠さない**（26 §3.2-2 と同じ理由。正本の「カードが書けない一体は編成に載せない」の取りこぼしを見せ続ける）。該当が0人のときはこの部屋を出さない
3. 部屋の並びは `departments[].order` 昇順。`departments` に無い `dept` 値（未知の部署）は `departments` の後に返却順で並べ、「部署 未記載」は常に最後
4. **`departments` が届いていないとき**は、部屋の見出しに `dept` の id をそのまま出し、並びは `employees` の返却順で最初に現れた順（26 §3.4-2 と同じ規則）。id から表示名を推測しない・cerebellum 側に暫定の表を置かない
5. 部屋の見出しは `departments[].label`（例「記憶整備」）を主にし、id（`second-brain-harness`）を等幅で小さく添える。会社案内（26 §3.4）・部署ルームのヘッダ（26 §3.3-2 の `DEPT: {id}`）も同じ見出し形に揃える
6. 部屋の信号・文言（人間対応→失敗→実行中→正常の優先順・「確認 n」「失敗 n」等）は 20 §3.1-4 のまま。所属社員数の内訳（「勤務帯 n名・手動 m名・停止中 k名」）は部屋ごとに 26 §3.2 の形で出す
7. 最上部の「昨夜：」「あなたの仕事：」（20 §3.1-2）と **MY DESK（20 §3.3）は据え置き**。MY DESK の件数の出どころ（直近 run の `note = "承認待ち"`）は本仕様で変えない（§7）
8. 部屋が8つ以上になるので、20 §3.1-6「390px の最初の viewport に全部屋と MY DESK を収める」は次のように改める: **最初の viewport に最上部の2行・MY DESK・部屋の先頭2行分（4部屋）が入ること**。残りの部屋は縦スクロールで続く。全景で**社員数**に応じたスクロールは依然発生させない（部屋数にだけ依存する）。部屋は2列のタイルで、1タイルの高さは見出し・信号・内訳の3行に収める

### 3.2 部署ルーム（`/office?room={deptId}`）— 20 §3.4・26 §3.3 の統合

1. 部屋 id は `dept` の id そのもの。`/office?room=second-brain-harness` と `/office?dept=second-brain-harness` は同じ画面（`?dept=` は 26 §3.3 との互換のための別名）。「部署 未記載」の部屋 id は `unassigned`
2. 中身は 26 §3.3 の部署絞り込みと同じ（席・ブロック分け 勤務帯→手動→停止中・状態表示・矢印を描かない）。**部屋を「またぐ」概念は消える**（部屋＝部署なので）
3. 旧4部屋の id（`library` / `lab` / `market` / `studio`）は解決しない。指定されたら未知の部署と同じ扱い＝空状態＋全景への導線（26 §3.3-5）。リダイレクトや対応表を置かない
4. `room`（=`dept`）と `line` が同時に指定されたら `room` を優先（既存の `room > line` を保つ。21 §3.7-8 の3段優先順は2段になる）
5. ヘッダは §3.1-5 の見出し形＋内訳

### 3.3 会社案内シート（`/office?company=1`）— 26 §3.4 の増分

1. 部署の並びは §3.1-3 と同じ（`departments[].order` → 未知 → 部署 未記載）。26 §3.4-2「返却順で最初に現れた順」は `departments` が無いときのフォールバックに降格
2. 部署見出しは §3.1-5 の形（label 主・id 添え）。それ以外（1行の4項目・停止中の小見出し・タップ先・画像なし・鮮度警告）は 26 §3.4 のまま

### 3.4 変えないもの

- 社員カード（21 §3.2・26 §3.1）。所属部署の行は表示名が届けば label を添えるだけ
- ライン絞り込み（21 §3.7）。`line` は上下流のパイプライン軸として残る（26 §9）
- MY DESK の判定と件数（20 §3.3）
- 直近 run の状態表示（20 §3.2）・報告シート（21 §5）・鮮度警告（20 §6）

## 4. 設定値・確定値

- データ源・接続規則・生成の定期実行は 20 §4 と同一。cerebellum 側に**スキーマ・API を足さない**（`02-data-model.md`・`03-api.md` は無変更・Backend 作業ゼロ）
- **cerebellum リポジトリに部署の対応表・順序表・日本語ラベル表・部屋分類の正規表現を持たない**（21 §4・26 §4 の原則を全景にも適用する。本仕様はその最後の例外＝`roomOf` を消す仕様）
- `departments` の形は `{ id, label, order }[]`。`id` は `profile.dept` と同じ値域（正本の8部署 id）、`label` は正本の部署名、`order` は正本の編成表の並び（1始まりの整数）。画面は値を検査しない・翻訳しない
- 「部署 未記載」の部屋 id は `unassigned`（`dept` の値域と衝突しない予約語。second-brain 側でこの id を部署に使わない）
- 全景の部屋タイルは CSS のみ。20 §5 の部屋画像（4部屋分の装飾）は使わなくなる。**新しい部屋画像は作らない**（26 §7「画像の追加・差し替え」はスコープ外、を引き継ぐ）。`campus-floor.png`（全景背景）・`employee-station*.png`・`approval-folders.png` はそのまま使う

## 5. インターフェース

- 構成規約（`app → features → shared`・feature 間 import 禁止・barrel 経由）: [`07-web-foundation.md`](./07-web-foundation.md) §3
- `office.json` の取得は `features/office` の既存 `useOffice`。取得経路の重複実装をしない
- `features/office/lib/office.ts`: `OfficeRoomId` の固定4値と `OFFICE_ROOMS`・`roomOf` を廃止し、`office.json` から部屋一覧を導出する関数（`departments` と `employees[].profile.dept` から `{ id, label, order, employees }[]` を組む）に置き換える。部署ルームの中身は 26 §3.3 で作った部署絞り込みの部品を流用し、見た目を作り直さない
- `web/src/shared/api/types.ts` の `office.json` 型に `departments?: { id: string; label: string; order: number }[]` を足す（省略可。`03-api.md` は `office.json` を定義していないので追記しない。20 §2 の扱いを踏襲）
- 採用デザインの正本（20 §5 の全景スクリーンショット `cerebellum-office-my-desk-focus.png`）は4部屋前提なので、実装後に8部署の全景で撮り直して差し替える（実装単位3に含める）

## 6. エラー処理

| 状況 | 挙動 |
|---|---|
| `office.json` 取得失敗・鮮度切れ | 20 §6 と同一 |
| `departments` が無い | 見出しは id・並びは返却順（§3.1-4）。警告は出さない（second-brain 側の対応前の正常状態） |
| `departments` にあるが所属社員が0人の部署 | 部屋を出す（内訳「0名」）。正本にある部署が空なのは見せるべき事実 |
| `dept` が `departments` に無い値 | 未知の部署として id 見出しで出す（§3.1-3）。検査しない |
| `dept` が `null`・`profile` が無い | 「部署 未記載」の部屋（§3.1-2） |
| `?room=` に旧4部屋 id・未知 id | 空状態＋全景への導線（§3.2-3） |

## 7. スコープ外

- **MY DESK の件数を [`24`](./24-inbox.md) の `summary`（汎用口の open 件数）から取ること**。いまは直近 run の `note = "承認待ち"` だけを数えていて、汎用口に open 7件あっても「あなたの仕事: 0件」と出る（2026-09-03 実測）。本人の判断で据え置き。直すなら 25 の増分として別仕様
- script 社員（小垢ベンチ収集・フォロワー日次スナップショット・watchdog）を名簿に載せる経路。`SKILL.md` を持たないので `profile` ごと無く、本仕様では「部署 未記載」の部屋に入る。載せ方は second-brain 側の判断（26 §9 末尾と同じ）
- 職種・縮退方針・runtime・model の表示（26 §7 のまま）
- 新しい部屋画像・アイソメ画像の作成（§4）
- 部署ルーム内の席の並び替え・グループ分けの変更（21 §3.4 のまま）

## 8. 関連仕様

- 土台: [`20-web-office.md`](./20-web-office.md)（全景・部屋・席・直近 run。**§3.1-3 の分類規則と §3.1-6 の viewport 条件を本仕様が置き換える**）／[`21-web-office-roster.md`](./21-web-office-roster.md)（社員カード・ライン絞り込み）／[`26-web-office-company.md`](./26-web-office-company.md)（部署絞り込み・会社案内。**§3.3-6「全景に部署導線を増やさない」・§3.4-6「全景の構図を変えない」・§7「部屋分類規則の変更はスコープ外」を本仕様が取り消す**）
- 契約の正本（second-brain 側）: Vault `85_定義/ハーネス組織.md`「編成表」節（8部署 id と並び・日本語名）／組織図 `85_定義/図/ハーネス組織図.html` 表1
- 名簿の運び手: `~/workspace/office-view/build_office.py`（launchd 10分ごと。`dept` の値域検査を既に持つ）

## 9. `office.json` スキーマへの提案（second-brain 側へ）

**トップレベルに `departments` を足す**（`{ id, label, order }[]`）。値の正本は Vault `85_定義/ハーネス組織.md` の編成表で、`build_office.py` が持っている8部署 id の値域表に `label` と `order` を添えて出力する形。cerebellum に表を持たない原則（21 §4）はこれで守られる。

- 例: `[{ "id": "second-brain-harness", "label": "記憶整備", "order": 1 }, { "id": "x-harness", "label": "X運用", "order": 2 }, … { "id": "engineering", "label": "技術", "order": 8 }]`
- `id` は `profile.dept` と同じ値域。`unassigned` は画面側の予約語なので使わない
- 届くまで画面は id 見出し・返却順で出す（§3.1-4）。**画面側で表を持って先回りしない**
- あわせて（本仕様の必須ではない）script 社員に `dept` を付ける経路があれば「部署 未記載」の部屋は空になり消える。正本の編成表では小垢ベンチ収集・フォロワー日次スナップショットは x-harness、watchdog は engineering

## 10. 他仕様への追記（confirmed 時に反映）

`AGENTS.md` ルール9 に従い、承認まで確定済みファイルを書き換えずに保留する5点:

1. [`00-overview.md`](./00-overview.md) §3 の索引に 27 の行を追加。Phase 2.0 の記述の「オフィスへの会社案内追補（26）」の後に「全景の部署化（[27](./27-web-office-departments.md)）」を併記する（Phase を増やさない。Frontend 増分・スキーマと API は無変更）
2. [`20-web-office.md`](./20-web-office.md) §3.1-3（4部屋の分類規則）と §3.1-6（viewport 条件）に「→ 27 §3.1 で置き換え」を注記。§5 の部屋画像の記述に「27 以降は全景背景のみ使用」を注記
3. [`21-web-office-roster.md`](./21-web-office-roster.md) §3.7-8 の優先順 `room → line → dept` を `room（=dept）→ line` に改める
4. [`26-web-office-company.md`](./26-web-office-company.md) §3.3-6・§3.4-6・§7 の「全景の4部屋を変えない／部屋分類の変更はスコープ外」に「→ 27 で取り消し」を注記。§3.4-2 の並び規則に「`departments` があればその順（27 §3.3-1）」を注記
5. `AGENTS.md` ルール7 の Phase 1.8 の行に 27 を併記する

## 実装単位

- [ ] [Frontend] 全景の部屋を `dept` で切る（§3.1）— `roomOf`・固定4部屋の廃止、部署 未記載の部屋、`departments` による見出しと並び（無ければ id・返却順）
  - 受け入れ基準: E2E（`web/e2e/<task-id>.spec.ts`・office.json はフィクスチャを配信して :48310 実サーバに依存しない）で、`departments` 付きフィクスチャで8部屋が `order` 順に出て見出しが label 主・id 添えになる・`departments` 無しフィクスチャで見出しが id・並びが返却順になり警告が出ない・`dept:null` と `profile` 無しの社員が末尾「部署 未記載」に入り該当0人ならその部屋が出ない・`departments` にあって所属0人の部署が「0名」で出る・未知の `dept` 値が `departments` の後に id 見出しで出る・skill 名が `market` や `post` を含む社員が旧規則の部屋に振られない（`dept` だけで決まる）・部屋の信号と文言が 20 §3.1-4 のまま・最上部2行と MY DESK が変わっていない・390px で最初の viewport に最上部2行・MY DESK・先頭4部屋が入り、社員数を倍にしても全景の高さが変わらないことを検証。`make verify` PASS
- [ ] [Frontend] 部署ルームの統合（§3.2）— `?room={deptId}` と `?dept=` の同一化、旧4部屋 id の空状態、`room > line` の2段優先
  - 受け入れ基準: E2E で、全景の部屋タップで `/office?room={deptId}` に入り 26 §3.3 と同じ席・ブロック分け・状態表示で所属社員だけが出る・`/office?dept={id}` が同じ画面になる・`/office?room=unassigned` に部署 未記載の社員が出る・`library` / `lab` / `market` / `studio` と未知 id で空状態＋全景への導線が出る（リダイレクトしない）・`room` と `line` 同時指定で `room` が勝つ・ヘッダが label 主・id 添え＋内訳になることを検証。`make verify` PASS
- [ ] [Frontend] 会社案内の並びと見出し（§3.3）＋デザイン正本の差し替え（§5）
  - 受け入れ基準: E2E で、`departments` 付きフィクスチャで会社案内の部署が `order` 順・label 主の見出しで出る・無しフィクスチャで 26 §3.4-2 の返却順・id 見出しに戻る・部署 未記載が末尾に残る・社員1行の4項目・停止中小見出し・タップ先・`img` 無し・鮮度警告が 26 のまま変わらないことを検証。`docs/design/screenshots/cerebellum-office-my-desk-focus.png` を8部署の全景で撮り直して差し替え、20 §5 の参照はファイル名を変えずに済ませる。`make verify` PASS
