import {
  closeSync,
  cpSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { app } from 'electron';
import { getCurrentConfig } from './config';
import { writeCsv } from './csv';

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
        rtMs: ev.rtMs,
        mode: modeAssignment[ev.personId] ?? '',
        sessionTimestamp: ev.t,
      });
    } else if (ev.type === 'quiz.timeout') {
      rows.push({
        personId: ev.personId,
        trueName: trueNameByPerson.get(ev.personId) ?? '',
        typedName: '',
        correct: false,
        editDistance: '',
        rtMs: '',
        mode: modeAssignment[ev.personId] ?? '',
        sessionTimestamp: ev.t,
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
          timestamp: show.t,
          personId: show.personId,
          mode: show.mode,
          blockLabel: show.blockLabel,
          durationMs: ev.durationMs,
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
