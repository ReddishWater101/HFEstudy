import { useEffect } from 'react';
import * as audio from '../lib/audio';
import { useSession } from '../state/SessionProvider';
import { SpeakerButton } from './SpeakerButton';

export function FlashCard({ person, mode }: { person: Person; mode: Mode }) {
  const { memoryPhrases } = useSession();
  const phrase = memoryPhrases[person.id] ?? '';

  // Auto-play audio on mount for modes 2 and 4
  useEffect(() => {
    if (mode === 2 || mode === 4) {
      audio.play(person.audioUrl);
    }
  }, [person.id, mode, person.audioUrl]);

  const showPhrase = mode === 1 || mode === 2;
  const showName = mode === 1 || mode === 3;
  const showSpeaker = mode === 2 || mode === 4;

  return (
    <div className="flex flex-col items-center gap-8">
      <img
        src={person.imageUrl}
        alt=""
        className="h-64 w-64 object-cover"
        draggable={false}
      />

      {showPhrase && phrase && (
        <div className="max-w-md text-center text-base italic text-neutral-500">{phrase}</div>
      )}

      {showName && (
        <div className="font-display text-4xl text-neutral-900">{person.firstName}</div>
      )}

      {showSpeaker && <SpeakerButton onClick={() => audio.play(person.audioUrl)} />}
    </div>
  );
}
