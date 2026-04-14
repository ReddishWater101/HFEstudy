import JSZip from 'jszip';

type SessionStartEvent = Extract<SessionEvent, { type: 'session.start' }>;
type FlashcardShowEvent = Extract<SessionEvent, { type: 'flashcard.show' }>;
type FlashcardBucketEvent = Extract<SessionEvent, { type: 'flashcard.bucket' }>;

type SessionPayload = {
  participantId?: unknown;
  intake?: unknown;
  modeAssignment?: unknown;
  people?: unknown;
  events?: unknown;
};

type StudyExposure = {
  blockIndex: number;
  personId: string;
  mode: Mode | null;
  bucket: FlashcardBucketEvent['bucket'];
  durationMs: number;
};

type QuizAttempt = {
  mode: Mode | null;
  outcome: 'correct' | 'incorrect' | 'idk' | 'timeout';
  rtMs: number | null;
};

export type UploadedAnalysisSession = {
  fileName: string;
  fileSize: number;
  participantId: string;
  modeAssignment: Record<string, Mode>;
  people: { id: string; firstName: string }[];
  events: SessionEvent[];
  studyConfigId: string | null;
  blockCount: number;
  enabledModes: Mode[];
  modeSignature: string;
};

export type UploadFailure = {
  fileName: string;
  message: string;
};

export type UploadedSessionRow = {
  participantLabel: string;
  participantId: string;
  fileName: string;
  fileSizeKb: number;
  studyConfigId: string | null;
  blockCount: number;
  enabledModesLabel: string;
};

export type ParticipantSummary = {
  participantLabel: string;
  participantId: string;
  fileName: string;
  studyConfigId: string | null;
  blockCount: number;
  enabledModesLabel: string;
  totalFlashcards: number;
  overallKnowItRate: number | null;
  quizAccuracy: number | null;
  questionCount: number;
  correctCount: number;
  idkCount: number;
  timeoutCount: number;
  avgQuizRtSec: number | null;
};

export type BlockTrendPoint = {
  participantLabel: string;
  participantId: string;
  fileName: string;
  studyConfigId: string | null;
  enabledModesLabel: string;
  blockIndex: number;
  totalFlashcards: number;
  knowItCount: number;
  knowItRate: number;
  avgDurationSec: number | null;
};

export type AverageBlockTrendPoint = {
  blockIndex: number;
  participantCount: number;
  knowItRate: number;
  avgDurationSec: number | null;
};

export type ModeQuizSummary = {
  mode: Mode;
  questionCount: number;
  correctCount: number;
  accuracy: number | null;
  idkCount: number;
  timeoutCount: number;
  avgRtSec: number | null;
};

export type AnalyzerOverallSummary = {
  zipCount: number;
  participantCount: number;
  overallQuizAccuracy: number | null;
  overallKnowItRate: number | null;
  avgQuizRtSec: number | null;
  idkCount: number;
  timeoutCount: number;
};

export type AnalyzerBatch = {
  sessions: UploadedAnalysisSession[];
  failures: UploadFailure[];
  uploads: UploadedSessionRow[];
  participants: ParticipantSummary[];
  blockTrend: BlockTrendPoint[];
  averageBlockTrend: AverageBlockTrendPoint[];
  modeQuiz: ModeQuizSummary[];
  overall: AnalyzerOverallSummary;
  warnings: string[];
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeMode(value: unknown): Mode | null {
  return value === 1 || value === 2 || value === 3 || value === 4 ? value : null;
}

function round(value: number, digits = 2): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

export function formatEnabledModes(modes: readonly Mode[]): string {
  if (modes.length === 0) return 'Unknown';
  return modes.map((mode) => `Mode ${mode}`).join(', ');
}

function parseBlockIndex(blockLabel: unknown): number | null {
  if (typeof blockLabel !== 'string' && typeof blockLabel !== 'number') {
    return null;
  }
  const parsed = Number.parseInt(String(blockLabel), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function uniqueSortedModes(values: Iterable<unknown>): Mode[] {
  const next = new Set<Mode>();
  for (const value of values) {
    const mode = normalizeMode(value);
    if (mode !== null) next.add(mode);
  }
  return Array.from(next).sort((a, b) => a - b);
}

function extractModeAssignment(value: unknown): Record<string, Mode> {
  if (!isObject(value)) return {};
  const next: Record<string, Mode> = {};
  for (const [personId, rawMode] of Object.entries(value)) {
    const mode = normalizeMode(rawMode);
    if (mode !== null) next[personId] = mode;
  }
  return next;
}

function extractPeople(value: unknown): { id: string; firstName: string }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((person) => {
    if (!isObject(person)) return [];
    const id = typeof person.id === 'string' ? person.id : null;
    const firstName = typeof person.firstName === 'string' ? person.firstName : null;
    if (!id || !firstName) return [];
    return [{ id, firstName }];
  });
}

function parseEventsJsonl(text: string): SessionEvent[] {
  const events: SessionEvent[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parsed = JSON.parse(trimmed) as SessionEvent;
    if (isObject(parsed) && typeof parsed.type === 'string') {
      events.push(parsed);
    }
  }
  return events;
}

function findSessionStart(events: SessionEvent[]): SessionStartEvent | undefined {
  return events.find((event): event is SessionStartEvent => event.type === 'session.start');
}

function inferBlockCount(events: SessionEvent[]): number {
  let maxBlock = 0;
  for (const event of events) {
    if (event.type !== 'flashcard.show') continue;
    const blockIndex = parseBlockIndex(event.blockLabel);
    if (blockIndex !== null) {
      maxBlock = Math.max(maxBlock, blockIndex);
    }
  }
  return maxBlock;
}

function collectExposures(session: UploadedAnalysisSession): StudyExposure[] {
  const pendingShows = new Map<string, FlashcardShowEvent>();
  const exposures: StudyExposure[] = [];

  for (const event of session.events) {
    if (event.type === 'flashcard.show') {
      pendingShows.set(event.personId, event);
      continue;
    }

    if (event.type !== 'flashcard.bucket') continue;

    const show = pendingShows.get(event.personId);
    if (!show) continue;

    const blockIndex = parseBlockIndex(show.blockLabel);
    if (blockIndex !== null) {
      exposures.push({
        blockIndex,
        personId: event.personId,
        mode: normalizeMode(show.mode) ?? session.modeAssignment[event.personId] ?? null,
        bucket: event.bucket,
        durationMs: event.durationMs,
      });
    }

    pendingShows.delete(event.personId);
  }

  return exposures;
}

function collectQuizAttempts(session: UploadedAnalysisSession): QuizAttempt[] {
  const attempts: QuizAttempt[] = [];

  for (const event of session.events) {
    if (event.type === 'quiz.answer') {
      attempts.push({
        mode: session.modeAssignment[event.personId] ?? null,
        outcome: event.correct ? 'correct' : 'incorrect',
        rtMs: event.rtMs,
      });
      continue;
    }

    if (event.type === 'quiz.idk') {
      attempts.push({
        mode: session.modeAssignment[event.personId] ?? null,
        outcome: 'idk',
        rtMs: event.rtMs,
      });
      continue;
    }

    if (event.type === 'quiz.timeout') {
      attempts.push({
        mode: session.modeAssignment[event.personId] ?? null,
        outcome: 'timeout',
        rtMs: null,
      });
    }
  }

  return attempts;
}

function average(numbers: number[]): number | null {
  if (numbers.length === 0) return null;
  return round(numbers.reduce((sum, value) => sum + value, 0) / numbers.length);
}

function buildParticipantSummary(
  session: UploadedAnalysisSession,
  participantLabel: string,
): ParticipantSummary {
  const exposures = collectExposures(session);
  const attempts = collectQuizAttempts(session);

  const knowItCount = exposures.filter((exposure) => exposure.bucket === 'know-it').length;
  const correctCount = attempts.filter((attempt) => attempt.outcome === 'correct').length;
  const idkCount = attempts.filter((attempt) => attempt.outcome === 'idk').length;
  const timeoutCount = attempts.filter((attempt) => attempt.outcome === 'timeout').length;
  const rtMsValues = attempts.flatMap((attempt) =>
    attempt.rtMs === null ? [] : [attempt.rtMs / 1000],
  );

  return {
    participantLabel,
    participantId: session.participantId,
    fileName: session.fileName,
    studyConfigId: session.studyConfigId,
    blockCount: session.blockCount,
    enabledModesLabel: formatEnabledModes(session.enabledModes),
    totalFlashcards: exposures.length,
    overallKnowItRate: exposures.length > 0 ? round(knowItCount / exposures.length, 4) : null,
    quizAccuracy: attempts.length > 0 ? round(correctCount / attempts.length, 4) : null,
    questionCount: attempts.length,
    correctCount,
    idkCount,
    timeoutCount,
    avgQuizRtSec: average(rtMsValues),
  };
}

function buildParticipantBlockTrend(
  session: UploadedAnalysisSession,
  participantLabel: string,
): BlockTrendPoint[] {
  const groups = new Map<number, StudyExposure[]>();
  for (const exposure of collectExposures(session)) {
    const current = groups.get(exposure.blockIndex) ?? [];
    current.push(exposure);
    groups.set(exposure.blockIndex, current);
  }

  return Array.from(groups.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([blockIndex, exposures]) => {
      const knowItCount = exposures.filter((exposure) => exposure.bucket === 'know-it').length;
      const avgDurationSec = average(exposures.map((exposure) => exposure.durationMs / 1000));

      return {
        participantLabel,
        participantId: session.participantId,
        fileName: session.fileName,
        studyConfigId: session.studyConfigId,
        enabledModesLabel: formatEnabledModes(session.enabledModes),
        blockIndex,
        totalFlashcards: exposures.length,
        knowItCount,
        knowItRate: exposures.length > 0 ? round(knowItCount / exposures.length, 4) : 0,
        avgDurationSec,
      };
    });
}

function buildAverageBlockTrend(points: BlockTrendPoint[]): AverageBlockTrendPoint[] {
  const groups = new Map<number, BlockTrendPoint[]>();
  for (const point of points) {
    const current = groups.get(point.blockIndex) ?? [];
    current.push(point);
    groups.set(point.blockIndex, current);
  }

  return Array.from(groups.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([blockIndex, entries]) => ({
      blockIndex,
      participantCount: entries.length,
      knowItRate: round(
        entries.reduce((sum, entry) => sum + entry.knowItRate, 0) / entries.length,
        4,
      ),
      avgDurationSec: average(
        entries.flatMap((entry) => (entry.avgDurationSec === null ? [] : [entry.avgDurationSec])),
      ),
    }));
}

function buildModeQuizSummary(sessions: UploadedAnalysisSession[]): ModeQuizSummary[] {
  const groups = new Map<Mode, QuizAttempt[]>();

  for (const session of sessions) {
    for (const attempt of collectQuizAttempts(session)) {
      if (attempt.mode === null) continue;
      const current = groups.get(attempt.mode) ?? [];
      current.push(attempt);
      groups.set(attempt.mode, current);
    }
  }

  return Array.from(groups.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([mode, attempts]) => {
      const correctCount = attempts.filter((attempt) => attempt.outcome === 'correct').length;
      const idkCount = attempts.filter((attempt) => attempt.outcome === 'idk').length;
      const timeoutCount = attempts.filter((attempt) => attempt.outcome === 'timeout').length;
      const rtMsValues = attempts.flatMap((attempt) =>
        attempt.rtMs === null ? [] : [attempt.rtMs / 1000],
      );

      return {
        mode,
        questionCount: attempts.length,
        correctCount,
        accuracy: attempts.length > 0 ? round(correctCount / attempts.length, 4) : null,
        idkCount,
        timeoutCount,
        avgRtSec: average(rtMsValues),
      };
    });
}

function buildWarnings(sessions: UploadedAnalysisSession[]): string[] {
  if (sessions.length === 0) return [];

  const modeSets = new Set(
    sessions
      .map((session) => session.enabledModes.join(','))
      .filter((value) => value.length > 0),
  );
  const blockCounts = new Set(
    sessions.map((session) => session.blockCount).filter((value) => value > 0),
  );

  const warnings: string[] = [];
  if (modeSets.size > 1) {
    warnings.push(
      'Uploads use different enabled mode sets. Aggregates are merged across all uploaded sessions.',
    );
  }
  if (blockCounts.size > 1) {
    warnings.push(
      'Uploads use different flashcard block counts. Block-level averages only include participants with data for each block.',
    );
  }

  return warnings;
}

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (text.includes(',') || text.includes('"') || text.includes('\n') || text.includes('\r')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function toCsv<T extends Record<string, unknown>>(rows: T[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const lines = [headers.map((header) => escapeCell(header)).join(',')];
  for (const row of rows) {
    lines.push(headers.map((header) => escapeCell(row[header])).join(','));
  }
  return lines.join('\n') + '\n';
}

function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  window.setTimeout(() => {
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, 100);
}

export async function parseResultZip(file: File): Promise<UploadedAnalysisSession> {
  const zip = await JSZip.loadAsync(file);
  const sessionEntry = zip.file('session.json');
  const eventsEntry = zip.file('events.jsonl');

  if (!sessionEntry && !eventsEntry) {
    throw new Error('ZIP does not contain session.json or events.jsonl.');
  }

  let payload: SessionPayload | null = null;
  let sessionJsonError: string | null = null;

  if (sessionEntry) {
    try {
      payload = JSON.parse(await sessionEntry.async('string')) as SessionPayload;
    } catch {
      sessionJsonError = 'session.json is not valid JSON.';
    }
  }

  let events: SessionEvent[] = [];
  if (payload && Array.isArray(payload.events)) {
    events = payload.events as SessionEvent[];
  }

  if (events.length === 0 && eventsEntry) {
    try {
      events = parseEventsJsonl(await eventsEntry.async('string'));
    } catch {
      throw new Error(sessionJsonError ?? 'events.jsonl could not be parsed.');
    }
  }

  if (events.length === 0) {
    throw new Error(sessionJsonError ?? 'No session events were found in the ZIP.');
  }

  const startEvent = findSessionStart(events);
  const participantId =
    (payload && typeof payload.participantId === 'string' ? payload.participantId : null) ??
    startEvent?.participantId ??
    file.name.replace(/\.zip$/i, '');
  const modeAssignment =
    (payload ? extractModeAssignment(payload.modeAssignment) : null) ??
    extractModeAssignment(startEvent?.modeAssignment);
  const normalizedModeAssignment =
    Object.keys(modeAssignment).length > 0
      ? modeAssignment
      : extractModeAssignment(startEvent?.modeAssignment);
  const people =
    (payload ? extractPeople(payload.people) : null) ?? extractPeople(startEvent?.people);
  const normalizedPeople =
    people.length > 0 ? people : extractPeople(startEvent?.people);
  const blockCount = startEvent?.blockCount ?? inferBlockCount(events);
  const enabledModes = uniqueSortedModes(
    startEvent?.enabledModes ?? Object.values(normalizedModeAssignment),
  );

  return {
    fileName: file.name,
    fileSize: file.size,
    participantId,
    modeAssignment: normalizedModeAssignment,
    people: normalizedPeople,
    events,
    studyConfigId: startEvent?.studyConfigId ?? null,
    blockCount,
    enabledModes,
    modeSignature: formatEnabledModes(enabledModes),
  };
}

export function buildAnalyzerBatch(
  sessions: UploadedAnalysisSession[],
  failures: UploadFailure[],
): AnalyzerBatch {
  const uploads = sessions.map((session, index) => ({
    participantLabel: `P${String(index + 1).padStart(2, '0')}`,
    participantId: session.participantId,
    fileName: session.fileName,
    fileSizeKb: round(session.fileSize / 1024, 1),
    studyConfigId: session.studyConfigId,
    blockCount: session.blockCount,
    enabledModesLabel: session.modeSignature,
  }));

  const participants = sessions.map((session, index) =>
    buildParticipantSummary(session, uploads[index].participantLabel),
  );

  const blockTrend = sessions.flatMap((session, index) =>
    buildParticipantBlockTrend(session, uploads[index].participantLabel),
  );

  const quizAttempts = sessions.flatMap((session) => collectQuizAttempts(session));
  const exposures = sessions.flatMap((session) => collectExposures(session));
  const averageBlockTrend = buildAverageBlockTrend(blockTrend);
  const correctCount = quizAttempts.filter((attempt) => attempt.outcome === 'correct').length;
  const idkCount = quizAttempts.filter((attempt) => attempt.outcome === 'idk').length;
  const timeoutCount = quizAttempts.filter((attempt) => attempt.outcome === 'timeout').length;
  const knowItCount = exposures.filter((exposure) => exposure.bucket === 'know-it').length;

  return {
    sessions,
    failures,
    uploads,
    participants,
    blockTrend,
    averageBlockTrend,
    modeQuiz: buildModeQuizSummary(sessions),
    overall: {
      zipCount: sessions.length + failures.length,
      participantCount: sessions.length,
      overallQuizAccuracy:
        quizAttempts.length > 0 ? round(correctCount / quizAttempts.length, 4) : null,
      overallKnowItRate: exposures.length > 0 ? round(knowItCount / exposures.length, 4) : null,
      avgQuizRtSec: average(
        quizAttempts.flatMap((attempt) =>
          attempt.rtMs === null ? [] : [attempt.rtMs / 1000],
        ),
      ),
      idkCount,
      timeoutCount,
    },
    warnings: buildWarnings(sessions),
  };
}

export async function exportAnalyzerBatch(batch: AnalyzerBatch): Promise<void> {
  const participantsRows = batch.participants.map((participant) => ({
    participantLabel: participant.participantLabel,
    participantId: participant.participantId,
    fileName: participant.fileName,
    studyConfigId: participant.studyConfigId ?? '',
    blockCount: participant.blockCount,
    enabledModes: participant.enabledModesLabel,
    totalFlashcards: participant.totalFlashcards,
    overallKnowItRate: participant.overallKnowItRate,
    quizAccuracy: participant.quizAccuracy,
    questionCount: participant.questionCount,
    correctCount: participant.correctCount,
    idkCount: participant.idkCount,
    timeoutCount: participant.timeoutCount,
    avgQuizRtSec: participant.avgQuizRtSec,
  }));

  const blockRows = [
    ...batch.blockTrend.map((point) => ({
      seriesType: 'participant',
      participantLabel: point.participantLabel,
      participantId: point.participantId,
      fileName: point.fileName,
      studyConfigId: point.studyConfigId ?? '',
      enabledModes: point.enabledModesLabel,
      blockIndex: point.blockIndex,
      participantCount: '',
      totalFlashcards: point.totalFlashcards,
      knowItCount: point.knowItCount,
      knowItRate: point.knowItRate,
      avgDurationSec: point.avgDurationSec,
    })),
    ...batch.averageBlockTrend.map((point) => ({
      seriesType: 'average',
      participantLabel: 'Average',
      participantId: '',
      fileName: '',
      studyConfigId: '',
      enabledModes: '',
      blockIndex: point.blockIndex,
      participantCount: point.participantCount,
      totalFlashcards: '',
      knowItCount: '',
      knowItRate: point.knowItRate,
      avgDurationSec: point.avgDurationSec,
    })),
  ];

  const modeRows = batch.modeQuiz.map((row) => ({
    mode: row.mode,
    questionCount: row.questionCount,
    correctCount: row.correctCount,
    accuracy: row.accuracy,
    idkCount: row.idkCount,
    timeoutCount: row.timeoutCount,
    avgRtSec: row.avgRtSec,
  }));

  const zip = new JSZip();
  zip.file('participants_summary.csv', toCsv(participantsRows));
  zip.file('block_trend.csv', toCsv(blockRows));
  zip.file('mode_quiz_summary.csv', toCsv(modeRows));

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  triggerDownload(blob, `HFE-analysis_${stamp}.zip`);
}
