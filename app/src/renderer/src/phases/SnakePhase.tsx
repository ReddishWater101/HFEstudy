import { useEffect } from 'react';
import { Layout } from '../components/Layout';
import { Snake } from '../components/Snake';
import { TimerBar } from '../components/TimerBar';
import { useDispatch, useSession } from '../state/SessionProvider';

export function SnakePhase() {
  const dispatch = useDispatch();
  const { studyConfig, phase } = useSession();

  if (!studyConfig) {
    throw new Error('SnakePhase rendered without studyConfig');
  }
  if (phase.kind !== 'snake') {
    throw new Error('SnakePhase rendered outside of snake phase');
  }

  const durationSec = studyConfig.snakeDurationSec;
  const afterBlockIndex = phase.afterBlockIndex;

  useEffect(() => {
    void window.api.logEvent({ type: 'snake.start', t: Date.now(), afterBlockIndex });
    return () => {
      void window.api.logEvent({ type: 'snake.end', t: Date.now(), afterBlockIndex });
    };
  }, [afterBlockIndex]);

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
