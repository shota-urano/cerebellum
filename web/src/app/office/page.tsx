import { OfficeView } from '@/features/office';

/**
 * 「オフィス」画面（docs/specs/20-web-office.md）。automation の勤務帯と直近の報告。
 * app 層は feature を置くだけ（ロジックを持たない・docs/specs/07-web-foundation.md §3）。
 *
 * `?run=` の run 詳細とドロワー項目の追加は docs/specs/20 の別の実装単位。
 */
export default function OfficePage() {
  return (
    <main>
      <OfficeView />
    </main>
  );
}
