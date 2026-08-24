'use client';

import { useSearchParams } from 'next/navigation';
import { OfficeView } from '@/features/office';

export function OfficeScreen() {
  const runId = useSearchParams().get('run');
  return (
    <main className="office-page">
      <OfficeView runId={runId} />
    </main>
  );
}
