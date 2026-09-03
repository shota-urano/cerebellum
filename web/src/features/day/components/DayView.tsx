'use client';

import { DayHeader } from './DayHeader';
import { DayTasks } from './DayTasks';

export type DayViewProps = {
  /** `GET /api/days/{date}` の `{date}`。`today` または `YYYY-MM-DD`（docs/specs/03 §2） */
  date: string;
  /**
   * 読み取り専用モード（docs/specs/09 §3）。トグルを無効化し、計器盤ヘッダの代わりに
   * 「読み取り専用」バッジを出す。サーバーが `readonly: true` を返した日も同じ扱いになる。
   */
  readonly?: boolean;
  /**
   * WAITING（AI からの確認待ち）に異常があるか（docs/specs/25-web-inbox.md §3.1）。
   * 計器盤の右端に赤点を出すだけで、**進捗・ALL CLEAR の判定には入らない**
   * （日課の完了と AI 側の異常は別の話・同 §3.1）。判定は inbox feature が持ち、
   * ここへ渡すのは `app/page.tsx`（features 間 import を作らないため・同 §5）。
   */
  alert?: boolean;
};

/**
 * その日のヘッダ＋タスク一覧を続けて描く合成（docs/specs/08）。
 *
 * 中身は `DayHeader`（エラーバナー・計器盤ヘッダ）と `DayTasks`（ALL CLEAR・空状態・TASKS）へ
 * 割ってあり（docs/specs/30-web-today-order.md §5）、ここは**2つを順に描くだけの薄い合成**。
 * 間に何も挟まない画面——過去日（`/history`・docs/specs/09 §3）——はこのまま使う。
 * 「今日」は2つの間に WAITING・LEARNING が入るので `app/page.tsx` が2つを直接並べる
 * （同 §3.1。並べるのは app 層の仕事・docs/specs/25 §5）。
 */
export function DayView({ date, readonly = false, alert = false }: DayViewProps) {
  return (
    <>
      <DayHeader date={date} readonly={readonly} alert={alert} />
      <DayTasks date={date} readonly={readonly} />
    </>
  );
}
