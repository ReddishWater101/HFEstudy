import {
  closeSync,
  cpSync,
  createReadStream,
  createWriteStream,
  fsyncSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { basename, isAbsolute, join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { app } from 'electron';
import archiver from 'archiver';
import { getCurrentConfig } from './config';
import { writeCsv } from './csv';

function fmtTimestamp(epochMs: number): string {
  const d = new Date(epochMs);
  const date = d.toLocaleDateString('en-CA'); // YYYY-MM-DD
  const time = d.toLocaleTimeString('en-GB', { hour12: false }); // HH:MM:SS
  const tz = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' })
    .formatToParts(d)
    .find((p) => p.type === 'timeZoneName')?.value ?? '';
  return `${date} ${time} ${tz}`.trim();
}

type Mode = 1 | 2 | 3 | 4;

export type Intake = { firstName: string; lastName: string; email: string };

type SessionStartEvent = {
  type: 'session.start';
  t: number;
  participantId: string;
  intake: Intake;
  modeAssignment: Record<string, Mode>;
  people: { id: string; firstName: string }[];
  studyConfigId: string;
  blockCount: number;
  enabledModes: Mode[];
};

type FlashcardShowEvent = {
  type: 'flashcard.show';
  t: number;
  personId: string;
  mode: Mode;
  blockLabel: string;
};

export type SessionEvent =
  | SessionStartEvent
  | { type: 'intro.video.play'; t: number; personId: string; playCount: number }
  | { type: 'intro.video.error'; t: number; personId: string }
  | { type: 'intro.video.stall'; t: number; personId: string }
  | { type: 'intro.phrase.input'; t: number; personId: string; phrase: string }
  | { type: 'intro.advance'; t: number; personId: string }
  | FlashcardShowEvent
  | {
      type: 'flashcard.bucket';
      t: number;
      personId: string;
      bucket: 'still-learning' | 'know-it';
      durationMs: number;
    }
  | { type: 'flashcard.refill'; t: number; blockLabel: string }
  | { type: 'snake.start'; t: number; afterBlockIndex: number }
  | { type: 'snake.gameover'; t: number; score: number }
  | { type: 'snake.end'; t: number; afterBlockIndex: number }
  | { type: 'quiz.show'; t: number; personId: string; trueName: string }
  | {
      type: 'quiz.answer';
      t: number;
      personId: string;
      typed: string;
      correct: boolean;
      editDistance: number;
      rtMs: number;
    }
  | { type: 'quiz.idk'; t: number; personId: string; rtMs: number }
  | { type: 'quiz.timeout'; t: number; personId: string }
  | { type: 'session.finalize'; t: number };

type SessionState = {
  participantId: string;
  sessionDir: string;
  eventsPath: string;
  fd: number;
  intake: Intake;
};

let current: SessionState | null = null;
let lastFinalizedDir: string | null = null;
let lastFinalizedIntake: Intake | null = null;

function resolveExportRoot(): string {
  const cfg = getCurrentConfig();
  const raw = cfg.exportPath;
  if (isAbsolute(raw)) return raw;
  const baseDir = app.isPackaged ? app.getPath('userData') : app.getAppPath();
  return resolve(baseDir, raw);
}

export function startSession(intake: Intake): { participantId: string; sessionDir: string } {
  if (current) {
    closeSync(current.fd);
    current = null;
  }
  const participantId = `${Date.now()}-${randomBytes(4).toString('hex')}`;
  const sessionDir = join(resolveExportRoot(), participantId);
  mkdirSync(sessionDir, { recursive: true });
  const eventsPath = join(sessionDir, 'events.jsonl');
  const fd = openSync(eventsPath, 'a');
  current = { participantId, sessionDir, eventsPath, fd, intake };
  return { participantId, sessionDir };
}

export function appendEvent(event: SessionEvent): void {
  if (!current) {
    throw new Error('appendEvent called before startSession');
  }
  const line = JSON.stringify(event) + '\n';
  writeSync(current.fd, line);
  fsyncSync(current.fd);
}

function readEvents(eventsPath: string): SessionEvent[] {
  const raw = readFileSync(eventsPath, 'utf8');
  const out: SessionEvent[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      out.push(JSON.parse(trimmed));
    } catch {
      // skip malformed lines
    }
  }
  return out;
}

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

export function finalizeSession(): { exportDir: string } {
  if (!current) {
    // Already finalized (e.g. React StrictMode double-mount) — return cached result.
    if (lastFinalizedDir) {
      return { exportDir: lastFinalizedDir };
    }
    throw new Error('finalizeSession called before startSession');
  }
  appendEvent({ type: 'session.finalize', t: Date.now() });
  closeSync(current.fd);

  const events = readEvents(current.eventsPath);
  const startEv = events.find((e): e is SessionStartEvent => e.type === 'session.start');

  const modeAssignment = startEv?.modeAssignment ?? {};
  const people = startEv?.people ?? [];
  const intake = startEv?.intake ?? current.intake;

  const sessionJson = {
    participantId: current.participantId,
    intake,
    modeAssignment,
    people,
    events,
  };
  writeFileSync(join(current.sessionDir, 'session.json'), JSON.stringify(sessionJson, null, 2));

  writeCsv(buildRecallRows(events, modeAssignment), join(current.sessionDir, 'recall.csv'));
  writeCsv(buildStudyLogRows(events), join(current.sessionDir, 'study_log.csv'));
  writeCsv(
    buildMemoryPhraseRows(events, modeAssignment, people),
    join(current.sessionDir, 'memory_phrases.csv'),
  );

  const exportDir = current.sessionDir;
  lastFinalizedDir = exportDir;
  lastFinalizedIntake = current.intake;
  current = null;
  return { exportDir };
}

export function copySessionTo(destDir: string): void {
  const sourceDir = current?.sessionDir ?? lastFinalizedDir;
  if (!sourceDir) {
    throw new Error('copySessionTo: no session to copy');
  }
  cpSync(sourceDir, destDir, { recursive: true });
}

export function downloadSessionZip(): Promise<{ zipPath: string }> {
  const sourceDir = current?.sessionDir ?? lastFinalizedDir;
  if (!sourceDir) {
    throw new Error('downloadSessionZip: no session to export');
  }
  const participantId = current?.participantId ?? basename(sourceDir) ?? 'unknown';
  const intake = current?.intake ?? lastFinalizedIntake;
  const namePart = intake
    ? `${intake.firstName}-${intake.lastName}`.replace(/[^a-zA-Z0-9-]/g, '')
    : '';
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const segments = ['HFE-results', namePart, participantId, timestamp].filter(Boolean);
  const zipName = `${segments.join('_')}.zip`;
  const zipPath = join(app.getPath('downloads'), zipName);

  return new Promise((resolve, reject) => {
    const output = createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => resolve({ zipPath }));
    archive.on('error', (err) => reject(err));

    archive.pipe(output);

    const files = readdirSync(sourceDir);
    for (const file of files) {
      archive.append(createReadStream(join(sourceDir, file)), { name: file });
    }

    void archive.finalize();
  });
}
