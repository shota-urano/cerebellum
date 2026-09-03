'use client';

import { DayHeader, DayTasks } from '@/features/day';
import {
  InboxSummaryStrip,
  hasInboxAlert,
  missingSources,
  shiftRosterOf,
  useInboxSummary,
} from '@/features/inbox';
import { LearningTodayLine } from '@/features/learning';
import { useOffice } from '@/features/office';

/**
 * 「今日」画面（docs/specs/08 ＋ docs/specs/25-web-inbox.md §3.1 の3枠。
 * **並びの正本は docs/specs/30-web-today-order.md §3.1**）。
 *
 * cerebellum に載っているものは3種類ある——**人間だけの日課**・**学習**・
 * **AI からの「確認してください」**（docs/specs/24-inbox.md §1）。データの入れ物は3つのままで、
 * **まとめるのは人間が毎朝見るこの1枚だけ**。開けば今日やることが全部ある状態にする。
 *
 * 上から **計器盤 → WAITING → LEARNING → TASKS**（30 §3.1）。開いた瞬間に見えるのを
 * 「AI からの確認待ち」にする——2026-09-03 に本人が判断（同 §1）。計器盤だけは最上部に残す:
 * 赤点は WAITING の異常の合図で、TASKS と一緒に最下段へ下げると合図がスクロールの先に隠れて
 * 機能を失う。ALL CLEAR と空状態は日課の一覧に対する状態表示なので `DayTasks` の中＝
 * **TASKS の直上**に出る（同 §3.1）。
 *
 * 並べるのは app 層の仕事（25 §5）。3つの feature（day / learning / inbox）と名簿（office）を
 * ここで合成することで、**feature 間 import をゼロに保つ**（AGENTS.md ルール5）。
 * day feature を `DayHeader` / `DayTasks` の2つで受けるのは、間に他の枠を挟むため（30 §5）。
 * 2つは同じ `useDay('today')` を引くが、SWR が同一キーの取得を束ねるので**取得は1回**（同 §4）。
 *
 * 名簿・受信の取得をこの層で行う理由は2つ:
 * - 未着判定（25 §3.3）は「名簿 × 勤務帯 × 受信」の突合で、名簿の取得口は office feature が持つ
 * - 計器盤の赤点（25 §3.1）と WAITING の件数は**同じ集計**を読む。ここで1回引いて両方へ渡す
 */
export default function TodayPage() {
  const { office, error: officeError } = useOffice();
  const { summary, summaryError } = useInboxSummary();

  // 未着は「今日届くべき」と言い切れるものだけ（25 §3.3）。名簿が読めなければ判定を諦める
  const missing = missingSources(shiftRosterOf(office), summary?.sources);
  // 赤点は WAITING の異常だけ（25 §3.1）。LEARNING の未着・日課の残りは含めない
  const alert = hasInboxAlert(summary?.sources, missing);

  return (
    <main>
      <DayHeader date="today" alert={alert} />
      <InboxSummaryStrip
        sources={summary?.sources}
        missing={missing}
        rosterUnavailable={Boolean(officeError)}
        error={summaryError}
      />
      <LearningTodayLine />
      <DayTasks date="today" />
    </main>
  );
}
