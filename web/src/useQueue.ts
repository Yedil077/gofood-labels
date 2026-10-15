import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import type { QueueInfo } from './types';

/** Опрос общей очереди печати. summary — только счётчик и статус агента (лёгкий запрос). */
export function useQueue(intervalMs = 5000, summary = false) {
  const [info, setInfo] = useState<QueueInfo | null>(null);
  const [error, setError] = useState(false);
  const alive = useRef(true);
  const load = useCallback(() => {
    api
      .queue(summary)
      .then((r: any) => {
        if (!alive.current) return;
        if (r?._status >= 400) return setError(true);
        setError(false);
        setInfo(r);
      })
      .catch(() => alive.current && setError(true));
  }, [summary]);
  useEffect(() => {
    alive.current = true;
    load();
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, intervalMs);
    return () => {
      alive.current = false;
      clearInterval(id);
    };
  }, [load, intervalMs]);
  return { info, error, reload: load };
}
