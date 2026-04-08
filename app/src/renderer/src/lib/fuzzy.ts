import { distance } from 'fastest-levenshtein';

export function isMatch(
  typed: string,
  target: string,
  maxEdits = 2,
): { match: boolean; distance: number } {
  const a = typed.trim().toLowerCase();
  const b = target.trim().toLowerCase();
  const d = distance(a, b);
  return { match: d <= maxEdits, distance: d };
}
