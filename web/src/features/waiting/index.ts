/**
 * waiting feature の公開 API（barrel）。外部からは必ずこのファイル経由で import する。
 *
 * 依存ルール（docs/specs/07-web-foundation.md §3）: features 間 import 禁止。
 * 承認は intake 自身の API（`/api/intake/candidates/{id}/decision`）で完結するので、
 * day feature との合成は要らない（ハーネス承認と同じ形）。
 */
export { WaitingView } from './components/WaitingView';
