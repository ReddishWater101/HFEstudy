import { useEffect, useState } from 'react';
import { Layout } from '../components/Layout';
import { VideoPlayer } from '../components/VideoPlayer';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { useDispatch, useSession } from '../state/SessionProvider';

export function IntroVideoPhase() {
  const { phase, people, modeAssignment } = useSession();
  const dispatch = useDispatch();
  const [introConfig, setIntroConfig] = useState({
    phraseMinChars: 8,
    mandatorySecondVideoPlay: true,
  });

  useEffect(() => {
    let cancelled = false;

    void window.api.getConfig().then((cfg) => {
      if (cancelled) {
        return;
      }

      setIntroConfig({
        phraseMinChars: cfg.phraseMinChars,
        mandatorySecondVideoPlay: cfg.mandatorySecondVideoPlay,
      });
    });

    return () => {
      cancelled = true;
    };
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
      phraseMinChars={introConfig.phraseMinChars}
      mandatorySecondVideoPlay={introConfig.mandatorySecondVideoPlay}
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
  mandatorySecondVideoPlay: boolean;
  onAdvance: () => void;
};

function IntroPersonView({
  person,
  index,
  total,
  phraseRequired,
  phraseMinChars,
  mandatorySecondVideoPlay,
  onAdvance,
}: IntroPersonViewProps) {
  const dispatch = useDispatch();
  const [completedPlayCount, setCompletedPlayCount] = useState(0);
  const [firstPlayEnded, setFirstPlayEnded] = useState(false);
  const [phrase, setPhrase] = useState('');

  function handlePlayCountChange(count: number) {
    void window.api.logEvent({
      type: 'intro.video.play',
      t: Date.now(),
      personId: person.id,
      playCount: count,
    });
  }

  function handleEnded(count: number) {
    setCompletedPlayCount(count);
    if (count >= 1) {
      setFirstPlayEnded(true);
    }
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
      dispatch({ type: 'setMemoryPhrase', personId: person.id, phrase: phrase.trim() });
    }
    void window.api.logEvent({
      type: 'intro.advance',
      t: Date.now(),
      personId: person.id,
    });
    onAdvance();
  }

  const phraseLength = phrase.trim().length;
  const phraseLower = phrase.trim().toLowerCase();
  const phraseContainsName = phraseRequired && person.firstName.length > 0 && phraseLower.includes(person.firstName.toLowerCase());
  const phraseValid = !phraseRequired || (phraseLength >= phraseMinChars && !phraseContainsName);
  const requiredCompletedPlays = mandatorySecondVideoPlay ? 2 : 1;
  const replayRequirementMet = completedPlayCount >= requiredCompletedPlays;
  const canAdvance = firstPlayEnded && replayRequirementMet && phraseValid;
  const showPhraseInput = phraseRequired && firstPlayEnded;

  const showReplayHint = firstPlayEnded && !replayRequirementMet;

  return (
    <Layout>
      <div className="flex h-full flex-col gap-12 py-16">
        <div className="text-xs uppercase tracking-widest text-neutral-400">
          Person {index + 1} of {total}
        </div>

        <h2 className="font-display text-center text-4xl text-neutral-900">
          {person.firstName}
        </h2>

        <VideoPlayer
          src={person.videoUrl}
          title={`${person.firstName} introduction video`}
          onPlayCountChange={handlePlayCountChange}
          onEnded={handleEnded}
          onLoadError={() => {
            void window.api.logEvent({
              type: 'intro.video.error',
              t: Date.now(),
              personId: person.id,
            });
          }}
          onStall={() => {
            void window.api.logEvent({
              type: 'intro.video.stall',
              t: Date.now(),
              personId: person.id,
            });
          }}
        />

        {showPhraseInput && (
          <div className="flex flex-col gap-2">
            <Input
              value={phrase}
              onChange={(e) => handlePhraseChange(e.target.value)}
              placeholder={`Type a memory phrase (min ${phraseMinChars} chars)...`}
              autoFocus
            />
            {phraseContainsName && (
              <p className="text-sm text-red-600">Your phrase cannot contain the person&apos;s name</p>
            )}
          </div>
        )}

        <div className="flex flex-col items-end gap-2">
          {showReplayHint && (
            <div className="text-sm text-neutral-500">Replay once to continue.</div>
          )}
          <Button
            variant="primary"
            onClick={handleNext}
            disabled={!canAdvance}
            className="self-end"
          >
            Next {'->'}
          </Button>
        </div>
      </div>
    </Layout>
  );
}
