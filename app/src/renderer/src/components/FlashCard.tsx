import { useState } from 'react';
import * as audio from '../lib/audio';
import { useSession } from '../state/SessionProvider';
import { SpeakerButton } from './SpeakerButton';

export function FlashCard({ person, mode }: { person: Person; mode: Mode }) {
  const { memoryPhrases } = useSession();
  const phrase = memoryPhrases[person.id] ?? '';

  const [revealed, setRevealed] = useState(false);

  const isAudio = mode === 2 || mode === 4;

  function handleFlip() {
    const next = !revealed;
    setRevealed(next);
    if (next && isAudio) {
      audio.play(person.audioUrl);
    }
  }

  return (
    <div className="flex flex-col items-center gap-8">
      <img
        src={person.imageUrl}
        alt=""
        className="h-64 w-64 object-cover"
        draggable={false}
      />

      <div
        className="w-64 [perspective:1000px]"
        onClick={handleFlip}
      >
        <div
          className="relative h-40 w-full transition-transform duration-500 ease-[cubic-bezier(0.4,0,0.2,1)]"
          style={{
            transformStyle: 'preserve-3d',
            transform: revealed ? 'rotateY(180deg)' : 'rotateY(0deg)',
          }}
        >
          {/* Front face */}
          <div
            className={
              'absolute inset-0 flex items-center justify-center rounded-2xl border border-neutral-200 bg-neutral-50 shadow-sm ' +
              (revealed ? 'pointer-events-none' : 'cursor-pointer hover:bg-neutral-100')
            }
            style={{
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
            }}
          >
            <span className="text-base text-neutral-300">click to reveal</span>
          </div>

          {/* Back face */}
          <div
            className={
              'absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-2xl border border-neutral-200 bg-neutral-50 px-6 py-4 shadow-sm ' +
              (revealed ? '' : 'pointer-events-none')
            }
            style={{
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              transform: 'rotateY(180deg)',
            }}
          >
            {isAudio ? (
              <div onClick={(e) => e.stopPropagation()}>
                <SpeakerButton onClick={() => audio.play(person.audioUrl)} />
              </div>
            ) : (
              <span className="font-display text-3xl text-neutral-900">{person.firstName}</span>
            )}
            {phrase && (
              <div className="text-center text-sm italic text-neutral-500">{phrase}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
