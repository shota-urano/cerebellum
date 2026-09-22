# ERRORS

## 2026-08-10: 履歴結果の挿入後、物理キーボード入力が式の先頭へ入る

- 失敗: 計算履歴の結果ボタンを押した直後はフォーカスがボタンに残り、入力欄へ `type` するとカーソルが先頭へ移った
- 成功: state 更新後に回答欄へ focus し、`setSelectionRange` で式末尾へカーソルを置く。E2E は履歴結果をタップ後、入力欄の focus と物理キーボードでの継続入力を検証する

## 2026-08-10: Codex サンドボックス内の Turbopack build が port bind で失敗する

- 失敗: `make verify` の `next build --turbopack` が `creating new process → binding to a port → Operation not permitted` で停止した
- 成功: 同じ `make verify` をサンドボックス外で再実行する。コードや期待値は変更しない

## 2026-09-22: 学習レーン API（cerebellum-8p5.2）の検証

- 失敗: 新規 worktree の `make verify` が `tsc: command not found` で停止した
- 成功: `web/` で `npm ci`（キャッシュも worktree 内）を実行して依存を導入し、同じ検証を再実行した
- 失敗: 語彙外 lane のエラーが既存の共通変換で `bad request: unknown lane: english` となり、仕様31の文言検証が失敗した
- 成功: 学習セットのキー検証に限定して理由文字列を直接 API エラーへ変換し、Rust テスト161件が成功した
- 失敗: E2E の Chromium 起動が `MachPortRendezvousServer: Permission denied (1100)` で停止した
- 成功: `make verify` をサンドボックス外で実行すると Chromium が起動し、release バイナリ＋使い捨てDBで検証できた。Makefile・期待値は変更しない
