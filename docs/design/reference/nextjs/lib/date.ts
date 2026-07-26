/** プロトタイプの「今日」。実運用では new Date() から生成する。 */
export const TODAY = '2026-07-26';

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
