import type { InboxSourceSummaryDto } from '@/shared/api';
import { localToday } from './item';

/**
 * 未着の判定（docs/specs/25-web-inbox.md §3.3）。
 *
 * **サーバは受信の事実しか持たない**（docs/specs/24-inbox.md §3.5）。「今日届いているべきなのに
 * 届いていない」は名簿（office.json の `shift` と `profile.review`）と `summary` の突合でしか出せず、
 * それは画面の責務としてここに置かれている。**判定の対象は §3.3 の3条件だけ**——
 * `review.cadence = "shift"` ／ `shift` が今日 due（`days` の曜日と `hour:minute`）／
 * `summary` に今日の `latestDate` を持つ `source` が無い。ここから外へ広げない。
 *
 * このファイルは I/O を持たない（取得は `hooks/`）。office feature の型は import しない
 * ——features 間 import 禁止（AGENTS.md ルール5）なので**構造だけで受け**、合成は app 層が行う
 * （docs/specs/25-web-inbox.md §5。`rosterOf()` と同じ方式）。
 */

/** `getDay()` の 0=日 に合わせた曜日の1文字（office.json の `shift.days` の表記） */
const WEEKDAY_CHARS = ['日', '月', '火', '水', '木', '金', '土'];

/** 未着判定に使う名簿の1行（`source` = office.json の `employees[].skill`） */
export interface InboxShiftEntry {
  source: string;
  /** 表示名（office.json の `employees[].name`） */
  name: string;
  /** 勤務帯のラベル（生成側で組み済み。例 `毎日 06:20`） */
  label: string;
  hour: number;
  minute: number;
  /** `毎日` | `平日` | `週末` | `月・水` … 生成側の表記そのまま */
  days: string;
}

/** 画面に出す未着の1行（`未着: {name}（{label} 予定）`・§3.3-3） */
export interface InboxMissingSource {
  source: string;
  name: string;
  label: string;
}

/**
 * office.json から「勤務帯どおりに毎回届くべき送信元」を取る（§3.3-1）。
 *
 * 取れないときは `undefined` を返し、画面は**未着判定そのものを諦める**（§3.3 末尾）
 * ——名簿が読めていない状態で「全員が未着」を出すと、判定の意味が反転する。
 *
 * 対象外にするもの:
 * - `cadence: "adhoc"` と `review` を持たない社員（§3.3 末尾で明示）
 * - `skill` が `null` の社員（`source` と突き合わせる鍵が無い。名前を捏造しない・20 §2）
 * - `cadence: "shift"` だが `shift` が `null` の社員（いつ届くべきかが名簿に無い。
 *   `shift:null` を勤務帯として補完しない・21 §3.3-1）
 */
export function shiftRosterOf(
  office:
    | {
        employees: {
          skill: string | null;
          name: string;
          shift: { hour: number; minute: number; days: string; label: string } | null;
          profile?: { review?: { cadence?: string | null } | null } | null;
        }[];
      }
    | undefined,
): InboxShiftEntry[] | undefined {
  if (!office) return undefined;
  return office.employees.flatMap((employee) => {
    if (employee.profile?.review?.cadence !== 'shift') return [];
    if (!employee.skill || !employee.shift) return [];
    const { hour, minute, days, label } = employee.shift;
    return [{ source: employee.skill, name: employee.name, label, hour, minute, days }];
  });
}

/**
 * その勤務帯が今日 due か（§3.3-2「`days` と曜日で判定」）。
 *
 * **既知の表記でないときは `undefined`（＝due と断定しない）**。未着は「今日届くべき」と
 * 言い切れるときだけ出す表示で、読めない `days` を毎日 due と見なすと消えない未着が
 * 出続けて人間が画面を信じなくなる（docs/specs/20-web-office.md §3.6 の「全員緑」の裏返し）。
 */
export function isShiftDueToday(entry: InboxShiftEntry, now: Date): boolean | undefined {
  const days = entry.days.trim();
  const day = now.getDay();
  if (days === '毎日') return true;
  if (days === '平日') return day >= 1 && day <= 5;
  if (days === '週末') return day === 0 || day === 6;
  const listed = days.split('・').map((value) => value.trim());
  if (listed.every((value) => WEEKDAY_CHARS.includes(value))) {
    return listed.includes(WEEKDAY_CHARS[day]);
  }
  return undefined;
}

/** 勤務開始の `hour:minute` を過ぎたか（§3.3-2）。時刻前は「まだ来ていない」だけで未着ではない */
function isPastShiftTime(entry: InboxShiftEntry, now: Date): boolean {
  return now.getHours() * 60 + now.getMinutes() >= entry.hour * 60 + entry.minute;
}

/**
 * 未着の送信元（§3.3）。名簿と `summary` の突合結果で、**押す操作は持たない**
 * （受信が来れば消える）。
 *
 * `summary` が取れていない（`undefined`）ときは何も出さない——受信の事実が分からない段で
 * 未着とは言えない。日付境界は深夜0時・ローカルタイム（`localToday()`）。
 */
export function missingSources(
  shiftRoster: InboxShiftEntry[] | undefined,
  sources: InboxSourceSummaryDto[] | undefined,
  now: Date = new Date(),
): InboxMissingSource[] {
  if (!shiftRoster || !sources) return [];
  const today = localToday(now);
  // 「今日の受信がある」の根拠は `latestDate`（0件の受信も受信・docs/specs/24-inbox.md §3.5）
  const receivedToday = new Set(
    sources.filter((source) => source.latestDate === today).map((source) => source.source),
  );
  return shiftRoster
    .filter((entry) => isShiftDueToday(entry, now) === true)
    .filter((entry) => isPastShiftTime(entry, now))
    .filter((entry) => !receivedToday.has(entry.source))
    .map(({ source, name, label }) => ({ source, name, label }));
}
