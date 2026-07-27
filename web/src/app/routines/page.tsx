import { RoutinesView } from '@/features/routines';

/** 「ルーティン」画面（docs/specs/10-web-routines.md）。app 層は feature を合成するだけ（docs/specs/07-web-foundation.md §3）。 */
export default function RoutinesPage() {
  return (
    <main>
      <RoutinesView />
    </main>
  );
}
