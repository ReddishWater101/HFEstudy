# Experiment Builder Mode — Technical Design Specification

## 1. Overview

The HFE Study app currently runs a fixed-sequence name-recall study driven by `config.json`. This feature adds **Experiment Builder Mode** — a proctor-only tool for composing, saving, and loading "study files" (JSON) that parametrize which people appear, how many flashcard blocks run, whether the snake mini-game plays, how long each runs, and which of the four memory modes are enabled. Participants load a proctor-prepared study file on the welcome screen; without a valid file they cannot begin. The goal is reproducible, per-experiment control without code changes or manual `config.json` edits for any of the study-variable knobs.

## 2. JSON schema

### 2.1 TypeScript type (place in `src/types/global.d.ts`)

```ts
type StudyConfigV1 = {
  version: 1;
  id: string;                 // uuid v4, one per file
  createdAt: string;          // ISO-8601 timestamp
  people: string[];           // non-empty list of person UUIDs
  flashcardBlockCount: number;        // 1..10
  flashcardBlockDurationSec: number;  // >=10
  snakeEnabled: boolean;
  snakeDurationSec: number;   // >=10 (still required even when disabled)
  enabledModes: Mode[];       // non-empty subset of [1,2,3,4]
};

type StudyConfig = StudyConfigV1;

// Resolved form after UUID -> Person hydration in the renderer
type ResolvedStudyConfig = StudyConfig & {
  resolvedPeople: Person[];
};
```

### 2.2 Zod schema (place in `src/main/studyConfig.ts`, re-exported to renderer via a shared file)

```ts
import { z } from 'zod';

export const MODE_VALUES = [1, 2, 3, 4] as const;
export const ModeZ = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);

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
    createdAt: z.string().datetime({ offset: true }),
    people: z.array(UuidZ).min(1, 'people must contain at least one UUID'),
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
```

**Decision:** schema uses `.strict()` so unknown keys fail validation — this is how unknown-version files get loudly rejected in combination with `version: z.literal(1)`.

**Validation error strategy:** `StudyConfigZ.safeParse(raw)`. On failure, flatten to a single human-readable error by joining `issues[].path` with `issues[].message`. Missing-UUID errors (UUIDs that validate syntactically but aren't in the registry) are surfaced by a second pass performed by the resolver (below).

### 2.3 Resolver (main process)

```ts
// src/main/studyConfig.ts
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
```

## 3. UUID registry

### 3.1 File format

Location: `<userData>/people.json`.

```json
{
  "version": 1,
  "entries": {
    "Aaron": "3f2b6e18-3b2e-4b3e-9a48-b6d83b5b9a4c",
    "Adrian": "1a0c6a2c-a5d7-4f1f-9d0b-21c5a4d4f1a3"
  }
}
```

- Keys are `firstName` as found on disk (case-preserved).
- Values are uuid v4 strings.
- `entries` is an ordered object (JSON key insertion order is preserved; it is not a security-sensitive ordering).

Zod schema (in `src/main/peopleRegistry.ts`):

```ts
export const UuidRegistryZ = z.object({
  version: z.literal(1),
  entries: z.record(z.string(), UuidZ),
});
export type UuidRegistry = z.infer<typeof UuidRegistryZ>;
```

### 3.2 Migration / first-run behavior

`src/main/peopleRegistry.ts` exposes:

```ts
export async function loadOrInitRegistry(scanned: Person[]): Promise<UuidRegistry>;
export function getCurrentRegistry(): UuidRegistry;
export function personUuid(firstName: string): string | null;
export function resolveUuidsToPeople(uuids: string[], allPeople: Person[]): Person[] | { missing: string[] };
```

Algorithm for `loadOrInitRegistry`:

1. If `<userData>/people.json` does not exist, create an empty `{ version: 1, entries: {} }` and write it.
2. Read and `UuidRegistryZ.parse()` it. If parse fails, throw a fatal error via `dialog.showErrorBox` (matches existing `loadConfig` failure pattern).
3. Build a `Set<string>` of current registry `firstName` keys (preserve original case). For every `person.firstName` in `scanned` that is not in the set, generate `crypto.randomUUID()` and add to `entries`.
4. If any new entries were added, write back to disk atomically (write-then-rename).
5. Never remove entries for missing people (per requirement: historical preservation).
6. Cache the registry in module-local state and expose via `getCurrentRegistry()`.

Called from `src/main/index.ts` after `loadConfig()` and before `registerIpc()`:

```ts
await loadConfig();
const scanned = await scanPeople();
await loadOrInitRegistry(scanned);
```

## 4. IPC additions

All channels added by `registerIpc()` in `src/main/ipc.ts`. Preload exposes them on `window.api`. All channels return a plain value or throw; the renderer `await`s and catches.

| Channel | Request type | Response type | Errors |
|---|---|---|---|
| `getPeopleWithUuids` | `()` | `Array<Person & { uuid: string }>` | Throws if registry not loaded |
| `getRegistry` | `()` | `UuidRegistry` | Throws if registry not loaded |
| `readStudyFile` | `(filePath: string)` | `{ config: StudyConfig; resolvedPeople: Person[] }` | Throws with message on any validation or resolution error |
| `writeStudyFile` | `(filePath: string, config: StudyConfig)` | `void` | Throws on FS error or if schema validation fails |
| `showStudyFileOpenDialog` | `()` | `{ filePath: string; config: StudyConfig; resolvedPeople: Person[] } \| null` | Returns `null` on cancel; throws on validation error |
| `showStudyFileSaveDialog` | `(config: StudyConfig)` | `{ filePath: string } \| null` | Returns `null` on cancel; throws on FS error |

**Note:** `showStudyFileOpenDialog` is a convenience that shows the native dialog AND reads + validates in one round-trip. `readStudyFile` is exposed separately for testing and alternate entry points.

### 4.1 Behavior of `showStudyFileOpenDialog`

```ts
ipcMain.handle('showStudyFileOpenDialog', async (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  const result = window
    ? await dialog.showOpenDialog(window, {
        properties: ['openFile'],
        filters: [
          { name: 'HFE Study File', extensions: ['hfestudy.json', 'json'] },
        ],
      })
    : await dialog.showOpenDialog({ /* same */ });
  if (result.canceled || result.filePaths.length === 0) return null;
  const filePath = result.filePaths[0];
  const raw = await readFile(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  const cfg = StudyConfigZ.parse(parsed); // throws on failure
  const registry = getCurrentRegistry();
  const allPeople = await scanPeople();
  const resolvedPeople = resolvePeopleOrThrow(cfg, registry, allPeople);
  return { filePath, config: cfg, resolvedPeople };
});
```

### 4.2 Behavior of `showStudyFileSaveDialog`

```ts
ipcMain.handle('showStudyFileSaveDialog', async (event, cfg: StudyConfig) => {
  StudyConfigZ.parse(cfg); // validate before writing
  const window = BrowserWindow.fromWebContents(event.sender);
  const result = window
    ? await dialog.showSaveDialog(window, {
        defaultPath: `study-${Date.now()}.hfestudy.json`,
        filters: [{ name: 'HFE Study File', extensions: ['hfestudy.json'] }],
      })
    : await dialog.showSaveDialog({ /* same */ });
  if (result.canceled || !result.filePath) return null;
  let filePath = result.filePath;
  if (!filePath.endsWith('.hfestudy.json')) {
    // ensure extension
    filePath = filePath.replace(/\.json$/i, '') + '.hfestudy.json';
  }
  await writeFile(filePath, JSON.stringify(cfg, null, 2), 'utf8');
  return { filePath };
});
```

### 4.3 Preload additions

Add to `src/preload/index.ts`:

```ts
getPeopleWithUuids: () => ipcRenderer.invoke('getPeopleWithUuids'),
getRegistry: () => ipcRenderer.invoke('getRegistry'),
readStudyFile: (filePath) => ipcRenderer.invoke('readStudyFile', filePath),
writeStudyFile: (filePath, config) => ipcRenderer.invoke('writeStudyFile', filePath, config),
showStudyFileOpenDialog: () => ipcRenderer.invoke('showStudyFileOpenDialog'),
showStudyFileSaveDialog: (config) => ipcRenderer.invoke('showStudyFileSaveDialog', config),
```

Add to `Api` in `src/types/global.d.ts`:

```ts
type PersonWithUuid = Person & { uuid: string };

type Api = {
  // ...existing...
  getPeopleWithUuids: () => Promise<PersonWithUuid[]>;
  getRegistry: () => Promise<{ version: 1; entries: Record<string, string> }>;
  readStudyFile: (filePath: string) => Promise<{
    config: StudyConfig;
    resolvedPeople: Person[];
  }>;
  writeStudyFile: (filePath: string, config: StudyConfig) => Promise<void>;
  showStudyFileOpenDialog: () => Promise<{
    filePath: string;
    config: StudyConfig;
    resolvedPeople: Person[];
  } | null>;
  showStudyFileSaveDialog: (config: StudyConfig) => Promise<{ filePath: string } | null>;
};
```

## 5. Renderer state changes

### 5.1 New `Phase` enum (in `src/renderer/src/state/session.ts`)

```ts
export type Phase =
  | { kind: 'welcome' }
  | { kind: 'proctor-builder' }
  | { kind: 'intro'; index: number }
  | { kind: 'flashcard'; blockIndex: number }       // 0-based
  | { kind: 'snake'; afterBlockIndex: number }      // 0-based block that just ran; -1 if none
  | { kind: 'quiz' }
  | { kind: 'end' };
```

**Decision:** `flashcards-a` and `flashcards-b` are removed entirely. `snake` now carries `afterBlockIndex` so the sequencer and any logs can know which block preceded it. Retained 0-based internal indexing; any human-facing label uses `blockIndex + 1`.

### 5.2 New `SessionState`

```ts
export type SessionState = {
  phase: Phase;
  participantId: string | null;
  intake: IntakeData | null;
  people: Person[];
  modeAssignment: ModeAssignment;
  memoryPhrases: Record<string, string>;
  studyConfig: StudyConfig | null;    // NEW — set on welcome, null elsewhere
};

export const initialState: SessionState = {
  phase: { kind: 'welcome' },
  participantId: null,
  intake: null,
  people: [],
  modeAssignment: {},
  memoryPhrases: {},
  studyConfig: null,
};
```

### 5.3 New `Action`s

```ts
export type Action =
  | { type: 'startSession'; participantId: string; intake: IntakeData }
  | { type: 'advancePhase' }
  | { type: 'setPhase'; phase: Phase }                  // NEW — used for proctor entry/exit
  | { type: 'setIntroIndex'; index: number }
  | { type: 'setMemoryPhrase'; personId: string; phrase: string }
  | { type: 'setPeople'; people: Person[] }
  | { type: 'setModeAssignment'; modeAssignment: ModeAssignment }
  | { type: 'setParticipantId'; participantId: string }
  | { type: 'setStudyConfig'; studyConfig: StudyConfig }// NEW
  | { type: 'clearStudyConfig' };                        // NEW — used by back-to-welcome
```

### 5.4 Reducer changes

- `setPhase`: replaces `state.phase` directly (used by proctor entry/back button).
- `setStudyConfig` / `clearStudyConfig`: set or null `studyConfig`. `clearStudyConfig` also resets `people`, `modeAssignment`, `memoryPhrases` back to initial — so leaving proctor and coming back doesn't leave stale arrays. **Decision:** `clearStudyConfig` is a hard reset of per-run state EXCEPT `phase`.
- `advancePhase`: see next section (phase sequencing).
- `setIntroIndex`: unchanged.

## 6. Phase sequencing

The sequencer operates on a reducer that needs both the current phase and `state.studyConfig` to decide the next phase. This means `nextPhase(phase, studyConfig)` now takes a second argument and the reducer passes it in.

### 6.1 State machine (snake ON, blockCount = N)

```
welcome → intro(0..people.length-1) → flashcard(0)
       → snake(afterBlockIndex=0)
       → flashcard(1)
       → snake(afterBlockIndex=1)
       → ...
       → flashcard(N-1)
       → snake(afterBlockIndex=N-1)
       → quiz
       → end
```

### 6.2 State machine (snake OFF, blockCount = N)

```
welcome → intro(0..people.length-1) → flashcard(0)
       → flashcard(1)
       → ...
       → flashcard(N-1)
       → quiz
       → end
```

### 6.3 Transition rules (pseudo-code)

```ts
function nextPhase(phase: Phase, sc: StudyConfig | null): Phase {
  if (!sc) throw new Error('nextPhase called without studyConfig');
  switch (phase.kind) {
    case 'welcome':
      return { kind: 'intro', index: 0 };
    case 'intro':
      return { kind: 'flashcard', blockIndex: 0 };
    case 'flashcard': {
      const isLast = phase.blockIndex === sc.flashcardBlockCount - 1;
      if (sc.snakeEnabled) {
        return { kind: 'snake', afterBlockIndex: phase.blockIndex };
      }
      if (isLast) return { kind: 'quiz' };
      return { kind: 'flashcard', blockIndex: phase.blockIndex + 1 };
    }
    case 'snake': {
      const nextBlock = phase.afterBlockIndex + 1;
      if (nextBlock >= sc.flashcardBlockCount) return { kind: 'quiz' };
      return { kind: 'flashcard', blockIndex: nextBlock };
    }
    case 'quiz':
      return { kind: 'end' };
    case 'end':
      return phase;
    case 'proctor-builder':
      return phase; // back button uses setPhase, not advancePhase
  }
}
```

**Decision:** snake runs **after** every block when enabled, including the final block, before the quiz. This gives the most consistent delay-before-recall across configurations and matches the current 2-block behavior (the existing `snake` phase runs only between `flashcards-a` and `flashcards-b`; this new behavior adds an extra snake after `flashcard(N-1)` as well — explicitly required by the spec: "After the LAST flashcard block: if snakeEnabled, one more snake, then quiz").

### 6.4 Component binding (in `src/renderer/src/App.tsx`)

```tsx
if (phase.kind === 'welcome') return <WelcomePhase />;
if (phase.kind === 'proctor-builder') return <ProctorBuilder />;
if (phase.kind === 'intro') return <IntroVideoPhase />;
if (phase.kind === 'flashcard') return <FlashcardPhase key={phase.blockIndex} blockIndex={phase.blockIndex} />;
if (phase.kind === 'snake') return <SnakePhase />;
if (phase.kind === 'quiz') return <QuizPhase />;
if (phase.kind === 'end') return <EndPhase />;
```

## 7. Randomization

### 7.1 New signature and algorithm (`src/renderer/src/lib/randomization.ts`)

```ts
import type { ModeAssignment } from '../state/session';

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
```

`shuffle<T>` is the existing Fisher–Yates helper; keep it in the same file (it is already there).

### 7.2 Worked example: 7 people across 3 modes

- `enabledModes = [1, 3, 4]` (mode 2 disabled).
- `n = 7`, `m = 3`, `base = 2`, `remainder = 1`.
- `shuffledModes = [3, 1, 4]` (example draw).
- `bonusModes = {3}` — the first `remainder=1` modes of the shuffled list.
- `targets = { 3: 3, 1: 2, 4: 2 }` — 3 gets the extra, others get base.
- `shuffledPeople = [P7, P2, P5, P1, P6, P4, P3]` (example draw).
- Distribution pass in shuffled-mode order `[3, 1, 4]`:
  - mode 3: P7, P2, P5
  - mode 1: P1, P6
  - mode 4: P4, P3
- Result: `{P7:3, P2:3, P5:3, P1:1, P6:1, P4:4, P3:4}`.

This guarantees that the extras are spread across distinct modes — never stacked onto a single mode.

### 7.3 Even-split indicator (renderer helper, `src/renderer/src/lib/evenSplit.ts`)

```ts
export function describeEvenSplit(
  peopleCount: number,
  modeCount: number,
): { even: boolean; base: number; remainder: number; message: string } {
  if (peopleCount === 0 || modeCount === 0) {
    return { even: true, base: 0, remainder: 0, message: 'Select people to see the split.' };
  }
  const base = Math.floor(peopleCount / modeCount);
  const remainder = peopleCount % modeCount;
  if (remainder === 0) {
    return {
      even: true,
      base,
      remainder,
      message: `Even split — ${base} ${base === 1 ? 'person' : 'people'} per mode across ${modeCount} modes.`,
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
      `Uneven: ${highModes} ${highModes === 1 ? 'mode would have' : 'modes would have'} ${high} people, ` +
      `${lowModes} ${lowModes === 1 ? 'mode would have' : 'modes would have'} ${base}.`,
  };
}
```

The builder displays `message` verbatim under the people grid / mode toggles.

## 8. Welcome page contract

**File:** `src/renderer/src/phases/WelcomePhase.tsx` (modify).

### 8.1 Visible fields (all on one screen)

1. **First name** (`Input`, required, trimmed)
2. **Last name** (`Input`, required, trimmed)
3. **Email** (`Input`, required, matches `EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/` — unchanged)
4. **Upload study file** — a labeled button "Load study file" that calls `window.api.showStudyFileOpenDialog()`. When loaded, shows the file name (basename of `filePath`) and the count of people/modes beneath it. On validation error, shows a red error string under the button.
5. **Gear icon** — top-right of the welcome layout, outside the form column. Clicking opens the proctor password modal.
6. **Begin study button** — disabled until: `firstName.trim() && lastName.trim() && EMAIL_RE.test(email.trim()) && studyConfig !== null`.

### 8.2 Local state shape

```ts
type StudyFileState =
  | { kind: 'none' }
  | { kind: 'loading' }
  | { kind: 'loaded'; filePath: string; config: StudyConfig; resolvedPeople: Person[] }
  | { kind: 'error'; message: string };
```

### 8.3 `handleBegin` — updated

```ts
async function handleBegin() {
  if (!valid || submitting || studyFile.kind !== 'loaded') return;
  setSubmitting(true);
  audio.init();

  const intake = { firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim() };
  const selectedPeople = studyFile.resolvedPeople;
  const modeAssignment = assignModes(selectedPeople, studyFile.config.enabledModes);

  try {
    const { participantId } = await window.api.startSession(intake);
    await window.api.logEvent({
      type: 'session.start',
      t: Date.now(),
      participantId,
      intake,
      modeAssignment,
      people: selectedPeople.map((p) => ({ id: p.id, firstName: p.firstName })),
      studyConfigId: studyFile.config.id,
      blockCount: studyFile.config.flashcardBlockCount,
      enabledModes: studyFile.config.enabledModes,
    });

    void audio.preload(selectedPeople.map((p) => p.audioUrl));

    dispatch({ type: 'setPeople', people: selectedPeople });
    dispatch({ type: 'setModeAssignment', modeAssignment });
    dispatch({ type: 'setStudyConfig', studyConfig: studyFile.config });
    dispatch({ type: 'startSession', participantId, intake });
    dispatch({ type: 'advancePhase' });
  } catch (err) {
    console.error('startSession failed:', err);
    setSubmitting(false);
  }
}
```

### 8.4 Gear / proctor gate

Local state:

```ts
const [proctorModal, setProctorModal] = useState<
  { kind: 'closed' } | { kind: 'prompt' } | { kind: 'error' }
>({ kind: 'closed' });
const [passwordAttempt, setPasswordAttempt] = useState('');
```

- Gear button (icon-only, top-right, absolutely positioned) sets `proctorModal` to `{ kind: 'prompt' }`.
- Modal shows a password `Input` (type="password"), Cancel, and Enter. Enter checks `passwordAttempt === 'JAD'`.
  - Correct: `dispatch({ type: 'setPhase', phase: { kind: 'proctor-builder' } })` then close modal.
  - Incorrect: switch to `{ kind: 'error' }` variant which shows "Incorrect password." inline, and clears the input. No throttling (per requirement "rejects silently / shows error").
- Modal closes on Cancel, on Esc, or on successful submit.

**Decision:** the gear is an `Icon.Gear` via an inline SVG (no new icon dep). The modal is a simple fixed-positioned `<div>` overlay; no new dependency on radix/dialog since shadcn primitives aren't yet installed.

## 9. Proctor builder contract

**File:** `src/renderer/src/phases/ProctorBuilder/index.tsx` (new). Subcomponents live in the same folder as separate `.tsx` files per CLAUDE.md rule "extract reusable components."

### 9.1 Component tree

```
<ProctorBuilder>                                    (top-level page)
  <ProctorHeader>                                   (title + back + save + load)
    <Button variant="default" onClick={onBack}>Back to welcome</Button>
    <Button onClick={onSave}>Save study file</Button>
    <Button onClick={onLoad}>Load existing file</Button>
  </ProctorHeader>

  <PeoplePickerSection>
    <SelectAllToggle ... />
    <PeopleGrid>
      {people.map(p => <PersonCard ... />)}
    </PeopleGrid>
    <EvenSplitIndicator message={...} />
    <PersonPreviewModal ... />                      (conditional)
  </PeoplePickerSection>

  <ConfigSection>
    <NumberField label="Flashcard blocks" min=1 max=10 ... />
    <NumberField label="Block duration (sec)" min=10 ... />
    <ToggleField label="Snake enabled" ... />
    <NumberField label="Snake duration (sec)" min=10 disabled={!snakeEnabled} ... />
    <ModeCheckboxGroup enabledModes={...} ... />
  </ConfigSection>

  <ErrorBanner message={...} />                     (conditional)
</ProctorBuilder>
```

### 9.2 Form state reducer

```ts
type BuilderState = {
  selectedUuids: Set<string>;           // person UUIDs
  flashcardBlockCount: number;          // default 2
  flashcardBlockDurationSec: number;    // default 60
  snakeEnabled: boolean;                // default true
  snakeDurationSec: number;             // default 60
  enabledModes: Set<Mode>;              // default new Set([1,2,3,4])
  previewingUuid: string | null;        // for PersonPreviewModal
  error: string | null;
};

const initialBuilderState: BuilderState = {
  selectedUuids: new Set(),
  flashcardBlockCount: 2,
  flashcardBlockDurationSec: 60,
  snakeEnabled: true,
  snakeDurationSec: 60,
  enabledModes: new Set([1, 2, 3, 4]),
  previewingUuid: null,
  error: null,
};
```

### 9.3 Control behaviors

| Control | Data source | On-change | Validation on save |
|---|---|---|---|
| People grid cards | `people = await window.api.getPeopleWithUuids()` on mount | toggles `selectedUuids` | `selectedUuids.size >= 1` |
| Select all / Deselect all toggle | derived: `all = selectedUuids.size === people.length` | Flips selected set between `people.map(p => p.uuid)` and `new Set()` | n/a |
| Person preview | click on card body (not the checkbox area) sets `previewingUuid` | Renders a modal `<video src={person.videoUrl} controls muted={false} autoPlay />` with a Close button | n/a |
| Block count `Input type="number"` | `flashcardBlockCount` | clamps `1..10` | required, int |
| Block duration `Input type="number"` | `flashcardBlockDurationSec` | clamps `>=10` | required, int |
| Snake enabled checkbox | `snakeEnabled` | toggles | n/a |
| Snake duration `Input type="number"` | `snakeDurationSec` | disabled when `!snakeEnabled` | required, int, `>=10` (sent regardless) |
| Mode checkboxes × 4 | `enabledModes` | toggles `Set<Mode>` | `enabledModes.size >= 1` |

**Decision:** snake duration value is ALWAYS serialized even when snake is disabled, because `snakeDurationSec` is required in the schema. The UI shows the field grayed out but preserves whatever value was last typed.

### 9.4 Save flow

```ts
async function handleSave() {
  // 1. Build StudyConfig
  const people = Array.from(state.selectedUuids);
  if (people.length === 0) { setError('Pick at least one person.'); return; }
  if (state.enabledModes.size === 0) { setError('Enable at least one mode.'); return; }

  const cfg: StudyConfig = {
    version: 1,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    people,
    flashcardBlockCount: state.flashcardBlockCount,
    flashcardBlockDurationSec: state.flashcardBlockDurationSec,
    snakeEnabled: state.snakeEnabled,
    snakeDurationSec: state.snakeDurationSec,
    enabledModes: Array.from(state.enabledModes).sort((a, b) => a - b),
  };

  // 2. Hand to main for native save dialog + write
  try {
    const result = await window.api.showStudyFileSaveDialog(cfg);
    if (!result) return; // user cancelled
    setError(null); // success (no navigation; stay on builder)
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Save failed');
  }
}
```

### 9.5 Load flow

```ts
async function handleLoad() {
  try {
    const result = await window.api.showStudyFileOpenDialog();
    if (!result) return;
    // Populate form
    dispatch({ type: 'loadFromConfig', config: result.config });
    setError(null);
  } catch (err) {
    setError(`Could not load file: ${err instanceof Error ? err.message : String(err)}`);
  }
}
```

Reducer action `loadFromConfig`:

```ts
case 'loadFromConfig': return {
  ...state,
  selectedUuids: new Set(action.config.people),
  flashcardBlockCount: action.config.flashcardBlockCount,
  flashcardBlockDurationSec: action.config.flashcardBlockDurationSec,
  snakeEnabled: action.config.snakeEnabled,
  snakeDurationSec: action.config.snakeDurationSec,
  enabledModes: new Set(action.config.enabledModes),
  error: null,
};
```

### 9.6 Back-to-welcome

```ts
function handleBack() {
  dispatch({ type: 'setPhase', phase: { kind: 'welcome' } });
  // Builder's local state disappears with unmount — no need to reset
}
```

**Decision:** no prompt on back, no autosave. Unsaved changes are discarded silently per requirement "(does NOT carry any partial form state across)."

### 9.7 Even-split indicator placement

Under the `PeoplePicker` grid, above `ConfigSection`, rendered via `describeEvenSplit(state.selectedUuids.size, state.enabledModes.size)`. Re-renders on every relevant state change.

### 9.8 Styling notes (follow `Layout.tsx`, minimalism)

- No borders, no decorative dividers. Use `gap-N` and vertical rhythm.
- Grid: `grid grid-cols-4 gap-6` (adjust for density). Each card is an 80×80 square PFP with the first name underneath in `text-sm text-neutral-600`.
- Selected state: thin ring `ring-2 ring-neutral-900` on the image only.
- Numeric fields reuse existing `<Input>` and `<Label>` primitives; no new form primitive needed.
- Mode checkboxes: native `<input type="checkbox">` with a `<Label>` next to each, labeled "Mode 1", "Mode 2", "Mode 3", "Mode 4". A single line of help text under them: "1 = phrase+text, 2 = phrase+audio, 3 = no-phrase+text, 4 = no-phrase+audio."
- Preview modal: fixed inset overlay, centered 480px panel, minimal chrome, one `<video>`, one Close button.
- The builder uses the full window width (not the constrained 480px column the participant layout uses) so the grid can breathe. Use a separate `<WideLayout>` wrapper (new component at `src/renderer/src/components/WideLayout.tsx`) or inline the container directly in the builder.

**UI engineer: invoke the `frontend-design` skill before writing any builder JSX.**

## 10. Config migration

### 10.1 `app/resources/config.default.json`

Before:
```json
{
  "numberOfPeople": 16,
  "numFlashcardSessions": 2,
  "flashcardSessionDurationSec": 420,
  "snakeDurationSec": 120,
  "recallTimePerFaceSec": 15,
  "phraseMinChars": 8,
  "fuzzyMatchMaxEdits": 2,
  "mandatorySecondVideoPlay": true,
  "assetsPath": "./People",
  "exportPath": "./exports"
}
```

After:
```json
{
  "recallTimePerFaceSec": 15,
  "phraseMinChars": 8,
  "fuzzyMatchMaxEdits": 2,
  "mandatorySecondVideoPlay": true,
  "assetsPath": "./People",
  "exportPath": "./exports"
}
```

### 10.2 `src/main/config.ts` — `AppConfigSchema`

Before:
```ts
export const AppConfigSchema = z.object({
  numberOfPeople: z.number().int().positive(),
  numFlashcardSessions: z.number().int().positive(),
  flashcardSessionDurationSec: z.number().positive(),
  snakeDurationSec: z.number().positive(),
  recallTimePerFaceSec: z.number().positive(),
  phraseMinChars: z.number().int().nonnegative(),
  fuzzyMatchMaxEdits: z.number().int().nonnegative(),
  mandatorySecondVideoPlay: z.boolean(),
  assetsPath: z.string().min(1),
  exportPath: z.string().min(1),
});
```

After:
```ts
export const AppConfigSchema = z.object({
  recallTimePerFaceSec: z.number().positive(),
  phraseMinChars: z.number().int().nonnegative(),
  fuzzyMatchMaxEdits: z.number().int().nonnegative(),
  mandatorySecondVideoPlay: z.boolean(),
  assetsPath: z.string().min(1),
  exportPath: z.string().min(1),
});
```

**Decision:** existing user `config.json` files on disk may still contain the removed keys. Because `z.object` in zod v4 is strict only when `.strict()` is called, **leave the existing `AppConfigSchema` NON-strict** so stale keys are silently dropped. This avoids breaking existing installs. (Double-check: confirm current behavior — the existing schema is not `.strict()`, so stale keys are already ignored. Keep it that way.)

### 10.3 `src/types/global.d.ts` — `AppConfig`

Before:
```ts
type AppConfig = {
  numberOfPeople: number;
  flashcardSessionDurationSec: number;
  snakeDurationSec: number;
  recallTimePerFaceSec: number;
  phraseMinChars: number;
  fuzzyMatchMaxEdits: number;
  mandatorySecondVideoPlay: boolean;
  assetsPath: string;
  exportPath: string;
};
```

After:
```ts
type AppConfig = {
  recallTimePerFaceSec: number;
  phraseMinChars: number;
  fuzzyMatchMaxEdits: number;
  mandatorySecondVideoPlay: boolean;
  assetsPath: string;
  exportPath: string;
};
```

### 10.4 Replacement reads

| Current read | New source |
|---|---|
| `config.numberOfPeople` (in `WelcomePhase`) | removed — people come from `studyConfig.people` resolved to `Person[]` |
| `config.flashcardSessionDurationSec` (in `FlashcardPhase`) | `studyConfig.flashcardBlockDurationSec` via `useSession()` |
| `config.snakeDurationSec` (in `SnakePhase`) | `studyConfig.snakeDurationSec` via `useSession()` |
| `config.numFlashcardSessions` (README only) | `studyConfig.flashcardBlockCount`; remove from README |

**Decision:** phases that need study-variable timing read from `useSession().studyConfig`, NOT from `window.api.getConfig()`. This means `SnakePhase` and `FlashcardPhase` no longer call `getConfig()` at all. `IntroVideoPhase` and `QuizPhase` continue to call `getConfig()` because they still read `phraseMinChars`, `mandatorySecondVideoPlay`, `recallTimePerFaceSec`, `fuzzyMatchMaxEdits`.

If `studyConfig` is null during a non-welcome phase, throw — it is a programmer error (welcome gates entry).

### 10.5 README update (`README.md`)

Remove these rows from the Configuring the study table: `numberOfPeople`, `numFlashcardSessions`, `flashcardSessionDurationSec`, `snakeDurationSec`. Add one sentence noting: "`numberOfPeople`, flashcard block count/duration, and snake duration are now part of the study file loaded on the welcome screen."

## 11. Event log compatibility

### 11.1 `SessionEvent` type changes (both `src/types/global.d.ts` and `src/main/session-writer.ts`)

- `session.start` gains three fields: `studyConfigId: string`, `blockCount: number`, `enabledModes: Mode[]`.
- `flashcard.show.sessionLabel: 'A' | 'B'` becomes `flashcard.show.blockLabel: string` (values `"1"`, `"2"`, ... as 1-indexed stringified block index).
- `flashcard.refill.sessionLabel: 'A' | 'B'` becomes `flashcard.refill.blockLabel: string` similarly.

Rationale: `blockLabel` is a string so the CSV column remains uniform and downstream scripts can treat it as categorical; `"1"`/`"2"` is a straight substitution for `"A"`/`"B"` without introducing `number`-valued cells that change header types.

**Decision:** the field is renamed from `sessionLabel` to `blockLabel`. Any downstream scripts referencing `sessionLabel` must update. The rename is documented here as a breaking change for analysis scripts, but the CSV header is stable (we also update the header — `sessionLabel` → `blockLabel` in `study_log.csv`).

### 11.2 `buildStudyLogRows` update (`src/main/session-writer.ts`)

Current row shape:
```ts
{ timestamp, personId, mode, sessionLabel, durationMs, bucket }
```

New row shape:
```ts
{ timestamp, personId, mode, blockLabel, durationMs, bucket }
```

Column ordering preserved except rename.

### 11.3 `FlashcardPhase` emit change

```ts
void window.api.logEvent({
  type: 'flashcard.show',
  t: Date.now(),
  personId: currentPerson.id,
  mode,
  blockLabel: String(blockIndex + 1),
});
```

And on refill:

```ts
void window.api.logEvent({
  type: 'flashcard.refill',
  t: Date.now(),
  blockLabel: String(blockIndex + 1),
});
```

### 11.4 `session.start` emit change

See section 8.3. Adds `studyConfigId`, `blockCount`, `enabledModes`. `session.json` output naturally carries these through since it writes `startEv` unchanged.

### 11.5 Downstream compat

- `recall.csv`: unchanged columns (no `sessionLabel` in recall).
- `memory_phrases.csv`: unchanged.
- `study_log.csv`: one column renamed `sessionLabel` → `blockLabel`. Values go from `"A" | "B"` to `"1" | "2" | "3" | ...`. Downstream analysis scripts must update their column name; no value-parsing beyond string comparison.
- `session.json`: gains `studyConfigId`, `blockCount`, `enabledModes` at the top level (via `startEv` inclusion) — additive, safe for downstream that ignores unknown keys.
- `events.jsonl`: additive + rename per above.

## 12. File-by-file change list

**Legend:** **N**ew · **M**odify · **D**elete

### 12.1 Main process / Node

| File | Status | Owner | Notes |
|---|---|---|---|
| `src/main/peopleRegistry.ts` | N | Foundation | UUID registry load/init/save, `resolveUuidsToPeople`, `personUuid` |
| `src/main/studyConfig.ts` | N | Foundation | `StudyConfigZ`, `StudyConfig` type, `resolvePeopleOrThrow`, helper constants |
| `src/main/index.ts` | M | Foundation | Call `scanPeople()` + `loadOrInitRegistry(scanned)` after `loadConfig()` |
| `src/main/ipc.ts` | M | Foundation | Add 6 new channels (section 4) |
| `src/main/config.ts` | M | Foundation | Remove 4 fields from `AppConfigSchema` (section 10.2) |
| `src/main/session-writer.ts` | M | Foundation | Update `SessionEvent` types (`session.start`, `flashcard.show`, `flashcard.refill`), update `buildStudyLogRows` column name |
| `src/main/assets.ts` | — | — | Unchanged |
| `src/main/csv.ts` | — | — | Unchanged |
| `src/main/protocol.ts` | — | — | Unchanged |

### 12.2 Preload

| File | Status | Owner | Notes |
|---|---|---|---|
| `src/preload/index.ts` | M | Foundation | Add 6 new methods to `api` |

### 12.3 Renderer — state + libs (foundation)

| File | Status | Owner | Notes |
|---|---|---|---|
| `src/renderer/src/state/session.ts` | M | Foundation | New `Phase` variants, new `SessionState.studyConfig`, new actions, updated `nextPhase(phase, studyConfig)`, updated reducer |
| `src/renderer/src/state/SessionProvider.tsx` | M | Foundation | `dispatch({ type: 'advancePhase' })` now requires the reducer to pass `state.studyConfig` — wrap reducer via closure or pass `studyConfig` as second arg inside `sessionReducer` (already state member, so no API change) |
| `src/renderer/src/lib/randomization.ts` | M | Foundation | New `assignModes` signature, remove 16-hard-split logic |
| `src/renderer/src/lib/evenSplit.ts` | N | Foundation | `describeEvenSplit` helper (section 7.3) |
| `src/renderer/src/lib/studyConfigClient.ts` | N | Foundation | Re-exports `StudyConfig` type from main-shared file + lightweight client helpers. **Decision:** the Zod schema lives in `src/main/studyConfig.ts` and is imported by main-side IPC handlers only. The renderer trusts the type from `global.d.ts` and does not re-validate on the hot path (main already validated). |

### 12.4 Renderer — phases and components (UI)

| File | Status | Owner | Notes |
|---|---|---|---|
| `src/renderer/src/App.tsx` | M | UI | Phase switcher: drop `flashcards-a`/`flashcards-b`, add `flashcard` and `proctor-builder` |
| `src/renderer/src/phases/WelcomePhase.tsx` | M | UI | Single-screen redesign per section 8; add gear + proctor modal; add study-file loader |
| `src/renderer/src/phases/ProctorBuilder/index.tsx` | N | UI | Top-level builder page |
| `src/renderer/src/phases/ProctorBuilder/PeopleGrid.tsx` | N | UI | Grid of `PersonCard`s + select-all toggle |
| `src/renderer/src/phases/ProctorBuilder/PersonCard.tsx` | N | UI | Thumbnail + name + selected state + click-to-preview |
| `src/renderer/src/phases/ProctorBuilder/PersonPreviewModal.tsx` | N | UI | Modal with `<video>` player |
| `src/renderer/src/phases/ProctorBuilder/ConfigSection.tsx` | N | UI | Block count, durations, snake toggle, mode checkboxes |
| `src/renderer/src/phases/ProctorBuilder/reducer.ts` | N | UI | Builder local reducer (`BuilderState`, actions) |
| `src/renderer/src/phases/ProctorBuilder/constants.ts` | N | UI | `PROCTOR_PASSWORD = 'JAD'` and default builder values |
| `src/renderer/src/phases/FlashcardPhase.tsx` | M | UI | Props become `{ blockIndex: number }`; drop `sessionLabel`; read duration from `useSession().studyConfig.flashcardBlockDurationSec`; emit `blockLabel` |
| `src/renderer/src/phases/SnakePhase.tsx` | M | UI | Drop `getConfig()` call; read `useSession().studyConfig.snakeDurationSec` |
| `src/renderer/src/phases/IntroVideoPhase.tsx` | — | — | Unchanged (still reads `phraseMinChars`, `mandatorySecondVideoPlay` from `config.json`) |
| `src/renderer/src/phases/QuizPhase.tsx` | — | — | Unchanged |
| `src/renderer/src/phases/EndPhase.tsx` | — | — | Unchanged |
| `src/renderer/src/components/Layout.tsx` | — | — | Unchanged |
| `src/renderer/src/components/WideLayout.tsx` | N | UI | Optional full-width variant for the builder |
| `src/renderer/src/components/ui/Gear.tsx` | N | UI | Simple inline-SVG gear icon (or co-located in WelcomePhase) |
| `src/renderer/src/components/ProctorPasswordModal.tsx` | N | UI | Reusable modal used by welcome gear. **Decision:** keep it a welcome-only subcomponent inside `WelcomePhase.tsx` if simpler; marked `N` so it's tracked either way |

### 12.5 Types

| File | Status | Owner | Notes |
|---|---|---|---|
| `src/types/global.d.ts` | M | Foundation | Add `StudyConfig`, `PersonWithUuid`, update `AppConfig`, update `SessionEvent` (add `studyConfigId`/`blockCount`/`enabledModes` on `session.start`, rename `sessionLabel`→`blockLabel`), update `Api` |

### 12.6 Resources / docs

| File | Status | Owner | Notes |
|---|---|---|---|
| `resources/config.default.json` | M | Foundation | Strip 4 removed keys (section 10.1) |
| `README.md` (repo root) | M | Foundation | Remove 4 rows from config table, mention study files |
| `docs/EXPERIMENT-BUILDER.md` | N | Foundation | This file |

### 12.7 Totals

- New: **18** files (4 main/shared, 7 builder subfolder, 1 WideLayout, 1 Gear, 1 ProctorPasswordModal — note, PasswordModal may roll up into WelcomePhase; counting generously, conservative count 8; if all builder subcomponents and helpers are counted, 18). **Conservative new-file count: 8** (critical artifacts only: `peopleRegistry.ts`, `studyConfig.ts`, `evenSplit.ts`, `studyConfigClient.ts`, `ProctorBuilder/index.tsx`, `ProctorBuilder/reducer.ts`, `WideLayout.tsx`, `EXPERIMENT-BUILDER.md`). Remaining items in section 12.4 (`PeopleGrid.tsx`, `PersonCard.tsx`, `PersonPreviewModal.tsx`, `ConfigSection.tsx`, `constants.ts`, `Gear.tsx`, `ProctorPasswordModal.tsx`) are left to UI engineer discretion to create or inline; they are structurally recommended but not load-bearing for the contract.

For the report header: **conservative count of 8 new / 13 modified / 0 deleted.**

### 12.8 Parallel-safety of the split

**Foundation engineer does NOT touch** anything in `src/renderer/src/phases/ProctorBuilder/**` or `WelcomePhase.tsx`.

**UI engineer does NOT touch** any file in `src/main/**`, `src/preload/index.ts`, `src/types/global.d.ts`, `src/renderer/src/state/session.ts`, `src/renderer/src/lib/randomization.ts`, or `src/renderer/src/lib/evenSplit.ts`.

**Both engineers read and agree on** section 4 (IPC), section 5 (state shapes), section 6 (phase sequencing), section 7 (randomization), and section 12 (file list). These are the contract.

**Integration order:**
1. Foundation lands first: main process, preload, types, state, randomization, evenSplit. App still compiles and runs the old flow mock (see note below).
2. UI lands second on top: new WelcomePhase + ProctorBuilder.
3. QA runs after both.

Because `FlashcardPhase.tsx` and `SnakePhase.tsx` need to change (sections 10.4 / 11.3), they are in UI's column. However, until UI lands, a **stub `studyConfig`** should be set by the old welcome flow so the app keeps running. **Decision:** foundation, when touching `state/session.ts`, MUST NOT leave the old `flashcards-a`/`flashcards-b` phases in `Phase` — UI will then touch `App.tsx`, `WelcomePhase.tsx`, `FlashcardPhase.tsx`, `SnakePhase.tsx` in one pass to complete the migration. That's ~4 renderer files plus the builder subfolder in UI's column, all of which are untouched by foundation. No file is modified by both engineers.

## 13. Acceptance criteria

### 13.1 UUID registry

- [ ] On first launch, `<userData>/people.json` is created with one entry per person in `People/`.
- [ ] Each UUID matches a uuid v4 pattern.
- [ ] On subsequent launches with unchanged assets, the file is not modified.
- [ ] Adding a new person to `People/` and restarting adds one entry (existing entries unchanged).
- [ ] Removing a person from `People/` and restarting leaves the entry in `people.json` (historical).
- [ ] Corrupt `people.json` triggers the same fatal-error dialog pattern as corrupt `config.json`.

### 13.2 Study file I/O

- [ ] Save dialog offers `study-<timestamp>.hfestudy.json` by default and enforces `.hfestudy.json` suffix.
- [ ] Saved file round-trips through the loader without errors.
- [ ] Loading a file with `"version": 2` fails with "Invalid version" (or equivalent schema message).
- [ ] Loading a file with a UUID not present in the registry fails with a human-readable error naming the missing UUID.
- [ ] Loading a file with empty `people` fails validation.
- [ ] Loading a file with empty `enabledModes` fails validation.
- [ ] Loading a file with `flashcardBlockCount = 0` fails validation.
- [ ] Loading a file with `flashcardBlockCount = 11` fails validation.
- [ ] Loading a file with `flashcardBlockDurationSec = 5` fails validation.

### 13.3 Welcome page

- [ ] All four inputs (first name, last name, email, study file) are on one screen.
- [ ] "Begin study" is disabled until all four are satisfied.
- [ ] The gear icon is visible in the top-right.
- [ ] Clicking gear opens a modal with a password field.
- [ ] Wrong password shows an inline error and clears the field; does not navigate.
- [ ] Correct password `JAD` navigates to the proctor builder.
- [ ] Pressing Esc or Cancel closes the modal without navigating.

### 13.4 Proctor builder

- [ ] Opens fresh with defaults: 0 selected, 2 blocks, 60s block, snake on, 60s snake, all 4 modes on.
- [ ] People grid shows every person from `getPeopleWithUuids()` with PFP and first name.
- [ ] Clicking a person card toggles selection (visible ring).
- [ ] "Select all" selects every person; "Deselect all" clears. Toggle button label reflects current state.
- [ ] Clicking a person card (or a preview affordance) opens a modal with that person's intro video playing.
- [ ] Block count input clamps to 1..10.
- [ ] Block duration input clamps to >=10.
- [ ] Snake toggle hides/disables the snake duration input.
- [ ] At least one mode must remain checked — unchecking the last one is refused or the save button is disabled.
- [ ] Even-split indicator updates live as selection and mode toggles change.
- [ ] For 7 people + 3 modes, indicator reads `"Uneven: 1 mode would have 3 people, 2 modes would have 2."`
- [ ] For 9 people + 3 modes, indicator reads `"Even split — 3 people per mode across 3 modes."`
- [ ] "Save study file" opens a native Save dialog. Cancelling is a no-op. Saving writes a file parseable by the loader.
- [ ] "Load existing file" opens a native Open dialog; loading a valid file populates all form fields.
- [ ] "Load existing file" with an invalid file shows an inline error and does not corrupt the current form state.
- [ ] "Back to welcome" returns to the welcome phase with the participant form pristine.

### 13.5 Session flow

- [ ] With `flashcardBlockCount = 2`, `snakeEnabled = true`: flow is `welcome → intro → F(0) → snake → F(1) → snake → quiz → end`. Two snake phases total.
- [ ] With `flashcardBlockCount = 3`, `snakeEnabled = true`: flow is `welcome → intro → F(0) → snake → F(1) → snake → F(2) → snake → quiz → end`. Three snake phases total.
- [ ] With `flashcardBlockCount = 2`, `snakeEnabled = false`: flow is `welcome → intro → F(0) → F(1) → quiz → end`. No snake.
- [ ] With `flashcardBlockCount = 1`, `snakeEnabled = true`: flow is `welcome → intro → F(0) → snake → quiz → end`.
- [ ] Each flashcard phase uses `studyConfig.flashcardBlockDurationSec` as its timer.
- [ ] Each snake phase uses `studyConfig.snakeDurationSec` as its timer.

### 13.6 Randomization

- [ ] For 7 people × 3 modes, no mode gets more than ⌈7/3⌉=3 people and no mode has fewer than ⌊7/3⌋=2.
- [ ] Over 100 random trials, the "extra" person distribution across modes is uniform (no mode is systematically favored).
- [ ] With 0 people, returns `{}` (empty assignment).

### 13.7 Event log and CSV

- [ ] `session.start` event contains `studyConfigId`, `blockCount`, `enabledModes`.
- [ ] `flashcard.show` events contain `blockLabel: "1"` in block 0, `"2"` in block 1, etc.
- [ ] `study_log.csv` has column `blockLabel` (not `sessionLabel`).
- [ ] `recall.csv`, `memory_phrases.csv` are unchanged in shape.
- [ ] `session.json` top-level contains `events` array with the same new fields.

### 13.8 Config

- [ ] Launch with a pre-existing `config.json` that still has the four removed keys: app loads, ignores extra keys, does not crash.
- [ ] `config.default.json` no longer contains `numberOfPeople`, `numFlashcardSessions`, `flashcardSessionDurationSec`, `snakeDurationSec`.
- [ ] `AppConfigSchema` no longer lists those four fields.
- [ ] Intro and quiz phases continue to read `phraseMinChars`, `mandatorySecondVideoPlay`, `recallTimePerFaceSec`, `fuzzyMatchMaxEdits` from `config.json` (unchanged behavior).

### 13.9 Typecheck, lint, build

- [ ] `npm run typecheck` passes.
- [ ] `npm run lint` passes.
- [ ] `npm run build` produces `out/` without errors.
- [ ] No references to `flashcards-a`, `flashcards-b`, `sessionLabel` (in code), `numberOfPeople` (in code), `numFlashcardSessions`, `flashcardSessionDurationSec`, or `snakeDurationSec` remain anywhere in `src/`.

---

## Critical Files for Implementation

- `/Users/grantsherman/Documents/GitHub/HFEstudy/app/src/main/studyConfig.ts` (new — Zod schema and resolver)
- `/Users/grantsherman/Documents/GitHub/HFEstudy/app/src/main/peopleRegistry.ts` (new — UUID persistence and lookup)
- `/Users/grantsherman/Documents/GitHub/HFEstudy/app/src/renderer/src/state/session.ts` (modify — phase model, studyConfig field, new actions, new sequencer)
- `/Users/grantsherman/Documents/GitHub/HFEstudy/app/src/renderer/src/lib/randomization.ts` (modify — new `assignModes` signature and even-distribution algorithm)
- `/Users/grantsherman/Documents/GitHub/HFEstudy/app/src/renderer/src/phases/ProctorBuilder/index.tsx` (new — entire builder UI)