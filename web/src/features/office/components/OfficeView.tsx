'use client';

import { useEffect, useState } from 'react';
import { ErrorBanner } from '@/shared/ui';
import { useOffice } from '../hooks/useOffice';
import { isOfficeRoomId, lastRunOf, localDate, splitByEnabled, staleHours } from '../lib/office';
import { OfficeCompanyView } from './OfficeCompanyView';
import { OfficeDeskSheet } from './OfficeDeskSheet';
import { OfficeEmployeeSheet } from './OfficeEmployeeSheet';
import { OfficeOverview } from './OfficeOverview';
import { OfficeReportSheet } from './OfficeReportSheet';
import { OfficeRoomView, type OfficeFloorScope } from './OfficeRoomView';

function Skeleton() {
  return (
    <div className="of2__skeleton" aria-busy="true" aria-live="polite">
      <div className="of3__headline">
        {Array.from({ length: 2 }, (_, i) => <span className="skel" key={i}>&nbsp;</span>)}
      </div>
      <div className="skel of3__skeleton-floor">&nbsp;</div>
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
export function OfficeView({
  runId,
  roomId,
  deskOpen,
  employeeId,
  lineId,
  deptId,
  companyOpen,
}: {
  runId: string | null;
  roomId: string | null;
  deskOpen: boolean;
  employeeId: string | null;
  lineId: string | null;
  deptId: string | null;
  /** 会社案内（docs/specs/26-web-office-company.md §3.4）。全景の代わりに出す1枚 */
  companyOpen: boolean;
}) {
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
  const selectedRoomId = isOfficeRoomId(roomId) ? roomId : null;
  const selectedRun = runId === null ? undefined : runs.find((run) => run.run_id === runId);
  const selectedEmployee = selectedRun
    ? employees.find((employee) => employee.automation_id === selectedRun.automation_id)
    : undefined;

  // 名簿は在籍状態と独立に読める（停止中社員も開ける・21 §3.1-6）ので employees 全体から引く
  const cardEmployee =
    employeeId === null ? undefined : employees.find((employee) => employee.automation_id === employeeId);
  const cardRun = cardEmployee ? lastRunOf(runs, cardEmployee.automation_id) : undefined;
  // `room`・`line`・`dept` が同時に来たら `room` → `line` → `dept` の優先順
  // （部屋が主・ラインと部署が従。URL を多軸で解釈しない・21 §3.7-7・26 §3.3-4）
  const scope: OfficeFloorScope | null = selectedRoomId
    ? { kind: 'room', roomId: selectedRoomId }
    : lineId !== null
      ? { kind: 'line', lineId }
      : deptId !== null
        ? { kind: 'dept', deptId }
        : null;
  const roomHref =
    scope === null
      ? '/office'
      : scope.kind === 'room'
        ? `/office?room=${scope.roomId}`
        : scope.kind === 'line'
          ? `/office?line=${encodeURIComponent(scope.lineId)}`
          : `/office?dept=${encodeURIComponent(scope.deptId)}`;
  // 報告シートの戻り先は、社員カード経由で来たときだけカードへ返す（21 §3.1-4）。
  // `?run=` 単独・MY DESK 経由の既存 deep link の戻り先は 20 §3.5-4 のまま変えない。
  const cardHref =
    employeeId === null
      ? null
      : `${roomHref}${roomHref.includes('?') ? '&' : '?'}employee=${encodeURIComponent(employeeId)}`;

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
      ) : scope !== null ? (
        // 部屋・ライン・部署のフロア。会社案内は絞り込みの軸ではないので優先順の外に置き、
        // 絞り込みが指定されていないときだけ全景の代わりに出す（26 §3.4-6）
        <OfficeRoomView
          scope={scope}
          employees={onDuty}
          runs={runs}
          stopped={stopped}
          today={localDate(now)}
          selectedRunId={runId}
          selectedEmployeeId={employeeId}
        />
      ) : companyOpen ? (
        // 停止中も含めた全員を渡す。部署の並びは返却順で決まる（26 §3.4-2）
        <OfficeCompanyView employees={employees} />
      ) : (
        <OfficeOverview
          employees={onDuty}
          runs={runs}
          stoppedCount={stopped.length}
          today={localDate(now)}
        />
      )}

      {deskOpen && <OfficeDeskSheet employees={onDuty} runs={runs} />}

      {/* シートは常に1枚。`run` と `employee` が同時に来たら報告を優先する（21 §3.1-4） */}
      {runId !== null ? (
        <OfficeReportSheet
          key={runId}
          employee={selectedEmployee}
          run={selectedRun}
          requestedRunId={runId}
          returnHref={cardHref ?? (scope !== null ? roomHref : deskOpen ? '/office?desk=1' : '/office')}
        />
      ) : (
        employeeId !== null && (
          <OfficeEmployeeSheet
            key={employeeId}
            employee={cardEmployee}
            run={cardRun}
            requestedId={employeeId}
            today={localDate(now)}
            returnHref={roomHref}
            employees={employees}
            scopeHref={roomHref}
            reportHref={
              cardRun
                ? `${cardHref}&run=${encodeURIComponent(cardRun.run_id)}`
                : null
            }
          />
        )
      )}
    </>
  );
}
