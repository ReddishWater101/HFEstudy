import { usePerformanceTimer } from '../lib/timer';

export function TimerBar({
  durationSec,
  onComplete,
}: {
  durationSec: number;
  onComplete: () => void;
}) {
  const { remainingSec } = usePerformanceTimer(durationSec, onComplete);
  const mm = Math.floor(remainingSec / 60);
  const ss = Math.floor(remainingSec % 60);
  const display = `${mm}:${ss.toString().padStart(2, '0')}`;
  return (
    <div className="text-xs uppercase tracking-widest tabular-nums text-neutral-400">
      {display}
    </div>
  );
}
