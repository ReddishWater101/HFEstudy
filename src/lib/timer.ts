import { useEffect, useState } from 'react';

export function usePerformanceTimer(
  durationSec: number,
  onComplete: () => void,
): { elapsedSec: number; remainingSec: number } {
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    const start = performance.now();
    let rafId = 0;
    let done = false;

    const tick = (): void => {
      const elapsed = (performance.now() - start) / 1000;
      setElapsedSec(elapsed);
      if (elapsed >= durationSec) {
        if (!done) {
          done = true;
          onComplete();
        }
        return;
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [durationSec]);

  return {
    elapsedSec,
    remainingSec: Math.max(0, durationSec - elapsedSec),
  };
}
