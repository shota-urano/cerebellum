# 13. 夜勤詳細ビュー仕様（画面）

**親**: [`00-overview.md`](./00-overview.md) ｜ **担当**: Frontend ｜ **範囲**: `app/nightshift/page.tsx`・`features/nightshift/`

## 1. 目的

タスク「夜間タスクの確認」をタップしたら、**その夜に回した1プロジェクト**の夜勤成果——本命は「PR リンク」と「検証動画」の2点——を cerebellum のデザインのまま確認し、「確認した」でタスクを消し込む。

night-shift は毎晩1プロジェクト（`80_運用ガイド/夜間シフト表.md`）。だからこの画面も**1夜1 run だけ**を出す。全 PJ・全実行の一覧は出さない（やってもいない PJ の情報はノイズ。一覧は夜勤ビューア :48310 の役割）。外部の夜勤ビューアへ直接飛ばすと見た目がガラッと変わるので、アプリ内ビューにする（2026-07-28 ユーザーフィードバック）。

## 2. 入出力

- **入力**: 夜勤ビューアの `GET http://{同一ホスト}:48310/runs.json`（night-shift `build-viewer.py` が生成、launchd 常駐サーバが CORS 全開放で配信）。タスク側の `detailRef = nightshift.report` は `GET /api/days/{date}` の DTO に含まれる
- **出力**: なし（表示のみ。消し込みは既存の `POST /api/days/today/checks/{taskId}`）
- **経路**: `/nightshift?date=YYYY-MM-DD&taskId=...`（date 省略時は今日）

cerebellum のサーバーは経由しない。`runs.json` の1件は viewer の `meta.json` と同形:
`{ pj, run_id, passed, failed, blocked, human, pr_url, videos[], artifact_missing, href }`（新しい順）。

## 3. 処理詳細

1. `today` の実日付は day API の返す `date` で解決する（run_id は `YYYY-MM-DD-n` 形式のため）
2. **その夜の run** ＝ `run_id` が対象日付で始まる最初の1件（一覧は新しい順なので同日複数でも最新が取れる）。無ければ「この夜の夜勤レポはありません（シフトなし、またはレポ未生成）」
3. 表示（ダイジェスト詳細と同じ `panel dg` 様式）:
   - 見出し: `夜勤レポ — {pj}` ＋ メタ行（run_id・完了/失敗/blocked）
   - **PR**: `pr_url` があれば `btn--primary` のリンク。無ければ warning 行（passed>0 なら「PR が出ていない」、passed=0 なら「close 0件」）
   - **検証動画**: `videos[]` を `<video controls playsinline>` でインライン再生（src は `{48310}/{href}media/{name}`。動画ファイルは viewer が配信し、cerebellum は複製しない）。0本かつ passed>0 なら warning 行
   - 末尾に「フル確認ページを開く」（受け入れ基準・スクショが要るときだけ踏む控えめリンク）
4. 読了動線: 画面下部の**「確認した」チェック**。押すと元タスクを消し込んで今日画面へ戻る（digest §3.2 と同じ。過去日 readonly では出さない）

## 4. 設定値・確定値

- ビューアのポート `48310` 固定。ホスト名は `window.location.hostname` を使う（localhost でも MagicDNS 名でも同じコードで届く。ハードコードしない）
- **https（Tailscale Serve 経由）のときは同一オリジンの path マウント `/loop-reports` を使う**（`tailscale serve --set-path /loop-reports http://127.0.0.1:48310` を設定済み）。https ページから `http://…:48310` を読むと混在コンテンツでブロックされ Failed to fetch になるため（2026-07-28 実測）。動画 src も同じ base を使うので一緒に解決される
- タブバーには追加しない（タスクからの詳細ビューという位置づけ。digest と同じ）
- warning の様式はダイジェストの `dg__warn` を流用（成果物欠落の判定基準は night-shift 側 `build-viewer.py` の `artifact_missing` と同一思想）

## 5. インターフェース

- 構成規約（`app → features → shared`・feature 間 import 禁止・barrel 経由): [`07-web-foundation.md`](./07-web-foundation.md) §3
- 「確認した」チェックは day feature のトグルを使う。**nightshift feature が day feature を import しない**——`app/nightshift/page.tsx` が両者を合成する（digest §5 と同じ構図）

## 6. エラー処理

| 状況 | 表示 |
|---|---|
| runs.json 取得失敗（viewer 停止・非 tailnet） | `ErrorBanner`（「夜勤ビューアに接続できません」） |
| その夜の run 無し | 空状態（エラーにしない。「シフトなし」は正常） |
| トグル失敗 | ロールバック＋`ErrorBanner`（今日画面と同じ） |

## 7. スコープ外

- 夜勤レポの生成・取り込み（生成は night-shift、配信は viewer。cerebellum は読むだけ）
- 過去 run の一覧・履歴（夜勤ビューア :48310 の役割）
- 受け入れ基準・スクショの再実装（フル確認ページへのリンクで足りる）

## 8. 関連仕様

- データ形の正本: `~/workspace/kit/develop/night-shift/scripts/build-viewer.py`（meta.json / runs.json）
- 語彙: [`02-data-model.md`](./02-data-model.md) §6 ／ 導線: [`12-web-digest.md`](./12-web-digest.md) §3.1
