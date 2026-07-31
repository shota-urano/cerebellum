/**
 * harness feature の公開 API（barrel）。外部からは必ずこのファイル経由で import する。
 *
 * 依存ルール（docs/specs/07-web-foundation.md §3）: features 間 import 禁止。
 * 承認は harness 自身の API（`/api/harness/proposals/{id}/decision`）で完結するので、
 * digest / nightshift と違い day feature との合成は要らない。
 */
export { HarnessView } from './components/HarnessView';
export type { HarnessViewProps } from './components/HarnessView';
