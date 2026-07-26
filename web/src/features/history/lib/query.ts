import { shiftDate } from '@/shared/lib';

/**
 * `?date=` の値が実在する `YYYY-MM-DD` か（docs/specs/09 §6 の 400 相当を手前で弾く）。
 * `2026-02-31` のように繰り上がる日付は不正として扱う。
 */
export function isValidDateParam(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return shiftDate(value, 0) === value;
}
