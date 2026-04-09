import type { ModeAssignment } from '../state/session';

function shuffle<T>(items: T[]): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Distribute people across the enabled modes as evenly as possible. Extras
 * (when n % m !== 0) are spread one each across a randomly-selected subset
 * of modes — never stacked on a single mode.
 *
 * Returns an empty assignment if no people are selected. Throws if no modes
 * are enabled.
 */
export function assignModes(
  selectedPeople: Person[],
  enabledModes: Mode[],
): ModeAssignment {
  if (selectedPeople.length === 0) return {};
  if (enabledModes.length === 0) {
    throw new Error('assignModes: enabledModes must not be empty');
  }

  const shuffledPeople = shuffle(selectedPeople);
  const modes = enabledModes.slice();
  const n = shuffledPeople.length;
  const m = modes.length;
  const base = Math.floor(n / m);
  const remainder = n % m;

  // Choose `remainder` distinct modes to each receive one extra person.
  const shuffledModes = shuffle(modes);
  const bonusModes = new Set<Mode>(shuffledModes.slice(0, remainder));

  // Build target counts per mode
  const targets = new Map<Mode, number>();
  for (const mode of modes) {
    targets.set(mode, base + (bonusModes.has(mode) ? 1 : 0));
  }

  // Distribute people in shuffled order to modes in shuffled order
  const assignment: ModeAssignment = {};
  let cursor = 0;
  for (const mode of shuffledModes) {
    const take = targets.get(mode) ?? 0;
    for (let i = 0; i < take; i++) {
      assignment[shuffledPeople[cursor++].id] = mode;
    }
  }
  return assignment;
}
