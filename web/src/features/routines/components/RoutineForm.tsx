'use client';

import { useId, useState } from 'react';
import type { RoutineDto, RoutineInput } from '@/shared/api';
import {
  EMPTY_INPUT,
  INTERVAL_SUGGESTIONS,
  type FieldErrors,
  trimInput,
  validate,
} from '../lib/validate';

type Props = {
  /** 編集対象。未指定なら新規追加 */
  routine?: RoutineDto;
  /** サーバー由来のエラー（400 / 409 / 404）。フォーム内に出す */
  serverError?: string;
  pending: boolean;
  onSubmit: (input: RoutineInput) => void;
  onDelete?: () => void;
  onCancel: () => void;
};

const FIELDS: { name: keyof RoutineInput; label: string; placeholder: string }[] = [
  { name: 'interval', label: '間隔', placeholder: '毎日 / 平日 / 週末 / 月曜' },
  { name: 'time', label: '時刻', placeholder: '7:30（空でも可）' },
  { name: 'effort', label: '実施', placeholder: '1時間（空でも可）' },
  { name: 'tool', label: 'ツール', placeholder: 'slack | obsidian（空でも可）' },
  { name: 'content', label: '内容', placeholder: 'つながり発見' },
];

function toInput(routine?: RoutineDto): RoutineInput {
  if (!routine) return EMPTY_INPUT;
  const { interval, time, effort, tool, content } = routine;
  return { interval, time, effort, tool, content };
}

/**
 * 追加・編集フォーム（docs/specs/10-web-routines.md §3.2）。
 * 保存は全項目送信（部分更新はしない）。削除は確認を挟む（同 §3.3）。
 */
export function RoutineForm({ routine, serverError, pending, onSubmit, onDelete, onCancel }: Props) {
  const [values, setValues] = useState<RoutineInput>(() => toInput(routine));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const listId = useId();

  const submit = () => {
    const trimmed = trimInput(values);
    const found = validate(trimmed);
    setErrors(found);
    if (Object.keys(found).length === 0) onSubmit(trimmed);
  };

  return (
    <section className="panel form">
      <div className="mono label" style={{ marginBottom: 12 }}>
        {routine ? 'EDIT ROUTINE' : 'NEW ROUTINE'}
      </div>

      {serverError && <div className="form__error" style={{ marginBottom: 12 }}>{serverError}</div>}

      {FIELDS.map((field) => (
        <div className="form__row" key={field.name}>
          <label className="mono label">
            {field.label}
            <input
              className={'input' + (errors[field.name] ? ' input--invalid' : '')}
              value={values[field.name]}
              placeholder={field.placeholder}
              list={field.name === 'interval' ? listId : undefined}
              aria-invalid={errors[field.name] ? true : undefined}
              onChange={(event) =>
                setValues((prev) => ({ ...prev, [field.name]: event.target.value }))
              }
            />
          </label>
          {errors[field.name] && <div className="form__error">{errors[field.name]}</div>}
        </div>
      ))}

      {/* 間隔は自由入力を許しつつ候補を出す（判定は部分一致） */}
      <datalist id={listId}>
        {INTERVAL_SUGGESTIONS.map((value) => (
          <option value={value} key={value} />
        ))}
      </datalist>

      <div className="form__actions">
        <button type="button" className="mono btn btn--primary" onClick={submit} disabled={pending}>
          保存
        </button>
        <button type="button" className="mono btn" onClick={onCancel} disabled={pending}>
          キャンセル
        </button>
        {onDelete && (
          <>
            <span className="form__spacer" />
            <button
              type="button"
              className="mono btn btn--danger"
              onClick={() => setConfirmingDelete(true)}
              disabled={pending || confirmingDelete}
            >
              削除
            </button>
          </>
        )}
      </div>

      {confirmingDelete && onDelete && (
        <div className="confirm" role="alert">
          <span className="confirm__text">このルーティンを削除します。明日以降のタスクに出なくなります。</span>
          <button type="button" className="mono btn btn--danger" onClick={onDelete} disabled={pending}>
            削除する
          </button>
          <button
            type="button"
            className="mono btn"
            onClick={() => setConfirmingDelete(false)}
            disabled={pending}
          >
            やめる
          </button>
        </div>
      )}
    </section>
  );
}
