import type { ModeAssignment } from '../state/session';

function shuffle<T>(items: T[]): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function assignModes(people: Person[], numberOfPeople = 16): ModeAssignment {
  const selected = shuffle(people).slice(0, numberOfPeople);
  const half = Math.floor(selected.length / 2);
  const phraseGroup = selected.slice(0, half);
  const noPhraseGroup = selected.slice(half);

  const assignment: ModeAssignment = {};

  const phraseShuffled = shuffle(phraseGroup);
  const phraseHalf = Math.floor(phraseShuffled.length / 2);
  for (let i = 0; i < phraseShuffled.length; i++) {
    assignment[phraseShuffled[i].id] = i < phraseHalf ? 1 : 2;
  }

  const noPhraseShuffled = shuffle(noPhraseGroup);
  const noPhraseHalf = Math.floor(noPhraseShuffled.length / 2);
  for (let i = 0; i < noPhraseShuffled.length; i++) {
    assignment[noPhraseShuffled[i].id] = i < noPhraseHalf ? 3 : 4;
  }

  return assignment;
}
