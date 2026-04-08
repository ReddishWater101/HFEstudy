import { useEffect, useRef } from 'react';

const FLUSH_INTERVAL_MS = 250;

export function useEventLogger(): {
  log: (event: SessionEvent) => void;
  flush: () => void;
} {
  const queueRef = useRef<SessionEvent[]>([]);
  const flushingRef = useRef<Promise<void>>(Promise.resolve());

  const flush = (): void => {
    const batch = queueRef.current;
    if (batch.length === 0) return;
    queueRef.current = [];
    flushingRef.current = flushingRef.current.then(async () => {
      for (const ev of batch) {
        await window.api.logEvent(ev);
      }
    });
  };

  useEffect(() => {
    const id = window.setInterval(flush, FLUSH_INTERVAL_MS);
    return () => {
      window.clearInterval(id);
      flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const log = (event: SessionEvent): void => {
    queueRef.current.push(event);
  };

  return { log, flush };
}
