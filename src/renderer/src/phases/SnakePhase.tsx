import { useEffect, useState } from 'react';
import { Layout } from '../components/Layout';
import { Snake } from '../components/Snake';
import { TimerBar } from '../components/TimerBar';
import { useDispatch } from '../state/SessionProvider';

export function SnakePhase() {
  const dispatch = useDispatch();
  const [durationSec, setDurationSec] = useState(120);

  useEffect(() => {
    void window.api.getConfig().then((cfg) => setDurationSec(cfg.snakeDurationSec));
  }, []);

  useEffect(() => {
    void window.api.logEvent({ type: 'snake.start', t: Date.now() });
    return () => {
      void window.api.logEvent({ type: 'snake.end', t: Date.now() });
    };
  }, []);

  function handleGameOver(finalScore: number) {
    void window.api.logEvent({ type: 'snake.gameover', t: Date.now(), score: finalScore });
  }

  function handleTimerComplete() {
    dispatch({ type: 'advancePhase' });
  }

  return (
    <Layout>
      <div className="flex h-full flex-col gap-16 py-16">
        <div className="flex items-center justify-end">
          <TimerBar durationSec={durationSec} onComplete={handleTimerComplete} />
        </div>
        <div className="flex justify-center">
          <Snake onGameOver={handleGameOver} />
        </div>
      </div>
    </Layout>
  );
}
