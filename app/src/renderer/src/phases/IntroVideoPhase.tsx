import { useEffect, useState } from 'react';
import { Layout } from '../components/Layout';
import { VideoPlayer } from '../components/VideoPlayer';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { useDispatch, useSession } from '../state/SessionProvider';

export function IntroVideoPhase() {
  const { phase, people, modeAssignment } = useSession();
  const dispatch = useDispatch();
  const [phraseMinChars, setPhraseMinChars] = useState(8);

  useEffect(() => {
    void window.api.getConfig().then((cfg) => setPhraseMinChars(cfg.phraseMinChars));
  }, []);

  if (phase.kind !== 'intro') return null;

  const index = phase.index;
  const person = people[index];

  if (!person) return null;

  const mode = modeAssignment[person.id];
  const phraseRequired = mode === 1 || mode === 2;

  return (
    <IntroPersonView
      key={person.id}
      person={person}
      index={index}
      total={people.length}
      phraseRequired={phraseRequired}
      phraseMinChars={phraseMinChars}
      onAdvance={() => {
        const next = index + 1;
        if (next >= people.length) {
          dispatch({ type: 'advancePhase' });
        } else {
          dispatch({ type: 'setIntroIndex', index: next });
        }
      }}
    />
  );
}

type IntroPersonViewProps = {
  person: Person;
  index: number;
  total: number;
  phraseRequired: boolean;
  phraseMinChars: number;
  onAdvance: () => void;
};

function IntroPersonView({
  person,
  index,
  total,
  phraseRequired,
  phraseMinChars,
  onAdvance,
}: IntroPersonViewProps) {
  const dispatch = useDispatch();
  const [playCount, setPlayCount] = useState(0);
  const [firstPlayEnded, setFirstPlayEnded] = useState(false);
  const [phrase, setPhrase] = useState('');

  function handlePlayCountChange(count: number) {
    setPlayCount(count);
    void window.api.logEvent({
      type: 'intro.video.play',
      t: Date.now(),
      personId: person.id,
      playCount: count,
    });
  }

  function handleEnded() {
    setFirstPlayEnded(true);
  }

  function handlePhraseChange(value: string) {
    setPhrase(value);
    void window.api.logEvent({
      type: 'intro.phrase.input',
      t: Date.now(),
      personId: person.id,
      phrase: value,
    });
  }

  function handleNext() {
    if (phraseRequired) {
      dispatch({ type: 'setMemoryPhrase', personId: person.id, phrase });
    }
    void window.api.logEvent({
      type: 'intro.advance',
      t: Date.now(),
      personId: person.id,
    });
    onAdvance();
  }

  const phraseValid = !phraseRequired || phrase.length >= phraseMinChars;
  const canAdvance = playCount >= 2 && phraseValid;
  const showPhraseInput = phraseRequired && firstPlayEnded;

  return (
    <Layout>
      <div className="flex h-full flex-col gap-12 py-16">
        <div className="text-xs uppercase tracking-widest text-neutral-400">
          Person {index + 1} of {total}
        </div>

        <h2 className="font-display text-4xl text-neutral-900 text-center">
          {person.firstName}
        </h2>

        <VideoPlayer
          src={person.videoUrl}
          onPlayCountChange={handlePlayCountChange}
          onEnded={handleEnded}
        />

        {showPhraseInput && (
          <div className="flex flex-col gap-2">
            <Input
              value={phrase}
              onChange={(e) => handlePhraseChange(e.target.value)}
              placeholder={`Type a memory phrase (min ${phraseMinChars} chars)…`}
              autoFocus
            />
          </div>
        )}

        <div className="flex justify-end">
          <Button
            variant="primary"
            onClick={handleNext}
            disabled={!canAdvance}
            className="self-end"
          >
            Next →
          </Button>
        </div>
      </div>
    </Layout>
  );
}
