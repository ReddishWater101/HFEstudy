import JSZip from 'jszip';

// ---------------------------------------------------------------------------
// Module-level session state
// ---------------------------------------------------------------------------

let sessionParticipantId: string | null = null;
let sessionIntake: IntakeData | null = null;
let sessionEvents: SessionEvent[] = [];

// ---------------------------------------------------------------------------
// Helpers: CSV
// ---------------------------------------------------------------------------

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const lines: string[] = [];
  lines.push(headers.map(escapeCell).join(','));
  for (const row of rows) {
    lines.push(headers.map((h) => escapeCell(row[h])).join(','));
  }
  return lines.join('\n') + '\n';
}

function fmtTimestamp(epochMs: number): string {
  const d = new Date(epochMs);
  const date = d.toLocaleDateString('en-CA'); // YYYY-MM-DD
  const time = d.toLocaleTimeString('en-GB', { hour12: false }); // HH:MM:SS
  return `${date} ${time}`;
}

// ---------------------------------------------------------------------------
// Helpers: fetch people.json (cached)
// ---------------------------------------------------------------------------

let peopleCache: PersonWithUuid[] | null = null;

async function fetchPeople(): Promise<PersonWithUuid[]> {
  if (peopleCache) return peopleCache;
  const res = await fetch('./people.json');
  if (!res.ok) throw new Error(`Failed to fetch people.json: ${res.status}`);
  peopleCache = (await res.json()) as PersonWithUuid[];
  return peopleCache;
}

// ---------------------------------------------------------------------------
// Helpers: trigger browser file download
// ---------------------------------------------------------------------------

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  // Clean up after a brief delay so the download starts
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

// ---------------------------------------------------------------------------
// Helpers: CSV row builders (match Electron version exactly)
// ---------------------------------------------------------------------------

type SessionStartEvent = Extract<SessionEvent, { type: 'session.start' }>;
type FlashcardShowEvent = Extract<SessionEvent, { type: 'flashcard.show' }>;

function buildRecallRows(
  events: SessionEvent[],
  modeAssignment: Record<string, Mode>,
): Record<string, unknown>[] {
  const trueNameByPerson = new Map<string, string>();
  for (const ev of events) {
    if (ev.type === 'quiz.show') {
      trueNameByPerson.set(ev.personId, ev.trueName);
    }
  }
  const rows: Record<string, unknown>[] = [];
  for (const ev of events) {
    if (ev.type === 'quiz.answer') {
      rows.push({
        personId: ev.personId,
        trueName: trueNameByPerson.get(ev.personId) ?? '',
        typedName: ev.typed,
        correct: ev.correct,
        editDistance: ev.editDistance,
        rtSec: +(ev.rtMs / 1000).toFixed(2),
        mode: modeAssignment[ev.personId] ?? '',
        timestamp: fmtTimestamp(ev.t),
      });
    } else if (ev.type === 'quiz.idk') {
      rows.push({
        personId: ev.personId,
        trueName: trueNameByPerson.get(ev.personId) ?? '',
        typedName: 'IDK',
        correct: false,
        editDistance: '',
        rtSec: +(ev.rtMs / 1000).toFixed(2),
        mode: modeAssignment[ev.personId] ?? '',
        timestamp: fmtTimestamp(ev.t),
      });
    } else if (ev.type === 'quiz.timeout') {
      rows.push({
        personId: ev.personId,
        trueName: trueNameByPerson.get(ev.personId) ?? '',
        typedName: '',
        correct: false,
        editDistance: '',
        rtSec: '',
        mode: modeAssignment[ev.personId] ?? '',
        timestamp: fmtTimestamp(ev.t),
      });
    }
  }
  return rows;
}

function buildStudyLogRows(events: SessionEvent[]): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  const pendingShow = new Map<string, FlashcardShowEvent>();
  for (const ev of events) {
    if (ev.type === 'flashcard.show') {
      pendingShow.set(ev.personId, ev);
    } else if (ev.type === 'flashcard.bucket') {
      const show = pendingShow.get(ev.personId);
      if (show) {
        rows.push({
          timestamp: fmtTimestamp(show.t),
          personId: show.personId,
          mode: show.mode,
          blockLabel: show.blockLabel,
          durationSec: +(ev.durationMs / 1000).toFixed(2),
          bucket: ev.bucket,
        });
        pendingShow.delete(ev.personId);
      }
    }
  }
  return rows;
}

function buildMemoryPhraseRows(
  events: SessionEvent[],
  modeAssignment: Record<string, Mode>,
  people: { id: string; firstName: string }[],
): Record<string, unknown>[] {
  const phraseByPerson = new Map<string, string>();
  for (const ev of events) {
    if (ev.type === 'intro.phrase.input') {
      phraseByPerson.set(ev.personId, ev.phrase);
    }
  }
  const peopleById = new Map(people.map((p) => [p.id, p.firstName]));
  const rows: Record<string, unknown>[] = [];
  for (const personId of Object.keys(modeAssignment)) {
    const phrase = phraseByPerson.get(personId) ?? '';
    rows.push({
      personId,
      firstName: peopleById.get(personId) ?? '',
      mode: modeAssignment[personId],
      hasPhrase: phrase.length > 0,
      phrase,
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// API implementations
// ---------------------------------------------------------------------------

async function getConfig(): Promise<AppConfig> {
  return {
    recallTimePerFaceSec: 15,
    phraseMinChars: 8,
    fuzzyMatchMaxEdits: 2,
    mandatorySecondVideoPlay: true,
    assetsPath: './People',
    exportPath: './exports',
  };
}

async function getPeopleWithUuids(): Promise<PersonWithUuid[]> {
  return fetchPeople();
}

async function getRegistry(): Promise<UuidRegistry> {
  const people = await fetchPeople();
  const entries: Record<string, string> = {};
  for (const p of people) {
    entries[p.firstName] = p.uuid;
  }
  return { version: 1, entries };
}

async function readStudyFile(): Promise<{ config: StudyConfig; resolvedPeople: Person[] }> {
  throw new Error('readStudyFile is not supported in web mode');
}

async function writeStudyFile(): Promise<void> {
  throw new Error('writeStudyFile is not supported in web mode');
}

async function showStudyFileOpenDialog(): Promise<{
  filePath: string;
  config: StudyConfig;
  resolvedPeople: Person[];
} | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.hfestudy.json';
    input.style.display = 'none';

    // Track whether the user made a selection
    let selected = false;

    input.addEventListener('change', async () => {
      selected = true;
      const file = input.files?.[0];
      document.body.removeChild(input);

      if (!file) {
        resolve(null);
        return;
      }

      try {
        const text = await file.text();
        const config = JSON.parse(text) as StudyConfig;

        // Validate basic shape
        if (config.version !== 1 || !Array.isArray(config.people)) {
          throw new Error('Invalid study file: missing version or people array');
        }

        // Fetch people.json for resolving UUIDs
        const allPeople = await fetchPeople();
        const peopleByFirstName = new Map(allPeople.map((p) => [p.firstName, p]));

        // Build resolved people in the order of config.people (UUIDs)
        const resolvedPeople: Person[] = [];
        const personMap = config.personMap ?? {};

        for (const uuid of config.people) {
          const firstName = personMap[uuid];
          if (!firstName) continue;

          const person = peopleByFirstName.get(firstName);
          if (person) {
            resolvedPeople.push({
              id: person.id,
              firstName: person.firstName,
              imageUrl: person.imageUrl,
              videoUrl: person.videoUrl,
              audioUrl: person.audioUrl,
            });
          }
        }

        resolve({ filePath: file.name, config, resolvedPeople });
      } catch (err) {
        console.error('Failed to parse study file:', err);
        resolve(null);
      }
    });

    // Handle cancel: when focus returns to the window without a selection
    const handleFocus = (): void => {
      // Use a timeout because the focus event fires before the change event
      setTimeout(() => {
        if (!selected) {
          document.body.removeChild(input);
          resolve(null);
        }
        window.removeEventListener('focus', handleFocus);
      }, 500);
    };

    document.body.appendChild(input);
    window.addEventListener('focus', handleFocus);
    input.click();
  });
}

async function showStudyFileSaveDialog(
  config: StudyConfig,
): Promise<{ filePath: string } | null> {
  // Build personMap: map UUIDs to firstNames
  const allPeople = await fetchPeople();
  const peopleByUuid = new Map(allPeople.map((p) => [p.uuid, p.firstName]));

  const personMap: Record<string, string> = {};
  for (const uuid of config.people) {
    const firstName = peopleByUuid.get(uuid);
    if (firstName) {
      personMap[uuid] = firstName;
    }
  }

  const configWithMap = { ...config, personMap };
  const json = JSON.stringify(configWithMap, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const filename = `study-${Date.now()}.hfestudy.json`;

  triggerDownload(blob, filename);
  return { filePath: filename };
}

async function startSession(
  intake: IntakeData,
): Promise<{ participantId: string; sessionDir: string }> {
  const participantId = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  sessionParticipantId = participantId;
  sessionIntake = intake;
  sessionEvents = [];
  return { participantId, sessionDir: 'browser-session' };
}

async function logEvent(event: SessionEvent): Promise<void> {
  sessionEvents.push(event);
}

async function finalizeSession(): Promise<{ exportDir: string }> {
  sessionEvents.push({ type: 'session.finalize', t: Date.now() });
  return { exportDir: 'browser-session' };
}

async function copySessionTo(): Promise<void> {
  // No-op in browser
}

async function showExportDialog(): Promise<string | null> {
  // No-op in browser
  return null;
}

async function downloadSessionZip(): Promise<{ zipPath: string }> {
  const events = sessionEvents;

  // Extract session.start event for metadata
  const startEv = events.find(
    (e): e is SessionStartEvent => e.type === 'session.start',
  );

  const modeAssignment = startEv?.modeAssignment ?? {};
  const people = startEv?.people ?? [];
  const intake = startEv?.intake ?? sessionIntake;

  // Build session JSON
  const sessionJson = {
    participantId: sessionParticipantId,
    intake,
    modeAssignment,
    people,
    events,
  };

  // Build events.jsonl
  const eventsJsonl = events.map((e) => JSON.stringify(e)).join('\n') + '\n';

  // Build CSVs
  const recallCsv = toCsv(buildRecallRows(events, modeAssignment));
  const studyLogCsv = toCsv(buildStudyLogRows(events));
  const memoryPhrasesCsv = toCsv(buildMemoryPhraseRows(events, modeAssignment, people));

  // Create zip
  const zip = new JSZip();
  zip.file('events.jsonl', eventsJsonl);
  zip.file('session.json', JSON.stringify(sessionJson, null, 2));
  zip.file('recall.csv', recallCsv);
  zip.file('study_log.csv', studyLogCsv);
  zip.file('memory_phrases.csv', memoryPhrasesCsv);

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });

  // Build filename matching Electron convention
  const namePart = intake
    ? `${intake.firstName}-${intake.lastName}`.replace(/[^a-zA-Z0-9-]/g, '')
    : '';
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const segments = ['HFE-results', namePart, sessionParticipantId ?? 'unknown', timestamp].filter(
    Boolean,
  );
  const zipName = `${segments.join('_')}.zip`;

  triggerDownload(blob, zipName);
  return { zipPath: zipName };
}

async function quit(): Promise<void> {
  window.location.reload();
}

// ---------------------------------------------------------------------------
// Install
// ---------------------------------------------------------------------------

export function installWebApi(): void {
  window.api = {
    getConfig,
    getPeopleWithUuids,
    getRegistry,
    readStudyFile,
    writeStudyFile,
    showStudyFileOpenDialog,
    showStudyFileSaveDialog,
    startSession,
    logEvent,
    finalizeSession,
    copySessionTo,
    showExportDialog,
    downloadSessionZip,
    quit,
  };
}
