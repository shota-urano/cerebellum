/**
 * digest feature の公開 API（barrel）。外部からは必ずこのファイル経由で import する。
 *
 * 依存ルール（docs/specs/07-web-foundation.md §3）: features 間 import 禁止。
 * 「読んだ」チェックは day feature のトグルを使うので、`app/digest/page.tsx` が
 * 両者を合成する（docs/specs/12-web-digest.md §5）。
 */
export { DigestView } from './components/DigestView';
export type { DigestViewProps } from './components/DigestView';
