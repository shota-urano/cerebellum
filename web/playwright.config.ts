import path from 'node:path';

import { defineConfig } from '@playwright/test';

// harness-kit E2E設定テンプレ（templates/web/playwright）を cerebellum 構成へ合わせたもの。
//
// このプロジェクトの本番形は「Rust 単一バイナリが web の静的 export を配信」（docs/specs/01 §7）
// なので、E2E も **next dev ではなく release バイナリ**に対して回す。next dev は /api を
// localhost:48210（＝常駐している本番プロセス）へ rewrites するため、dev サーバで E2E を
// 回すと本番 DB を書き換えてしまう——テストが本番を壊す経路を作らない。
//
// 前提: `server/target/release/cerebellum` がビルド済みであること。
// ルート Makefile が web verify（build → web/out）→ server verify（rust-embed 取り込み）の
// 後に e2e を呼ぶ順序で担保する（web/verify の中では順序を満たせない）。

// ポート契約（false-pass / false-gate 対策。テンプレのコメントを継承）:
// - reuseExistingServer は必ず false。true だと別の場所で動いている古いコードの
//   サーバに対してテストが通ってしまう（false-pass）
// - その代わりポートは E2E_PORT で外から割り当て可能にする。dev-loop は worktree ごとに
//   別ポートを渡すので、並列実行や残留プロセスとの衝突で落ちない（false-gate 回避）
// - 既定 48219 は本番 48210 / dev 48211 / preview 48212 のいずれとも衝突しない値
const PORT = Number(process.env.E2E_PORT ?? 48219);

const SERVER_BIN = path.resolve(__dirname, '../server/target/release/cerebellum');
// 使い捨ての空 DB（起動時に migration が走る）。test-results/ は gitignore 対象。
// 本番 DB（~/Library/Application Support/cerebellum/cerebellum.db）には絶対に触らない。
const E2E_DB = path.resolve(__dirname, 'test-results/e2e.db');

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results', // 動画・トレースの出力先。make artifacts がここから回収する
  fullyParallel: true,
  retries: 0, // flaky を retry で隠さない（Default-FAIL）
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    // 合格時も録画する（失敗時だけではない）。夜勤ビューアで人間が「動いているところ」を
    // 見るための素材。verify の PASS/FAIL は「壊れていない」ことしか示さず、「意図した画面に
    // なっているか」は人間が見るしかない——そこを毎回ラリーで確認するのが認知負荷の実体だった
    // （2026-07-27）。録画は test-results/ に出て gitignore 対象・PR には入らない。
    video: { mode: 'on', size: { width: 390, height: 844 } }, // iPhone 相当（このアプリはモバイル前提）
  },
  webServer: {
    // 毎回 DB を捨ててから起動する（前回の消し込みが残ると期待値がぶれる）。
    // exec でシェルを置き換え、Playwright の停止シグナルがバイナリへ届くようにする。
    command: `sh -c 'mkdir -p "$(dirname "${E2E_DB}")" && rm -f "${E2E_DB}" && CEREBELLUM_DB="${E2E_DB}" exec "${SERVER_BIN}" serve --port ${PORT}'`,
    port: PORT,
    reuseExistingServer: false,
  },
});
