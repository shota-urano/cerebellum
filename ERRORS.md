# ERRORS

## 2026-08-10: 履歴結果の挿入後、物理キーボード入力が式の先頭へ入る

- 失敗: 計算履歴の結果ボタンを押した直後はフォーカスがボタンに残り、入力欄へ `type` するとカーソルが先頭へ移った
- 成功: state 更新後に回答欄へ focus し、`setSelectionRange` で式末尾へカーソルを置く。E2E は履歴結果をタップ後、入力欄の focus と物理キーボードでの継続入力を検証する

## 2026-08-10: Codex サンドボックス内の Turbopack build が port bind で失敗する

- 失敗: `make verify` の `next build --turbopack` が `creating new process → binding to a port → Operation not permitted` で停止した
- 成功: 同じ `make verify` をサンドボックス外で再実行する。コードや期待値は変更しない
