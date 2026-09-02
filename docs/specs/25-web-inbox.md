---
status: confirmed
confirmed_rev: 575ee52
---

# 25. 「今日」の3種集約と「あなた待ち」汎用画面仕様（Frontend）

**親**: [`00-overview.md`](./00-overview.md) ｜ **担当**: Frontend ｜ **範囲**: `app/page.tsx`（「今日」の増分）・`app/waiting/page.tsx`・`features/inbox/`（旧 `features/waiting/` を作り替え）・ドロワー項目の整理

## 1. 目的

cerebellum に載っているものは3種類ある。**人間だけの日課**（[`08`](./08-web-today.md)）、**学習**（AI が出題・人間が解く・機械が採点。[`15`](./15-web-learning.md)）、**AI からの「確認してください」**（[`24`](./24-inbox.md)）。分け方の基準は「誰が作り、誰がこなし、結果を誰が読むか」で、3つとも違うのでデータの入れ物は3つのまま持つ。

まとめるのは**人間が毎朝見る画面1枚だけ**。「今日」を開けば、今日の日課・今日の学習・AI からの確認待ちが上から順に並び、cerebellum を1回開けば今日やることが全部ある状態にする。確認待ちの中身は「あなた待ち」画面1枚で種類を問わず片付ける。ハーネスごとの専用画面（`/harness`・旧 `/waiting`）は作らない・残さない。

## 2. 入出力

- **今日（集約）**: `GET /api/days/today`（既存）＋ `GET /api/learning/sets/today` と `.../result`（既存）＋ `GET /api/inbox/summary`（[`24`](./24-inbox.md)）＋ `office.json`（[`20`](./20-web-office.md) §2 と同じ取得経路）
- **あなた待ち**: `GET /api/inbox/items?status=open`／`GET /api/inbox/items?applyState=failed`
- **決定**: `POST /api/inbox/items/{id}/decision`
- DTO は [`03-api.md`](./03-api.md) §3 を正とする

## 3. 処理詳細

### 3.1 「今日」画面の3段構成

既存の ProgressHeader と TaskList（[`08`](./08-web-today.md) §3）はそのまま第1段とし、下に2段を足す。**第1段のファーストビューを侵食しない**（2段目以降はスクロールして見えてよい）。

| 段 | 見出し | 中身 | タップ先 |
|---|---|---|---|
| 1 | TASKS | 今日の日課（既存・無変更） | 行トグル（既存） |
| 2 | LEARNING | 今日の学習セットの状態1行。`未着`（`receivedAt: null`）／`未回答`（セットあり・result なし）／`済 ○x △y ×z`（result あり）。未着は異常様式 | `/learning` |
| 3 | WAITING | 確認待ちの件数を kind 別に4つ並べる（`⚠ 異常 n`・`承認 n`・`選択 n`・`読む n`。0 は薄く出す）。その下に**未着の送信元**（§3.3）を1行ずつ異常様式で | `/waiting`（kind でフィルタした状態で開く） |

- 第2段・第3段は既存の `detail_ref` 導線（[`02`](./02-data-model.md) §6）を置き換えるものではない。日課の行に `learning.session` / `inbox.items` を結び付ける運用はそのまま使える
- 第3段の異常（`alert` の未決・未着送信元・`applyState=failed`）が1件でもあれば、ProgressHeader の右端に赤い点を出す（ALL CLEAR の判定には含めない。日課の完了と AI 側の異常は別の話）

### 3.2 「あなた待ち」画面（`/waiting`・汎用）

見出しは `あなた待ち`。`panel dg` 様式（[`18`](./18-web-harness.md)・[`23`](./23-web-waiting.md) と同じ）。

**並び**: kind でグループ → グループ内は送信元 → 送信元内は受信順。順序は `alert` → `approve` → `choose` → `read`（急ぐものから）。未決0件のグループは見出しごと省く。

**グループ見出しの直下に、そこで押すと何が起きるかを1行で書く**（[`18`](./18-web-harness.md) §3.2・[`23`](./23-web-waiting.md) §3.1 と同じ原則）。文言は kind で固定し、送信元ごとの文言は持たない:

| kind | 見出し | 直下の1行 | 行の操作 |
|---|---|---|---|
| `alert` | ⚠ 異常 | 確認した印を付けるだけ。直すのは人間 | 「確認」1ボタン → `acknowledged` |
| `approve` | ✅ 承認 | ✅した行だけを、その係が次の勤務で適用する | ✅／❌ の2ボタン → `approved`／`rejected` |
| `choose` | ☑ 選択 | 選んだ1つを、その係が次の勤務で使う | `options` をラジオで並べ、選択で `chosen`。❌ で `rejected` |
| `read` | 📄 読む | 読んだ印を付けるだけ | 「読んだ」1ボタン → `read` |

**行の中身**: 送信元の表示名（名簿の `name`。名簿に無ければ `source` をそのまま等幅で）・`title`・業務日（今日でなければ小さく添える）。`bodyMd` があれば行タップで展開（markdown 描画・`refPath` は等幅で表示のみ・リンクにしない）。

**取り消し**: 決定済みの行は同じ画面の下部「今日決めたもの」に畳んで残し、タップで `open` に戻せる（誤タップの救済路。[`17`](./17-harness-approval.md) §3.3-1 と同じ。`apply_state ≠ pending` になった行は戻せず、その旨を出す）。

**失敗枠**: `applyState=failed` の行を最上部に「未処理の失敗」として日をまたいで出し続ける（[`18`](./18-web-harness.md) §3.3 と同じ）。`apply_error` を等幅で全文表示。

### 3.3 未着の判定（名簿との突合・画面の責務）

サーバは受信の事実しか持たない（[`24`](./24-inbox.md) §3.5）。「今日届いているべきなのに届いていない」は**画面が名簿と突き合わせて出す**。

1. `office.json` の `employees[]` から `profile.review.cadence = "shift"` の社員を取る
2. その社員の `shift` が今日 due なら（`days` と曜日で判定。`hour:minute` を過ぎているかも見る）、`summary` に今日の `latestDate` を持つ `source` が**無い**とき未着
3. 未着は「今日」第3段と「あなた待ち」最上部に `未着: {name}（{shift.label} 予定）` として異常様式で出す。**押す操作は無い**（受信が来れば消える）

`cadence: adhoc` の社員と `review` を持たない社員は未着判定の対象外。**watchdog 自身の未着**もこの経路で見える（watchdog に `review: {kinds:[alert], cadence: shift}` を書かせる。[`24`](./24-inbox.md) §9）。

`office.json` が取れないとき（:48310 停止）は未着判定を諦め、その旨を1行で出す（エラーバナーにしない。受信済みの項目は普通に出す）。

### 3.4 名簿未登録の送信元

`summary` にあって名簿に無い `source` は、行の送信元名を `source` の等幅表示にし、`名簿未登録` のバッジを添える。**受信は正常に扱う**（拒否しない）。バッジは「`SKILL.md` frontmatter に `office:` を書け」の催促であり、[`21`](./21-web-office-roster.md) §3.2-3 の「欠落は欠落として出す」と同じ考え。

### 3.5 ドロワーの整理（[`16`](./16-web-navigation.md) §3-3 の改訂）

- 「あなた待ち」（`/waiting`）は残す。バッジで未決の総件数を出す（0 は出さない）
- 「ハーネス」（`/harness`）は night-harness の移行完了（[`24`](./24-inbox.md) §8）と同時に削除する。それまでは残す
- 他の項目は無変更

## 4. 設定値・確定値

- kind の並び順（alert → approve → choose → read）と各 kind の文言（§3.2 表）は固定。送信元ごとの文言・専用コンポーネントを作らない（作った時点で専用画面の再発）
- 表示順はサーバ返却順（新しい順）。クライアントで再ソートしない（kind・送信元のグルーピングだけ行う）
- `expiresAt` 超過の行は既定で出ない（サーバ側で除外）。「期限切れも見る」トグルは持たない（Phase 2 で必要になったら足す）
- タップターゲット 44px 以上（[`07`](./07-web-foundation.md) §4）

## 5. インターフェース

- `features/inbox` は `index.ts` barrel で `InboxView`（一覧）・`InboxSummaryStrip`（「今日」第3段用）・`useInboxSummary` を公開する。`features/day` は `InboxSummaryStrip` と `features/learning` の状態1行コンポーネントを**barrel 経由で**使う（feature 間 import 禁止の規約は「app 層で組み合わせる」で守る。具体的には `app/page.tsx` が3段を並べ、`features/day` 自体は他 feature を import しない）
- `shared/api/types.ts` は [`03`](./03-api.md) §3 の inbox DTO と手動同期
- `office.json` の取得フックは `features/office` の既存 `useOffice` を barrel 経由で共用する（取得経路の重複実装をしない）

## 6. エラー処理

| 事象 | 表示 |
|---|---|
| `/api/inbox/*` 500・通信失敗 | ErrorBanner＋再検証待ち。描画済みの行は保持 |
| decision 400（適用済み行への取り消し等） | ロールバック＋理由をトースト |
| decision 404 | ロールバック＋再検証（他端末で置換された） |
| `office.json` 取得失敗 | 未着判定のみ諦める。1行で通知（§3.3） |
| 学習 API 失敗 | 第2段だけ `取得できません` 表示。他段は描く |

optimistic update と SWR `revalidateOnFocus` は [`08`](./08-web-today.md) §3 と同じ。

## 7. スコープ外

- 送信元ごとの専用画面・専用文言（本仕様の存在理由と矛盾する）
- 学習セッション本体の変更（[`15`](./15-web-learning.md) のまま）。第2段は状態1行と導線だけ
- 日課（第1段）の変更
- プッシュ通知（Phase 2）
- 過去日の項目閲覧・検索

## 8. 関連仕様

- 受け口: [`24-inbox.md`](./24-inbox.md)
- 置き換える先例: [`18-web-harness.md`](./18-web-harness.md)・[`23-web-waiting.md`](./23-web-waiting.md)（`superseded`）
- 名簿の形: [`20-web-office.md`](./20-web-office.md) §2・[`21-web-office-roster.md`](./21-web-office-roster.md)
- 今日画面の既存部分: [`08-web-today.md`](./08-web-today.md)

## 実装単位

- [ ] [Frontend] `features/inbox/`（旧 `features/waiting/` を作り替え）: 一覧・kind 別グループと固定文言・決定ボタン・取り消し・失敗枠・`bodyMd` 展開
  - 受け入れ基準: E2E で、4 kind が固定順で出る・未決0のグループが消える・approve の ✅/❌/取り消し・choose のラジオ選択が `chosen`＋`choice` を送る・alert の「確認」・read の「読んだ」・failed 行が最上部に日をまたいで出る・名簿未登録バッジが出ることを検証。`make verify` PASS
- [ ] [Frontend] 未着判定（§3.3）: `office.json` の `review.cadence=shift` × `shift` due × `summary` 突合
  - 受け入れ基準: E2E（office.json はフィクスチャ）で、due かつ未受信の送信元が未着として出る・adhoc は出ない・時刻前は出ない・office.json 取得失敗時は判定を諦めて1行通知することを検証。`make verify` PASS
- [ ] [Frontend] 「今日」の3段構成（§3.1）: LEARNING 状態1行・WAITING 件数4つ＋未着行・ヘッダの赤点
  - 受け入れ基準: E2E で、学習の未着/未回答/済の3状態・kind 別件数・未着行・赤点の有無（異常0件で消える）・第1段の ALL CLEAR が第3段の異常に影響されないことを検証。`make verify` PASS
- [ ] [Frontend] ドロワー: 「あなた待ち」に未決バッジ。「ハーネス」項目の削除は night-harness 移行完了時に別タスクで行う
  - 受け入れ基準: E2E でバッジの件数と 0 件非表示を検証。`make verify` PASS
