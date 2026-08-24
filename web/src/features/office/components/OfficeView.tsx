'use client';

import { useEffect, useState } from 'react';
import { ErrorBanner } from '@/shared/ui';
import { useOffice } from '../hooks/useOffice';
import { localDate, splitByEnabled, staleHours } from '../lib/office';
import { OfficeFloor } from './OfficeFloor';
import { OfficeReportSheet } from './OfficeReportSheet';

function Skeleton() {
  return (
    <div className="of2__skeleton" aria-busy="true" aria-live="polite">
      <div className="of2__summary">
        {Array.from({ length: 3 }, (_, i) => <span className="skel" key={i}>&nbsp;</span>)}
      </div>
      <div className="of2__floor">
        <div className="of2__grid">
          {Array.from({ length: 4 }, (_, i) => (
            <div className="of2__station of2__station--idle" key={i}>
              <span className="skel of2__skeleton-name">&nbsp;</span>
              <span className="skel of2__skeleton-desk">&nbsp;</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * 「オフィス」画面本体（docs/specs/20-web-office.md §3）。
 * 無人稼働している automation を社員として2Dフロアへ配置し、勤務時間・状態・報告を出す。
 * データ源は :48310 の office.json（cerebellum のサーバーは経由しない・§2）。
 *
 * **マウント後に描画を確定させる**（`mounted`）。この画面は
 * (1) 取得先の解決に `window.location` が必要（:48310 の base・§4）で、
 * (2) 当日判定と鮮度判定に端末時計を使う（サーバー由来の日付が無い画面）。
 * `output: 'export'` はビルド時に HTML を焼くので、そのまま描くとビルド時の描画と
 * 閲覧時の描画が食い違い hydration error #418 になる（ビルド日の日付が焼かれる）。
 * `suppressHydrationWarning` で黙らせると初回描画がビルド日のままになるので使わない。
 */
export function OfficeView({ runId }: { runId: string | null }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // マウント前は取得もしない（ビルド時の描画＝スケルトンで固定する）
  const { office, ready, error, isLoading } = useOffice(mounted);

  if (!mounted) return <Skeleton />;
  if (error) return <ErrorBanner message={error.message} />;
  if (!ready || !office) return isLoading ? <Skeleton /> : null;

  const employees = office.employees ?? [];
  const runs = office.runs ?? [];
  // 端末時計を使う（サーバー由来の日付が無い画面。lib の localDate のコメント参照）
  const now = new Date();
  const stale = staleHours(office.generated_at, now.getTime());
  const { onDuty, stopped } = splitByEnabled(employees);
  const selectedRun = runId === null ? undefined : runs.find((run) => run.run_id === runId);
  const selectedEmployee = selectedRun
    ? employees.find((employee) => employee.automation_id === selectedRun.automation_id)
    : undefined;

  return (
    <>
      {stale !== null && (
        // 生成の停止に気付けるようにする。エラーにはしない（§6）
        <div className="dg__warn of__stale">
          <span className="mono banner__tag">!</span>
          <p className="dg__text">データが {stale} 時間前のものです</p>
        </div>
      )}

      {employees.length === 0 ? (
        <div className="empty">登録されている automation がありません</div>
      ) : (
        <OfficeFloor
          employees={onDuty}
          runs={runs}
          stopped={stopped}
          today={localDate(now)}
          selectedRunId={runId}
        />
      )}

      {runId !== null && (
        <OfficeReportSheet
          key={runId}
          employee={selectedEmployee}
          run={selectedRun}
          requestedRunId={runId}
        />
      )}
    </>
  );
}
