/**
 * 日付ユーティリティ。
 *
 * 「今日」の日付は端末時計ではなく**サーバー由来**（`GET /api/days/today` の
 * `date`。docs/specs/03-api.md §3）を使う。ここに TODAY 定数は置かない。
 */

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

function toUTC(iso: string, offsetDays = 0) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + offsetDays));
}

/** 'YYYY-MM-DD（曜）' 表記。TZ に依存しないよう UTC で算出する。 */
export function formatDate(iso: string) {
  return iso + '（' + WEEKDAYS[toUTC(iso).getUTCDay()] + '）';
}

/** n 日ずらした ISO 日付を返す。 */
export function shiftDate(iso: string, n: number) {
  const d = toUTC(iso, n);
  const p = (v: number) => String(v).padStart(2, '0');
  return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate());
}

/**
 * `?date=` の値が実在する `YYYY-MM-DD` か（docs/specs/09 §6・docs/specs/29-web-inbox-history.md §6
 * の 400 相当を手前で弾く）。`2026-02-31` のように繰り上がる日付は不正として扱う。
 *
 * 「履歴」（docs/specs/09 §3）と「あなた待ち」（同 29 §3.3）の2画面が同じ判定を要る。
 * `features/history/lib/query.ts` から移設した——feature 間 import は禁止で（AGENTS.md ルール5・
 * docs/specs/07-web-foundation.md §3）、`DateNav` を `shared/ui` へ移した理由（29 §3.3）と同じ。
 */
export function isValidDateParam(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return shiftDate(value, 0) === value;
}
