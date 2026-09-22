---
status: confirmed
confirmed_rev: 2164be0
---

# 31. 学習レーンの複線化（本線＋英語の2枠）

**親**: [`00-overview.md`](./00-overview.md) ｜ **担当**: Backend（§3.1〜3.3）＋ Frontend（§3.4〜3.5） ｜ **範囲**: `domain/learning.rs`・`usecase/manage_learning.rs`・`infra/api`（`/api/learning`）・`app/learning/page.tsx`・`features/learning/`

## 1. 目的

学習を **1日1セット**から **1日1レーン1セット**に広げる。本人が「英語は恒久的に1枠確保して毎日やりたい」と決めた（2026-09-22）ことが要件。

現状は `learning_sets` の主キーが `date` 単独（[`02-data-model.md`](./02-data-model.md) §2）なので、同じ日に2セット目を POST すると1セット目を UPSERT で上書きする（[`14-learning.md`](./14-learning.md) §3.2-3）。**リポジトリを分けても、曜日で分けても解けない**（前者は同じ API に同じ日付で当たるだけ、後者は本線の進みが恒久的に半減する）。主キーにレーンを足すのが唯一の筋。

生成の責務は変わらない。cerebellum は受け取って保存し、返して、成績を預かるだけ（[`14`](./14-learning.md) §1 の分界を維持）。

## 2. 入出力

- **入力**: `POST /api/learning/sets`（body に `lane` を追加。省略時 `main`）
- **出力**: `GET /api/learning/sets/{date}?lane={lane}`（省略時 `main`）
- **成績**: `POST` / `GET /api/learning/sets/{date}/result?lane={lane}`（同上）
- **依存ポート**: `LearningRepository`（レーン込みの読み書き）・`Clock`

## 3. 処理詳細

### 3.1 lane の語彙

- `lane` は **`main` | `en` の2値固定**。未知の値は `bad_request`
- **省略時は `main`**。これにより sharpen の現行 `study-set` は**無改修のまま**本線レーンに書き続ける（後方互換）
- 語彙を自由文字列にしない。`detail_ref`（[`02`](./02-data-model.md) §6）と同じ姿勢で、増やすときは本仕様を改訂する。自由文字列にすると送信側のタイポが静かに新レーンを作り、画面に出ない学習セットが生まれる

### 3.2 スキーマ（migration v8）

`learning_sets` / `learning_results` の主キーを `(date, lane)` に変える。SQLite は主キー変更にテーブル再作成が要るので、新テーブル作成 → 既存行を `lane = 'main'` でコピー → 旧テーブル削除 → リネームの順で行う。

```sql
CREATE TABLE learning_sets (
  date        TEXT NOT NULL,        -- "YYYY-MM-DD"（ローカルタイム）
  lane        TEXT NOT NULL,        -- "main" | "en"
  raw         TEXT NOT NULL,        -- 14 §3.1 のセット JSON をそのまま保持
  received_at TEXT NOT NULL,
  PRIMARY KEY (date, lane)
);

CREATE TABLE learning_results (
  date         TEXT NOT NULL,
  lane         TEXT NOT NULL,
  grades       TEXT NOT NULL,
  feeling      TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  PRIMARY KEY (date, lane)
);
```

- 既存行は全て `lane = 'main'` になる（学習は 2026-07-29 以降の本線1本しか無いため、これで過去の記録の意味は変わらない）
- 移行は値を保持する再作成であって、[`AGENTS.md`](../../AGENTS.md) ルール3（確定済み `task_days` の不変性）の対象ではない。学習セットは UPSERT 前提の生成物

### 3.3 API

| メソッド | パス | 変更点 |
|---|---|---|
| POST | `/api/learning/sets` | body に `lane`（任意・省略時 `main`）。同じ `(date, lane)` は UPSERT |
| GET | `/api/learning/sets/{date}` | クエリ `?lane={lane}`（省略時 `main`）。そのレーンのセットが無ければ 404 |
| POST | `/api/learning/sets/{date}/result` | クエリ `?lane={lane}`（同上）。`grades[].no` は**そのレーンのセット**と突き合わせる |
| GET | `/api/learning/sets/{date}/result` | クエリ `?lane={lane}`（同上）。無ければ 404 |

- 検証順は「`date` → `lane` → body」。`lane` 語彙外は body を見る前に `bad_request`
- 404 の意味はレーンごとに独立する。本線が届いていて英語が届いていない日は、英語だけ 404（[`14`](./14-learning.md) §6 の表はレーン単位で読む）
- その他の検証則（256KiB・必須欠落・`no` 重複・自動採点フィールド）は [`14`](./14-learning.md) §3.2・[`03-api.md`](./03-api.md) §3 のまま変更しない

### 3.4 学習セッションビュー（`/learning`）

- 経路に `lane` を足す: `/learning?date=YYYY-MM-DD&lane=en&taskId=...`（`lane` 省略時は `main`）
- 見出しは `今日の学習 — {theme}` のまま。**レーン名を見出しに足さない**——`theme` は送信側が付けており（例「英語 Day 1: 技術記事の読解」）、二重に名乗ると画面が冗長になる
- 4段ステッパー・自動採点・感想の一本道（[`15-web-learning.md`](./15-web-learning.md) §3）はレーンによらず同一。**レーンごとに別の画面や別の体験を作らない**
- 完了時の `POST .../result` は開いているレーンに送る。タスク消し込み（`POST /api/days/today/checks/{taskId}`）は従来どおり `taskId` があるときだけ叩く
- 「見えるのは今日の1セットだけ」（[`15`](./15-web-learning.md) §1 当日集中モデル）は維持する。**レーン切り替えタブを画面内に置かない**——在庫を見せない原則を崩さないため、移動は「今日」画面の LEARNING 段を経由する

### 3.5 「今日」画面の LEARNING 段

- LEARNING 段を**レーンごとに1行**（`main` → `en` の固定順・最大2行）にする。並びの正は [`30-web-today-order.md`](./30-web-today-order.md) §3.1 のまま（計器盤 → WAITING → LEARNING → TASKS）
- 各行の状態判定・文言・異常様式は [`25-web-inbox.md`](./25-web-inbox.md) §3.1 第2段のまま（`未着` / `未回答` / `済 ○x △y ×z`）。**セットの 404 を先に見る**規則もそのまま
- 行の頭にレーン名を出す（`本線` / `英語`）。**表示名は画面が持つ**（サーバは `main` / `en` しか知らない）
- 学習の未着・未決を計器盤の赤点に含めない（[`25`](./25-web-inbox.md) §3.1）——**2行になっても変えない**。常時点灯すると合図が死ぬ
- タップ先は `/learning?lane={lane}`

### 3.6 `problems` の件数上限を 60 へ引き上げる

英語レーン（sharpen `docs/英語レーン.md`）の語彙パートは、忘却曲線で復習期限が来た語を**その日に全部出す**設計で、定常状態で1日およそ50語になる。文法3問と合わせて1セット最大53問。現行の上限 1〜10件（[`14-learning.md`](./14-learning.md) §3.1・[`03-api.md`](./03-api.md) §3・`server/src/domain/learning.rs`）では受理できない。

- **上限を `1..=60` に変える**。下限・その他の検証則（`no` 重複・256KiB・自動採点フィールド）は変えない
- 上限を上げるのは**受理側の話だけ**で、本線が10問を超えて生成してよいという意味ではない。生成側の分量は各レーンの契約（`docs/学習テーマ.md` / `docs/英語レーン.md`）が縛る
- 画面は**1問1カードのまま**（[`15-web-learning.md`](./15-web-learning.md) §3.2）。53問で問題段が縦に長くなるのは許容する。語彙ドリル用の詰めた表示・「次の未回答へ」のジャンプは作らない——[`15`](./15-web-learning.md) §1 の一本道を壊さないため。必要になったら別仕様で足す
- 採点段は自動採点が最初から grade を埋めるので（[`15`](./15-web-learning.md) §3.3）、問題数が増えてもタップ数は増えない。**「全問に grade が揃うまで感想へ進めない」規則はそのまま**

## 4. 送信側の責務（sharpen `study-set`・本仕様の範囲外だが契約として明記）

- レーンごとに生成して `lane` 付きで送る。`lane` を付けない送信は `main` として受理される（移行期間の後方互換）
- **未着手スキップ・持ち越しの判定はレーン別に行う**（`GET .../result?lane=` で判定する）。本線が未着手でも英語は生成してよい。現行 `status.sh` は日付単位なので改修が要る
- 生成規約（全問 quiz・`answerType` 必須・自己完結）はレーンによらず同じ（`PROMPT.md`）
- **`selftest.sh` / `deliver.sh` の `problems は1〜10件` 検査も 60 に合わせる**（送信前検査が受理側より厳しいままだと英語セットが配送前に落ちる）

## 5. インターフェース（実装時に他仕様へ追記するもの）

- [`02-data-model.md`](./02-data-model.md) §2: `learning_sets` / `learning_results` の定義を §3.2 の形に置換。§5 の migration 表に `| 8 | learning_sets / learning_results の主キーを (date, lane) に変更（本仕様。2026-09-22） |` を追加
- [`03-api.md`](./03-api.md): §2 の表の学習4行に `?lane=` を追記、§3 DTO の `POST /api/learning/sets` body に `"lane": "main"` を追加（省略可のコメント付き）
- [`14-learning.md`](./14-learning.md): §3.2-3 の「同じ date は UPSERT」を「同じ `(date, lane)` は UPSERT」に改め、本仕様への参照を足す
- [`15-web-learning.md`](./15-web-learning.md) §2: 経路に `lane` を追記
- [`25-web-inbox.md`](./25-web-inbox.md) §3.1: 第2段を「レーンごとに1行」に改め、本仕様への参照を足す
- [`00-overview.md`](./00-overview.md) §3: 索引に本仕様を追加

## 6. エラー処理

| 事象 | 応答 |
|---|---|
| `lane` が語彙外（`main` / `en` 以外） | 400 `bad_request`（`unknown lane: {value}`） |
| そのレーンのセット未取り込みの GET | 404 `not_found`（画面は当該行を `未着` にする） |
| そのレーンのセット未取り込みへの result POST | 404 `not_found` |
| そのレーンの result 未記録の GET | 404 `not_found`（送信側は「未着手」と解釈） |

## 7. スコープ外

- 3レーン目以降（増やすときは §3.1 の語彙を改訂する）
- レーンごとの画面・体験の作り分け（§3.4）
- 過去セットの一覧・レーン横断の成績集計（当日集中モデルのまま）
- 英語レーンの中身（到達目標・出題形式）——sharpen `docs/学習テーマ.md` の責務

## 8. 関連仕様

- 学習の取り込み・成績: [`14-learning.md`](./14-learning.md)
- 画面: [`15-web-learning.md`](./15-web-learning.md)・[`25-web-inbox.md`](./25-web-inbox.md) §3.1・[`30-web-today-order.md`](./30-web-today-order.md)

## 実装単位

- [ ] [Backend] migration v8: `learning_sets` / `learning_results` の主キーを `(date, lane)` へ（テーブル再作成・既存行は `lane='main'`）。[`02-data-model.md`](./02-data-model.md) §2・§5 への追記とセット
  - 受け入れ基準: 既存 DB（`user_version=7`）に migration が適用でき、移行前の全行が `lane='main'` で読めるテストが通る。再適用が冪等。`make verify` PASS
- [ ] [Backend] 取り込み・取得 API のレーン対応（`POST /api/learning/sets` の body `lane`・`GET /api/learning/sets/{date}?lane=`）。[`03-api.md`](./03-api.md)・[`14-learning.md`](./14-learning.md) への追記とセット
  - 受け入れ基準: ①`lane` 省略が `main` として受理される ②同じ date に `main` と `en` を送って**両方が独立に残る**（相互に上書きしない） ③同じ `(date, lane)` の再送が UPSERT ④語彙外 lane が `bad_request` ⑤未取り込みレーンの GET が 404 のテストが通る。`make verify` PASS
- [ ] [Backend] 成績 API のレーン対応（`POST` / `GET /api/learning/sets/{date}/result?lane=`）
  - 受け入れ基準: ①`grades[].no` が**同じレーンのセット**と突き合わされる（他レーンの `no` は `bad_request`） ②`main` と `en` の result が独立に UPSERT できる ③未記録レーンの GET が 404 のテストが通る。`make verify` PASS
- [ ] [Backend] `problems` の件数上限を `1..=60` に引き上げる（§3.6）。[`14-learning.md`](./14-learning.md) §3.1・[`03-api.md`](./03-api.md) §3 への追記とセット
  - 受け入れ基準: ①53問のセットが受理される ②61問が `bad_request` ③0問が `bad_request`（下限は据え置き） ④既存の10問以下のテストが無改修で PASS。`make verify` PASS
- [ ] [Frontend] 学習セッションビューのレーン対応（`/learning?lane=`・result 送信先）。[`15-web-learning.md`](./15-web-learning.md) §2 への追記とセット
  - 受け入れ基準: E2E（`web/e2e/<task-id>.spec.ts`）で ①`/learning?lane=en` が英語セットを描く ②`lane` 省略で本線が描かれる（既存 E2E が無改修で PASS） ③完了時の result が開いているレーンに送られる ④レーン切り替えタブが画面内に無いことを検証。`make verify` PASS
- [ ] [Frontend] 「今日」画面の LEARNING 段を2行に（`本線` / `英語`・固定順・状態判定は据え置き）。[`25-web-inbox.md`](./25-web-inbox.md) §3.1 への追記とセット
  - 受け入れ基準: E2E で ①LEARNING が `本線` → `英語` の順で2行出る ②各行が `未着` / `未回答` / `済 ○x △y ×z` を独立に出す ③行のタップが `/learning?lane={lane}` へ遷移する ④学習の未着が計器盤の赤点に**含まれない** ⑤`/` の段の並び（計器盤 → WAITING → LEARNING → TASKS）が無変更（[`30`](./30-web-today-order.md) の既存 E2E が無改修で PASS）を検証。`make verify` PASS
