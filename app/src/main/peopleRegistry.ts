import { app } from 'electron';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { randomBytes, randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import type { Person } from './assets';
import { UuidZ } from './studyConfig';

export const UuidRegistryZ = z.object({
  version: z.literal(1),
  entries: z.record(z.string(), UuidZ),
});

export type UuidRegistry = z.infer<typeof UuidRegistryZ>;

let cachedRegistry: UuidRegistry | null = null;

export function getRegistryPath(): string {
  return join(app.getPath('userData'), 'people.json');
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function writeRegistryAtomic(
  path: string,
  registry: UuidRegistry,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${Date.now()}.${randomBytes(4).toString('hex')}.tmp`;
  await writeFile(tmp, JSON.stringify(registry, null, 2), 'utf8');
  await rename(tmp, path);
}

/**
 * Load the people.json registry from disk, creating it on first run and
 * augmenting it with any newly-scanned people. Never removes entries.
 *
 * On corrupt JSON / failed parse this throws — caller should surface via
 * dialog.showErrorBox the same way config.ts does.
 */
export async function loadOrInitRegistry(
  scanned: Person[],
): Promise<UuidRegistry> {
  const path = getRegistryPath();

  let registry: UuidRegistry;
  if (!(await fileExists(path))) {
    registry = { version: 1, entries: {} };
    await writeRegistryAtomic(path, registry);
  } else {
    const raw = await readFile(path, 'utf8');
    const parsed = JSON.parse(raw);
    registry = UuidRegistryZ.parse(parsed);
  }

  const existing = new Set(Object.keys(registry.entries));
  let added = false;
  for (const person of scanned) {
    if (!existing.has(person.firstName)) {
      registry.entries[person.firstName] = randomUUID();
      added = true;
    }
  }

  if (added) {
    await writeRegistryAtomic(path, registry);
  }

  cachedRegistry = registry;
  return registry;
}

export function getCurrentRegistry(): UuidRegistry {
  if (!cachedRegistry) {
    throw new Error('Registry not loaded — call loadOrInitRegistry() first');
  }
  return cachedRegistry;
}

/**
 * Import UUID -> firstName entries from a study file's personMap.
 * Only adds entries where the firstName is not already present in the
 * registry (preserves existing local mappings). Also handles the case
 * where the name exists but with a different UUID — in that case the
 * existing local mapping is kept so local study files still work.
 *
 * This is the mechanism that makes study files portable across machines.
 */
export async function importEntries(
  nameToUuid: Record<string, string>,
): Promise<void> {
  const registry = getCurrentRegistry();
  const existingNames = new Set(
    Object.keys(registry.entries).map((n) => n.toLowerCase()),
  );
  const existingUuids = new Set(Object.values(registry.entries));

  let added = false;
  for (const [firstName, uuid] of Object.entries(nameToUuid)) {
    // Skip if this name already has a mapping
    if (existingNames.has(firstName.toLowerCase())) continue;
    // Skip if this UUID is already used for a different name
    if (existingUuids.has(uuid)) continue;
    registry.entries[firstName] = uuid;
    existingNames.add(firstName.toLowerCase());
    existingUuids.add(uuid);
    added = true;
  }

  if (added) {
    const path = getRegistryPath();
    await writeRegistryAtomic(path, registry);
    cachedRegistry = registry;
  }
}

/**
 * Look up a uuid by firstName (case-insensitive). Returns null if absent.
 */
export function personUuid(firstName: string): string | null {
  const registry = getCurrentRegistry();
  for (const [name, uuid] of Object.entries(registry.entries)) {
    if (name.toLowerCase() === firstName.toLowerCase()) return uuid;
  }
  return null;
}

/**
 * Resolve a list of UUIDs to Person records. Returns either the list (in
 * input order) or { missing } listing UUIDs that could not be resolved.
 */
export function resolveUuidsToPeople(
  uuids: string[],
  allPeople: Person[],
): Person[] | { missing: string[] } {
  const registry = getCurrentRegistry();
  const byUuid = new Map<string, Person>();
  for (const [firstName, uuid] of Object.entries(registry.entries)) {
    const p = allPeople.find(
      (x) => x.firstName.toLowerCase() === firstName.toLowerCase(),
    );
    if (p) byUuid.set(uuid, p);
  }
  const missing = uuids.filter((u) => !byUuid.has(u));
  if (missing.length > 0) return { missing };
  return uuids.map((u) => byUuid.get(u)!);
}

/**
 * Return the scanned people, each augmented with their registry uuid.
 * People not in the registry are skipped (they won't normally exist:
 * loadOrInitRegistry adds entries for every scanned person).
 */
export function attachUuids(
  scanned: Person[],
): Array<Person & { uuid: string }> {
  const registry = getCurrentRegistry();
  const out: Array<Person & { uuid: string }> = [];
  for (const person of scanned) {
    const entry = Object.entries(registry.entries).find(
      ([name]) => name.toLowerCase() === person.firstName.toLowerCase(),
    );
    if (entry) {
      out.push({ ...person, uuid: entry[1] });
    }
  }
  return out;
}
