/**
 * Describe the people-per-mode split for the proctor builder. Used by the
 * even-split indicator to give the proctor a live preview of how their
 * selection will land before they save the study file.
 */
export function describeEvenSplit(
  peopleCount: number,
  modeCount: number,
): { even: boolean; base: number; remainder: number; message: string } {
  if (peopleCount === 0 || modeCount === 0) {
    return {
      even: true,
      base: 0,
      remainder: 0,
      message: 'Select people to see the split.',
    };
  }
  const base = Math.floor(peopleCount / modeCount);
  const remainder = peopleCount % modeCount;
  if (remainder === 0) {
    return {
      even: true,
      base,
      remainder,
      message: `Even split — ${base} ${
        base === 1 ? 'person' : 'people'
      } per mode across ${modeCount} modes.`,
    };
  }
  const high = base + 1;
  const highModes = remainder;
  const lowModes = modeCount - remainder;
  return {
    even: false,
    base,
    remainder,
    message:
      `Uneven: ${highModes} ${
        highModes === 1 ? 'mode would have' : 'modes would have'
      } ${high} people, ` +
      `${lowModes} ${
        lowModes === 1 ? 'mode would have' : 'modes would have'
      } ${base}.`,
  };
}
