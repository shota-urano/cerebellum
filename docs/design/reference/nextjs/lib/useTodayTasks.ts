'use client';

import { useCallback, useEffect, useState } from 'react';
import { BASE_TASKS, type Task } from './data';
import { TODAY } from './date';

const KEY = 'routine:' + TODAY;

/** 今日の消し込み状態。localStorage に当日分だけ保存する。 */
export function useTodayTasks() {
  const [tasks, setTasks] = useState<Task[]>(() => BASE_TASKS.map((t) => ({ ...t })));

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (!raw) return;
      const doneIds: string[] = JSON.parse(raw);
      setTasks(BASE_TASKS.map((t) => ({ ...t, done: doneIds.includes(t.id) })));
    } catch {
      /* 読めなければ初期状態のまま */
    }
  }, []);

  const toggle = useCallback((id: string) => {
    setTasks((prev) => {
      const next = prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t));
      try {
        window.localStorage.setItem(KEY, JSON.stringify(next.filter((t) => t.done).map((t) => t.id)));
      } catch {
        /* 保存できなくても操作は通す */
      }
      return next;
    });
  }, []);

  return { tasks, toggle };
}
