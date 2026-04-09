import { z } from 'zod';
import type { Person } from './assets';
import {
  getCurrentRegistry,
  importEntries,
  type UuidRegistry,
} from './peopleRegistry';

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
    /** Maps each person UUID to their firstName for cross-machine portability. */
    personMap: z.record(UuidZ, z.string().min(1)).optional(),
  })
  .strict();

export type StudyConfig = z.infer<typeof StudyConfigZ>;

/**
 * Resolve cfg.people (UUIDs) to actual Person records.
 *
 * When a study file contains a `personMap` (UUID -> firstName), any UUIDs
 * that are unknown locally are auto-imported into the registry so that
 * study files can be shared across machines without manual setup.
 *
 * Throws a human-readable error only if a UUID cannot be resolved even
 * after importing from personMap (e.g. the person's assets are missing).
 */
export async function resolvePeopleOrThrow(
  cfg: StudyConfig,
  registry: UuidRegistry,
  allPeople: Person[],
): Promise<Person[]> {
  // Build initial lookup from registry
  const byUuid = new Map<string, Person>();
  for (const [firstName, uuid] of Object.entries(registry.entries)) {
    const p = allPeople.find(
      (x) => x.firstName.toLowerCase() === firstName.toLowerCase(),
    );
    if (p) byUuid.set(uuid, p);
  }

  const missing = cfg.people.filter((u) => !byUuid.has(u));

  // If there are missing UUIDs and a personMap is present, auto-import them
  if (missing.length > 0 && cfg.personMap) {
    const toImport: Record<string, string> = {};
    for (const uuid of missing) {
      const firstName = cfg.personMap[uuid];
      if (firstName) {
        toImport[firstName] = uuid;
      }
    }
    if (Object.keys(toImport).length > 0) {
      await importEntries(toImport);
      // Rebuild the lookup after import
      byUuid.clear();
      // Re-read the registry (importEntries updates the cache)
      const updatedRegistry = getCurrentRegistry();
      for (const [firstName, uuid] of Object.entries(updatedRegistry.entries)) {
        const p = allPeople.find(
          (x) => x.firstName.toLowerCase() === firstName.toLowerCase(),
        );
        if (p) byUuid.set(uuid, p);
      }
    }
  }

  const stillMissing = cfg.people.filter((u) => !byUuid.has(u));
  if (stillMissing.length > 0) {
    // Build a helpful message showing which names are missing
    const details = stillMissing.map((u) => {
      const name = cfg.personMap?.[u];
      return name ? `${u} (${name})` : u;
    });
    throw new Error(
      `Study file references ${stillMissing.length} person(s) whose assets are not on this machine: ${details.join(', ')}`,
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
