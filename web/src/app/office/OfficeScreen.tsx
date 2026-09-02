'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { OfficeView } from '@/features/office';

export function OfficeScreen() {
  const searchParams = useSearchParams();
  const runId = searchParams.get('run');
  const roomId = searchParams.get('room');
  const deskOpen = searchParams.get('desk') === '1';
  // 社員名簿（docs/specs/21-web-office-roster.md §3.1）とライン絞り込み（§3.7）
  const employeeId = searchParams.get('employee');
  const lineId = searchParams.get('line');

  // 同一ページ内のクエリ遷移ではブラウザが数pxの位置を保持することがある。
  // 部屋へ「入る」体験は必ず入口から始める（docs/specs/20-web-office.md §3.3）。
  useEffect(() => {
    if (roomId === null && lineId === null) return;
    window.scrollTo(0, 0);
    // Next.js のクエリ遷移後のスクロール復元より後でも入口を固定する。
    const frame = window.requestAnimationFrame(() => window.scrollTo(0, 0));
    return () => window.cancelAnimationFrame(frame);
  }, [roomId, lineId]);

  return (
    <main className="office-page">
      <OfficeView runId={runId} roomId={roomId} deskOpen={deskOpen} employeeId={employeeId} lineId={lineId} />
    </main>
  );
}
