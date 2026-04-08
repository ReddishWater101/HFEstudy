import { useEffect, useMemo, useRef, useState } from 'react';
import { Layout } from '../components/Layout';
import { Input } from '../components/ui/Input';
import { isMatch } from '../lib/fuzzy';
import { useDispatch, useSession } from '../state/SessionProvider';

function shuffle<T>(items: T[]): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function QuizPhase() {
  const { people } = useSession();
  const dispatch = useDispatch();

  const order = useMemo(() => shuffle(people), [people]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [recallTimePerFaceSec, setRecallTimePerFaceSec] = useState(15);
  const [fuzzyMaxEdits, setFuzzyMaxEdits] = useState(2);

  useEffect(() => {
    void window.api.getConfig().then((cfg) => {
      setRecallTimePerFaceSec(cfg.recallTimePerFaceSec);
      setFuzzyMaxEdits(cfg.fuzzyMatchMaxEdits);
    });
  }, []);

  function advance() {
    const next = currentIndex + 1;
    if (next >= order.length) {
      dispatch({ type: 'advancePhase' });
    } else {
      setCurrentIndex(next);
    }
  }

  const currentPerson = order[currentIndex];
  if (!currentPerson) return null;

  return (
    <QuizQuestion
      key={currentPerson.id}
      person={currentPerson}
      timeLimitSec={recallTimePerFaceSec}
      fuzzyMaxEdits={fuzzyMaxEdits}
      onComplete={advance}
    />
  );
}

type QuizQuestionProps = {
  person: Person;
  timeLimitSec: number;
  fuzzyMaxEdits: number;
  onComplete: () => void;
};

function QuizQuestion({ person, timeLimitSec, fuzzyMaxEdits, onComplete }: QuizQuestionProps) {
  const [typed, setTyped] = useState('');
  const cardShownAtRef = useRef<number | null>(null);
  const settledRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  // Hard timeout — uses setTimeout so it survives even if RAF is throttled
  useEffect(() => {
    timerRef.current = window.setTimeout(() => {
      if (settledRef.current) return;
      settledRef.current = true;
      void window.api.logEvent({
        type: 'quiz.timeout',
        t: Date.now(),
        personId: person.id,
      });
      onComplete();
    }, timeLimitSec * 1000);

    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [person.id, timeLimitSec]);

  function handleImageLoad() {
    if (cardShownAtRef.current === null) {
      cardShownAtRef.current = performance.now();
      void window.api.logEvent({
        type: 'quiz.show',
        t: Date.now(),
        personId: person.id,
        trueName: person.firstName,
      });
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return;
    if (settledRef.current) return;
    const answerAt = performance.now();
    settledRef.current = true;

    const shownAt = cardShownAtRef.current ?? answerAt;
    const rtMs = answerAt - shownAt;
    const result = isMatch(typed, person.firstName, fuzzyMaxEdits);

    void window.api.logEvent({
      type: 'quiz.answer',
      t: Date.now(),
      personId: person.id,
      typed,
      correct: result.match,
      editDistance: result.distance,
      rtMs,
    });

    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    onComplete();
  }

  return (
    <Layout>
      <div className="flex h-full flex-col items-center gap-12 py-16">
        <div className="text-xs uppercase tracking-widest text-neutral-400">Recall</div>
        <img
          src={person.imageUrl}
          alt=""
          onLoad={handleImageLoad}
          className="h-64 w-64 object-cover"
          draggable={false}
        />
        <div className="w-full max-w-sm">
          <Input
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type their first name…"
            autoFocus
            autoComplete="off"
          />
        </div>
      </div>
    </Layout>
  );
}
