'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { DayView } from '@/features/day';
import { InvalidDate, WeekSummary, useSummary, useToday } from '@/features/history';
import type { ApiError } from '@/shared/api';
import { isValidDateParam, shiftDate } from '@/shared/lib';
import { DateNav, ErrorBanner } from '@/shared/ui';

/**
 * 「履歴」画面の合成（docs/specs/09）。app 層が day / history の両 feature を並べる
 * （history が day を import しない。docs/specs/07 §3）。
 * 組み立て順は `docs/design/03-history.md`「レイアウト構造」に従う。
 */
export function HistoryScreen() {
  const router = useRouter();
  const dateParam = useSearchParams().get('date');
  // history 側の2つのデータ源。ここがエラー表示の集約点（下の historyError）
  const { today, error: todayError } = useToday();
  const { error: summaryError } = useSummary();

  if (dateParam !== null && !isValidDateParam(dateParam)) {
    return (
      <main>
        <InvalidDate />
      </main>
    );
  }

  // date 省略時は今日（docs/specs/09 §3）。「今日」はサーバー由来なので取得までは null。
  const iso = dateParam ?? today ?? null;
  const canNext = iso !== null && today !== undefined && iso < today;
  const goto = (date: string) => router.push('/history?date=' + date);

  /*
   * history 側のエラーを1枚のバナーに集約する（docs/specs/09 §6）。
   *
   * - `todayError`（`/api/days/today`）も対象に含める。これが落ちると翌日ナビの判定と
   *   7日サマリの日付列が組めず機能が欠ける。落ちること自体は構造上避けられないので、
   *   無言に欠落させずバナーで理由を出す。
   * - `todayError` と `summaryError` は通信断・サーバー障害で同時に落ちるのが普通。同一原因を並べても
   *   情報が増えないので、history 側のバナーは常に最大1枚にする。
   * - date 省略時は DayView も同じキー（`/api/days/today`）を取るので、その失敗は DayView が
   *   自前のバナーで既に出している。同一原因ならここでは出さない
   *   （DayView 内部のバナーは day feature の責務で、ここからは抑制できない）。
   */
  const shownByDayView = dateParam === null ? todayError : undefined;
  const historyError = [todayError, summaryError].find(
    (error): error is ApiError =>
      error !== undefined &&
      (shownByDayView === undefined || error.code !== shownByDayView.code || error.message !== shownByDayView.message),
  );

  return (
    <main>
      {/* 文言はサーバーの message をそのまま出す（docs/specs/07 §6） */}
      {historyError && <ErrorBanner message={historyError.message} />}

      <DateNav
        iso={iso}
        canNext={canNext}
        onPrev={() => iso !== null && goto(shiftDate(iso, -1))}
        onNext={() => canNext && iso !== null && goto(shiftDate(iso, 1))}
      />

      {/*
        今日だけトグル可（docs/specs/09 §3）。
        「今日」が未取得のうちは readonly を主張しない（false を渡す）。DayView は
        `readonly || day.readonly === true` で判定し、`day.readonly` は当日のみ false
        （docs/specs/03 §3）なので、確証が無いときはサーバーの DTO に委ねるのが正しい。
        ここで true を渡すと、`/api/days/today` だけが落ちている当日を読み取り専用と偽る
        （ロード中スケルトンの見た目が一瞬変わるのは許容する）。
      */}
      <DayView date={dateParam ?? 'today'} readonly={today !== undefined && iso !== today} />

      <WeekSummary selected={iso} onSelect={goto} />
    </main>
  );
}
