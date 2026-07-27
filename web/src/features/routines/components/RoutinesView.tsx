'use client';

import { useState } from 'react';
import type { ApiError, RoutineDto, RoutineInput } from '@/shared/api';
import { ErrorBanner } from '@/shared/ui';
import { useRoutineMutations } from '../hooks/useRoutineMutations';
import { useRoutines } from '../hooks/useRoutines';
import { RoutineForm } from './RoutineForm';
import { RoutineRow } from './RoutineRow';
import { RoutinesSkeleton } from './RoutinesSkeleton';

/** 編集中の対象。`'new'` は新規追加、`RoutineDto` は既存行の編集、`null` は一覧表示 */
type Editing = RoutineDto | 'new' | null;

/**
 * サーバーエラーの出し分け（docs/specs/10-web-routines.md §6）。
 * フォーム内に出すもの（入力に起因）だけ文言を返し、それ以外は null（＝バナー行き）。
 */
function formMessage(error: ApiError): string | null {
  switch (error.code) {
    case 'bad_request':
      return error.message;
    case 'conflict':
      return '同じ内容のルーティンが既にあります';
    case 'not_found':
      return 'このルーティンは既に削除されています';
    default:
      return null;
  }
}

/**
 * 「ルーティン」画面の本体（docs/specs/10-web-routines.md）。
 * マスタの一覧・追加・編集・削除。スナップショットには触らない。
 */
export function RoutinesView() {
  const { routines, error, isLoading, mutate } = useRoutines();
  const { create, update, remove, pending } = useRoutineMutations(mutate);
  const [editing, setEditing] = useState<Editing>(null);
  const [formError, setFormError] = useState<string | undefined>(undefined);
  const [bannerError, setBannerError] = useState<ApiError | null>(null);

  const openForm = (target: Editing) => {
    setEditing(target);
    setFormError(undefined);
    setBannerError(null);
  };

  // 成功なら一覧へ戻り、失敗ならフォーム内表示かバナーへ振り分ける
  const settle = async (action: Promise<ApiError | null>) => {
    const failure = await action;
    if (!failure) {
      openForm(null);
      return;
    }
    const message = formMessage(failure);
    if (message === null) {
      setBannerError(failure);
      return;
    }
    setFormError(message);
    if (failure.code === 'not_found') void mutate();
  };

  const banner = bannerError ?? error;

  return (
    <>
      {/* 当日は確定済みで変わらない（docs/specs/02-data-model.md §4）。ここを黙ると毎回踏む */}
      <div className="notice">
        <span className="mono notice__tag">NOTE</span>
        <span className="notice__text">変更は明日の分から反映されます（今日のタスクは確定済みのため変わりません）</span>
      </div>

      {/* 文言はサーバーの message をそのまま出す（docs/specs/07-web-foundation.md §6） */}
      {banner && <ErrorBanner message={banner.message} />}

      {editing !== null ? (
        <RoutineForm
          routine={editing === 'new' ? undefined : editing}
          serverError={formError}
          pending={pending}
          onSubmit={(input: RoutineInput) =>
            void settle(editing === 'new' ? create(input) : update(editing.id, input))
          }
          onDelete={editing === 'new' ? undefined : () => void settle(remove(editing.id))}
          onCancel={() => openForm(null)}
        />
      ) : (
        <>
          <div className="rt__head">
            <span className="mono label">ROUTINES {routines ? routines.length : ''}</span>
            <button type="button" className="mono btn btn--primary" onClick={() => openForm('new')}>
              ＋ 追加
            </button>
          </div>

          {!routines ? (
            // 取得前。エラーで一度も取れていないときはバナーだけ（永久スケルトンにしない）
            isLoading || !error ? <RoutinesSkeleton /> : null
          ) : routines.length === 0 ? (
            <div className="empty">ルーティンがありません。「＋ 追加」から登録してください</div>
          ) : (
            <div className="panel stack" style={{ overflow: 'hidden' }}>
              {routines.map((routine) => (
                <RoutineRow key={routine.id} routine={routine} onSelect={openForm} />
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
