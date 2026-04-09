import { z } from 'zod';
import type { Person } from './assets';
import type { UuidRegistry } from './peopleRegistry';

export const MODE_VALUES = [1, 2, 3, 4] as const;

export const ModeZ = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
]);

export const UuidZ = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    'must be a uuid v4',
  );

export const StudyConfigZ = z
  .object({
    version: z.literal(1),
    id: UuidZ,
    createdAt: z.iso.datetime({ offset: true }),
    people: z
      .array(UuidZ)
      .min(1, 'people must contain at least one UUID')
      .refine(
        (val) => new Set(val).size === val.length,
        'Duplicate person UUIDs found',
      ),
    flashcardBlockCount: z.number().int().min(1).max(10),
    flashcardBlockDurationSec: z.number().int().min(10),
    snakeEnabled: z.boolean(),
    snakeDurationSec: z.number().int().min(10),
    enabledModes: z
      .array(ModeZ)
      .min(1, 'enabledModes must contain at least one mode')
      .refine(
        (arr) => new Set(arr).size === arr.length,
        'enabledModes must not contain duplicates',
      ),
  })
  .strict();

export type StudyConfig = z.infer<typeof StudyConfigZ>;

/**
 * Resolve cfg.people (UUIDs) to actual Person records.
 * Throws a human-readable error if any UUID is missing from the registry
 * or its corresponding firstName is no longer present in the scanned People dir.
 */
export function resolvePeopleOrThrow(
  cfg: StudyConfig,
  registry: UuidRegistry,
  allPeople: Person[],
): Person[] {
  const byUuid = new Map<string, Person>();
  for (const [firstName, uuid] of Object.entries(registry.entries)) {
    const p = allPeople.find(
      (x) => x.firstName.toLowerCase() === firstName.toLowerCase(),
    );
    if (p) byUuid.set(uuid, p);
  }
  const missing = cfg.people.filter((u) => !byUuid.has(u));
  if (missing.length > 0) {
    throw new Error(
      `Study file references ${missing.length} unknown person UUID(s): ${missing.join(', ')}`,
    );
  }
  // preserve order from cfg.people
  return cfg.people.map((u) => byUuid.get(u)!);
}

/**
 * Flatten a Zod error into a single human-readable string.
 */
export function flattenZodError(err: z.ZodError): string {
  return err.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
      return `${path}: ${issue.message}`;
    })
    .join('; ');
}
