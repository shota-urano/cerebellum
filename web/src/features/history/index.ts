/**
 * history feature の公開 API（barrel）。外部からは必ずこのファイル経由で import する。
 *
 * 中身（components: DateNav / SummaryCard、hooks: useSummary）は
 * `docs/specs/09-web-history.md` の実装タスクで追加する。
 *
 * 依存ルール（docs/specs/07 §3）: features 間 import 禁止。
 * タスク一覧は day feature を import せず `app/history/page.tsx` で合成する。
 */
export {};
