'use client';

import { DayView } from '@/features/day';
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
 * 「今日」画面（docs/specs/08 ＋ docs/specs/25-web-inbox.md §3.1 の3段構成）。
 *
 * cerebellum に載っているものは3種類ある——**人間だけの日課**・**学習**・
 * **AI からの「確認してください」**（docs/specs/24-inbox.md §1）。データの入れ物は3つのままで、
 * **まとめるのは人間が毎朝見るこの1枚だけ**。上から TASKS → LEARNING → WAITING の順に並べ、
 * 開けば今日やることが全部ある状態にする。
 *
 * 並べるのは app 層の仕事（同 §5）。3つの feature（day / learning / inbox）と名簿（office）を
 * ここで合成することで、**feature 間 import をゼロに保つ**（AGENTS.md ルール5）。
 * 第1段のファーストビューを侵食しないよう、2段目以降は TaskList の下に置く（同 §3.1）。
 *
 * 名簿・受信の取得をこの層で行う理由は2つ:
 * - 未着判定（§3.3）は「名簿 × 勤務帯 × 受信」の突合で、名簿の取得口は office feature が持つ
 * - 第1段の赤点（§3.1）と第3段の件数は**同じ集計**を読む。ここで1回引いて両方へ渡す
 */
export default function TodayPage() {
  const { office, error: officeError } = useOffice();
  const { summary, summaryError } = useInboxSummary();

  // 未着は「今日届くべき」と言い切れるものだけ（§3.3）。名簿が読めなければ判定を諦める
  const missing = missingSources(shiftRosterOf(office), summary?.sources);
  // 赤点は第3段の異常だけ（§3.1）。第2段（学習）の未着・日課の残りは含めない
  const alert = hasInboxAlert(summary?.sources, missing);

  return (
    <main>
      <DayView date="today" alert={alert} />
      <LearningTodayLine />
      <InboxSummaryStrip
        sources={summary?.sources}
        missing={missing}
        rosterUnavailable={Boolean(officeError)}
        error={summaryError}
      />
    </main>
  );
}
