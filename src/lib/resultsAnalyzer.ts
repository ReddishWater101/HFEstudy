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
  personId: string;
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

// 2x2 factorial: {phrase, no-phrase} x {text, audio}
export const MODE_LABELS: Record<Mode, string> = {
  1: 'Phrase + Text',
  2: 'Phrase + Audio',
  3: 'No-phrase + Text',
  4: 'No-phrase + Audio',
};

export const MODE_SHORT_LABELS: Record<Mode, string> = {
  1: 'P+T',
  2: 'P+A',
  3: 'NP+T',
  4: 'NP+A',
};

export const MODE_COLORS: Record<Mode, string> = {
  1: '#0369a1', // sky-700
  2: '#b45309', // amber-700
  3: '#047857', // emerald-700
  4: '#7e22ce', // purple-700
};

export const ALL_MODES: readonly Mode[] = [1, 2, 3, 4];

export type LearningBlockCell = {
  blockIndex: number;
  mode: Mode;
  meanKnowItRate: number;
  sem: number;
  participantCount: number;
  decisionCount: number;
};

export type LearningModeSummary = {
  mode: Mode;
  label: string;
  participantCount: number;
  totalDecisions: number;
  firstBlockRate: number | null;
  lastBlockRate: number | null;
  delta: number | null;
  slopePerBlock: number | null;
};

export type LearningData = {
  cells: LearningBlockCell[];
  summary: LearningModeSummary[];
  blockIndices: number[];
};

export type RecallTimeModeData = {
  mode: Mode;
  label: string;
  rtSec: number[];
  mean: number | null;
  sd: number | null;
  median: number | null;
  q1: number | null;
  q3: number | null;
  min: number | null;
  max: number | null;
  n: number;
};

export type AccuracyModeData = {
  mode: Mode;
  label: string;
  correct: number;
  incorrect: number;
  idk: number;
  timeout: number;
  total: number;
  accuracy: number | null;
  ci95Lower: number | null;
  ci95Upper: number | null;
};

export type AnalyzerBatch = {
  sessions: UploadedAnalysisSession[];
  failures: UploadFailure[];
  participantCount: number;
  learning: LearningData;
  recallTime: RecallTimeModeData[];
  accuracy: AccuracyModeData[];
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeMode(value: unknown): Mode | null {
  return value === 1 || value === 2 || value === 3 || value === 4 ? value : null;
}

function parseBlockIndex(blockLabel: unknown): number | null {
  if (typeof blockLabel !== 'string' && typeof blockLabel !== 'number') return null;
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
    if (blockIndex !== null) maxBlock = Math.max(maxBlock, blockIndex);
  }
  return maxBlock;
}

function formatEnabledModes(modes: readonly Mode[]): string {
  if (modes.length === 0) return 'Unknown';
  return modes.map((mode) => `Mode ${mode}`).join(', ');
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
        personId: event.personId,
        mode: session.modeAssignment[event.personId] ?? null,
        outcome: event.correct ? 'correct' : 'incorrect',
        rtMs: event.rtMs,
      });
      continue;
    }

    if (event.type === 'quiz.idk') {
      attempts.push({
        personId: event.personId,
        mode: session.modeAssignment[event.personId] ?? null,
        outcome: 'idk',
        rtMs: event.rtMs,
      });
      continue;
    }

    if (event.type === 'quiz.timeout') {
      attempts.push({
        personId: event.personId,
        mode: session.modeAssignment[event.personId] ?? null,
        outcome: 'timeout',
        rtMs: null,
      });
    }
  }

  return attempts;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  let sum = 0;
  for (const value of values) sum += value;
  return sum / values.length;
}

function stdDev(values: number[]): number | null {
  if (values.length < 2) return null;
  const m = values.reduce((sum, v) => sum + v, 0) / values.length;
  let sq = 0;
  for (const value of values) sq += (value - m) * (value - m);
  return Math.sqrt(sq / (values.length - 1));
}

function percentile(sortedValues: number[], p: number): number | null {
  if (sortedValues.length === 0) return null;
  if (sortedValues.length === 1) return sortedValues[0];
  const idx = (sortedValues.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedValues[lo];
  return sortedValues[lo] + (sortedValues[hi] - sortedValues[lo]) * (idx - lo);
}

function wilsonInterval(successes: number, trials: number, z = 1.96): [number, number] | null {
  if (trials === 0) return null;
  const p = successes / trials;
  const denom = 1 + (z * z) / trials;
  const center = p + (z * z) / (2 * trials);
  const spread = z * Math.sqrt((p * (1 - p)) / trials + (z * z) / (4 * trials * trials));
  return [Math.max(0, (center - spread) / denom), Math.min(1, (center + spread) / denom)];
}

// Simple linear regression slope using least squares.
function linearSlope(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 2) return null;
  const meanX = xs.reduce((s, v) => s + v, 0) / n;
  const meanY = ys.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (ys[i] - meanY);
    den += (xs[i] - meanX) * (xs[i] - meanX);
  }
  if (den === 0) return null;
  return num / den;
}

function buildLearningData(sessions: UploadedAnalysisSession[]): LearningData {
  // For each (blockIndex, mode), collect per-participant know-it rates. We then
  // report the mean and SEM across participants so each participant counts equally.
  const rateBuckets = new Map<number, Map<Mode, number[]>>();
  const decisionCounts = new Map<number, Map<Mode, number>>();

  for (const session of sessions) {
    const perParticipant = new Map<number, Map<Mode, { know: number; total: number }>>();
    for (const exp of collectExposures(session)) {
      if (exp.mode === null) continue;
      let byMode = perParticipant.get(exp.blockIndex);
      if (!byMode) {
        byMode = new Map();
        perParticipant.set(exp.blockIndex, byMode);
      }
      const cur = byMode.get(exp.mode) ?? { know: 0, total: 0 };
      cur.total += 1;
      if (exp.bucket === 'know-it') cur.know += 1;
      byMode.set(exp.mode, cur);
    }

    for (const [blockIndex, byMode] of perParticipant) {
      for (const [mode, counts] of byMode) {
        if (counts.total === 0) continue;
        const rate = counts.know / counts.total;

        let rates = rateBuckets.get(blockIndex);
        if (!rates) {
          rates = new Map();
          rateBuckets.set(blockIndex, rates);
        }
        const arr = rates.get(mode) ?? [];
        arr.push(rate);
        rates.set(mode, arr);

        let dec = decisionCounts.get(blockIndex);
        if (!dec) {
          dec = new Map();
          decisionCounts.set(blockIndex, dec);
        }
        dec.set(mode, (dec.get(mode) ?? 0) + counts.total);
      }
    }
  }

  const cells: LearningBlockCell[] = [];
  const blockSet = new Set<number>();
  for (const [blockIndex, byMode] of rateBuckets) {
    blockSet.add(blockIndex);
    for (const [mode, rates] of byMode) {
      const m = rates.reduce((s, v) => s + v, 0) / rates.length;
      const sd = stdDev(rates);
      const sem = sd !== null ? sd / Math.sqrt(rates.length) : 0;
      cells.push({
        blockIndex,
        mode,
        meanKnowItRate: m,
        sem,
        participantCount: rates.length,
        decisionCount: decisionCounts.get(blockIndex)?.get(mode) ?? 0,
      });
    }
  }
  cells.sort((a, b) => a.blockIndex - b.blockIndex || a.mode - b.mode);

  const blockIndices = Array.from(blockSet).sort((a, b) => a - b);

  const summary: LearningModeSummary[] = ALL_MODES.map((mode) => {
    const modeCells = cells
      .filter((c) => c.mode === mode)
      .sort((a, b) => a.blockIndex - b.blockIndex);
    if (modeCells.length === 0) {
      return {
        mode,
        label: MODE_LABELS[mode],
        participantCount: 0,
        totalDecisions: 0,
        firstBlockRate: null,
        lastBlockRate: null,
        delta: null,
        slopePerBlock: null,
      };
    }
    const first = modeCells[0];
    const last = modeCells[modeCells.length - 1];
    const totalDecisions = modeCells.reduce((s, c) => s + c.decisionCount, 0);
    const maxParticipants = modeCells.reduce((m, c) => Math.max(m, c.participantCount), 0);
    const xs = modeCells.map((c) => c.blockIndex);
    const ys = modeCells.map((c) => c.meanKnowItRate);
    return {
      mode,
      label: MODE_LABELS[mode],
      participantCount: maxParticipants,
      totalDecisions,
      firstBlockRate: first.meanKnowItRate,
      lastBlockRate: last.meanKnowItRate,
      delta: last.meanKnowItRate - first.meanKnowItRate,
      slopePerBlock: linearSlope(xs, ys),
    };
  });

  return { cells, summary, blockIndices };
}

function buildRecallTime(sessions: UploadedAnalysisSession[]): RecallTimeModeData[] {
  const byMode = new Map<Mode, number[]>();

  for (const session of sessions) {
    for (const attempt of collectQuizAttempts(session)) {
      if (attempt.mode === null) continue;
      if (attempt.outcome !== 'correct' && attempt.outcome !== 'incorrect') continue;
      if (attempt.rtMs === null) continue;
      const arr = byMode.get(attempt.mode) ?? [];
      arr.push(attempt.rtMs / 1000);
      byMode.set(attempt.mode, arr);
    }
  }

  return ALL_MODES.map((mode) => {
    const arr = byMode.get(mode) ?? [];
    const sorted = arr.slice().sort((a, b) => a - b);
    return {
      mode,
      label: MODE_LABELS[mode],
      rtSec: sorted,
      mean: mean(sorted),
      sd: stdDev(sorted),
      median: percentile(sorted, 0.5),
      q1: percentile(sorted, 0.25),
      q3: percentile(sorted, 0.75),
      min: sorted.length > 0 ? sorted[0] : null,
      max: sorted.length > 0 ? sorted[sorted.length - 1] : null,
      n: sorted.length,
    };
  });
}

function buildAccuracy(sessions: UploadedAnalysisSession[]): AccuracyModeData[] {
  const counts = new Map<Mode, { correct: number; incorrect: number; idk: number; timeout: number }>();

  for (const session of sessions) {
    for (const attempt of collectQuizAttempts(session)) {
      if (attempt.mode === null) continue;
      const cur = counts.get(attempt.mode) ?? { correct: 0, incorrect: 0, idk: 0, timeout: 0 };
      cur[attempt.outcome] += 1;
      counts.set(attempt.mode, cur);
    }
  }

  return ALL_MODES.map((mode) => {
    const c = counts.get(mode) ?? { correct: 0, incorrect: 0, idk: 0, timeout: 0 };
    const total = c.correct + c.incorrect + c.idk + c.timeout;
    const accuracy = total > 0 ? c.correct / total : null;
    const ci = total > 0 ? wilsonInterval(c.correct, total) : null;
    return {
      mode,
      label: MODE_LABELS[mode],
      correct: c.correct,
      incorrect: c.incorrect,
      idk: c.idk,
      timeout: c.timeout,
      total,
      accuracy,
      ci95Lower: ci ? ci[0] : null,
      ci95Upper: ci ? ci[1] : null,
    };
  });
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
  const normalizedPeople = people.length > 0 ? people : extractPeople(startEvent?.people);
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
  return {
    sessions,
    failures,
    participantCount: sessions.length,
    learning: buildLearningData(sessions),
    recallTime: buildRecallTime(sessions),
    accuracy: buildAccuracy(sessions),
  };
}

export async function exportAnalyzerBatch(batch: AnalyzerBatch): Promise<void> {
  const learningRows = batch.learning.cells.map((c) => ({
    mode: c.mode,
    modeLabel: MODE_LABELS[c.mode],
    blockIndex: c.blockIndex,
    meanKnowItRate: c.meanKnowItRate,
    sem: c.sem,
    participantCount: c.participantCount,
    decisionCount: c.decisionCount,
  }));

  const learningSummaryRows = batch.learning.summary.map((s) => ({
    mode: s.mode,
    modeLabel: s.label,
    participantCount: s.participantCount,
    totalDecisions: s.totalDecisions,
    firstBlockRate: s.firstBlockRate,
    lastBlockRate: s.lastBlockRate,
    deltaFirstToLast: s.delta,
    slopePerBlock: s.slopePerBlock,
  }));

  const recallTrialRows: Array<{ mode: Mode; modeLabel: string; rtSec: number }> = [];
  for (const m of batch.recallTime) {
    for (const rt of m.rtSec) {
      recallTrialRows.push({ mode: m.mode, modeLabel: m.label, rtSec: rt });
    }
  }

  const recallSummaryRows = batch.recallTime.map((m) => ({
    mode: m.mode,
    modeLabel: m.label,
    n: m.n,
    mean: m.mean,
    sd: m.sd,
    median: m.median,
    q1: m.q1,
    q3: m.q3,
    min: m.min,
    max: m.max,
  }));

  const accuracyRows = batch.accuracy.map((a) => ({
    mode: a.mode,
    modeLabel: a.label,
    correct: a.correct,
    incorrect: a.incorrect,
    idk: a.idk,
    timeout: a.timeout,
    total: a.total,
    accuracy: a.accuracy,
    ci95Lower: a.ci95Lower,
    ci95Upper: a.ci95Upper,
  }));

  const zip = new JSZip();
  zip.file('learning_rate_by_block.csv', toCsv(learningRows));
  zip.file('learning_rate_summary.csv', toCsv(learningSummaryRows));
  zip.file('recall_time_trials.csv', toCsv(recallTrialRows));
  zip.file('recall_time_summary.csv', toCsv(recallSummaryRows));
  zip.file('testing_accuracy.csv', toCsv(accuracyRows));

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  triggerDownload(blob, `HFE-analysis_${stamp}.zip`);
}
