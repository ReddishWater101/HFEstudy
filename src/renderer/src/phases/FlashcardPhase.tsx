import { useEffect, useRef, useState } from 'react';
import { Layout } from '../components/Layout';
import { FlashCard } from '../components/FlashCard';
import { BucketButtons, type Bucket } from '../components/BucketButtons';
import { TimerBar } from '../components/TimerBar';
import { useDispatch, useSession } from '../state/SessionProvider';

function shuffle<T>(items: T[]): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function FlashcardPhase({ sessionLabel }: { sessionLabel: 'A' | 'B' }) {
  const { people, modeAssignment } = useSession();
  const dispatch = useDispatch();

  const [deck, setDeck] = useState<Person[]>(() => shuffle(people));
  const [currentIndex, setCurrentIndex] = useState(0);
  const cardShownAtRef = useRef(performance.now());

  const [durationSec, setDurationSec] = useState(420);
  useEffect(() => {
    void window.api.getConfig().then((cfg) => setDurationSec(cfg.flashcardSessionDurationSec));
  }, []);

  const currentPerson = deck[currentIndex];

  // Log flashcard.show on every card change
  useEffect(() => {
    if (!currentPerson) return;
    cardShownAtRef.current = performance.now();
    const mode = modeAssignment[currentPerson.id];
    if (mode === undefined) return;
    void window.api.logEvent({
      type: 'flashcard.show',
      t: Date.now(),
      personId: currentPerson.id,
      mode,
      sessionLabel,
    });
  }, [currentPerson, modeAssignment, sessionLabel]);

  function handleBucket(bucket: Bucket) {
    if (!currentPerson) return;
    const durationMs = performance.now() - cardShownAtRef.current;
    void window.api.logEvent({
      type: 'flashcard.bucket',
      t: Date.now(),
      personId: currentPerson.id,
      bucket,
      durationMs,
    });

    const next = currentIndex + 1;
    if (next >= deck.length) {
      void window.api.logEvent({
        type: 'flashcard.refill',
        t: Date.now(),
        sessionLabel,
      });
      setDeck(shuffle(people));
      setCurrentIndex(0);
    } else {
      setCurrentIndex(next);
    }
  }

  function handleTimerComplete() {
    dispatch({ type: 'advancePhase' });
  }

  if (!currentPerson) return null;
  const mode = modeAssignment[currentPerson.id];
  if (mode === undefined) return null;

  return (
    <Layout>
      <div className="flex h-full flex-col gap-16 py-16">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-widest text-neutral-400">
            Session {sessionLabel}
          </div>
          <TimerBar durationSec={durationSec} onComplete={handleTimerComplete} />
        </div>

        <FlashCard person={currentPerson} mode={mode} />

        <BucketButtons onBucket={handleBucket} />
      </div>
    </Layout>
  );
}
