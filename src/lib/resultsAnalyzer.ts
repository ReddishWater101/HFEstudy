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

// One point on the cumulative learn-it curve for a single mode.
export type LearningCurvePoint = {
  mode: Mode;
  exposureNumber: number;
  cumulativeLearned: number;
  totalPairs: number;
  rate: number;
};

export type LearningModeSummary = {
  mode: Mode;
  label: string;
  // Total (participant, face) pairs in this mode across all uploaded sessions.
  totalPairs: number;
  // Pairs that reached "know-it" at least once during their exposures.
  everLearned: number;
  // everLearned / totalPairs. Null when totalPairs is 0.
  finalRate: number | null;
  // Median first-know-it exposure number among pairs that ever learned. Null if none did.
  medianExposuresToLearn: number | null;
  // Distinct participants contributing faces in this mode.
  participantCount: number;
};

export type LearningData = {
  points: LearningCurvePoint[];
  summary: LearningModeSummary[];
  maxExposure: number;
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

export type AnovaEffect = {
  name: 'Group' | 'Modality' | 'Group × Modality';
  F: number;
  df1: number;
  df2: number;
  p: number;
  generalizedEtaSq: number;
};

export type AnovaResult = {
  effects: AnovaEffect[];
  nCue: number;
  nNoCue: number;
  nExcluded: number;
};

export type AnovaUnavailable = {
  reason: 'insufficient-data' | 'one-group-only' | 'no-complete-cases';
  nCue: number;
  nNoCue: number;
  nExcluded: number;
};

export type AnovaOutput =
  | { ok: true; result: AnovaResult }
  | { ok: false; info: AnovaUnavailable };

export type AnalyzerBatch = {
  sessions: UploadedAnalysisSession[];
  failures: UploadFailure[];
  participantCount: number;
  learning: LearningData;
  recallTime: RecallTimeModeData[];
  accuracy: AccuracyModeData[];
  anovaLearning: AnovaOutput;
  anovaRecallTime: AnovaOutput;
  anovaAccuracy: AnovaOutput;
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
    try {
      const parsed = JSON.parse(trimmed) as SessionEvent;
      if (isObject(parsed) && typeof parsed.type === 'string') {
        events.push(parsed);
      }
    } catch {
      // Skip a single malformed line rather than discarding the whole session.
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

function buildLearningData(sessions: UploadedAnalysisSession[]): LearningData {
  // For each (participant, face) pair, walk all exposures in chronological order
  // across the entire session (blocks are ignored per spec) and record at which
  // exposure number the first "know-it" bucket happens, or null if never.
  // Denominator for each mode is the full set of pairs in that mode; pairs that
  // never reach criterion keep the final rate below 100%.
  const pairsByMode = new Map<Mode, Array<{ firstKnowIt: number | null }>>();
  const participantsPerMode = new Map<Mode, Set<string>>();

  for (const session of sessions) {
    const byPerson = new Map<
      string,
      { count: number; mode: Mode; firstKnowIt: number | null }
    >();
    for (const exp of collectExposures(session)) {
      if (exp.mode === null) continue;
      const cur = byPerson.get(exp.personId) ?? { count: 0, mode: exp.mode, firstKnowIt: null };
      cur.count += 1;
      if (exp.bucket === 'know-it' && cur.firstKnowIt === null) {
        cur.firstKnowIt = cur.count;
      }
      byPerson.set(exp.personId, cur);
    }

    for (const info of byPerson.values()) {
      const arr = pairsByMode.get(info.mode) ?? [];
      arr.push({ firstKnowIt: info.firstKnowIt });
      pairsByMode.set(info.mode, arr);

      let pm = participantsPerMode.get(info.mode);
      if (!pm) {
        pm = new Set();
        participantsPerMode.set(info.mode, pm);
      }
      pm.add(session.participantId);
    }
  }

  // Max x-axis value: largest first-know-it exposure across all modes. Beyond that
  // all cumulative curves plateau, so there's no point plotting further.
  let maxExposure = 0;
  for (const pairs of pairsByMode.values()) {
    for (const p of pairs) {
      if (p.firstKnowIt !== null && p.firstKnowIt > maxExposure) {
        maxExposure = p.firstKnowIt;
      }
    }
  }
  maxExposure = Math.max(maxExposure, 1);

  const points: LearningCurvePoint[] = [];
  for (const mode of ALL_MODES) {
    const pairs = pairsByMode.get(mode) ?? [];
    const totalPairs = pairs.length;
    if (totalPairs === 0) continue;

    // Precompute a sorted list of firstKnowIt values so cumulative is O(n) total.
    const sortedFirst = pairs
      .map((p) => p.firstKnowIt)
      .filter((v): v is number => v !== null)
      .sort((a, b) => a - b);

    let cursor = 0;
    for (let n = 1; n <= maxExposure; n++) {
      while (cursor < sortedFirst.length && sortedFirst[cursor] <= n) cursor += 1;
      points.push({
        mode,
        exposureNumber: n,
        cumulativeLearned: cursor,
        totalPairs,
        rate: cursor / totalPairs,
      });
    }
  }

  const summary: LearningModeSummary[] = ALL_MODES.map((mode) => {
    const pairs = pairsByMode.get(mode) ?? [];
    const totalPairs = pairs.length;
    const learned = pairs
      .map((p) => p.firstKnowIt)
      .filter((v): v is number => v !== null);
    const sortedLearned = learned.slice().sort((a, b) => a - b);
    return {
      mode,
      label: MODE_LABELS[mode],
      totalPairs,
      everLearned: learned.length,
      finalRate: totalPairs > 0 ? learned.length / totalPairs : null,
      medianExposuresToLearn: percentile(sortedLearned, 0.5),
      participantCount: participantsPerMode.get(mode)?.size ?? 0,
    };
  });

  return { points, summary, maxExposure };
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

// ---------------------------------------------------------------------------
// ANOVA (mixed 2x2: Group between, Modality within) — pure TS, no libraries.
// ---------------------------------------------------------------------------

type Modality = 'Audio' | 'Visual';
type Group = 'Cue' | 'NoCue';

// Mode -> (Group, Modality) mapping.
// Mode 1 (P+T):  Cue,   Visual
// Mode 2 (P+A):  Cue,   Audio
// Mode 3 (NP+T): NoCue, Visual
// Mode 4 (NP+A): NoCue, Audio
function modeToFactors(mode: Mode): { group: Group; modality: Modality } {
  switch (mode) {
    case 1:
      return { group: 'Cue', modality: 'Visual' };
    case 2:
      return { group: 'Cue', modality: 'Audio' };
    case 3:
      return { group: 'NoCue', modality: 'Visual' };
    case 4:
      return { group: 'NoCue', modality: 'Audio' };
  }
}

function inferParticipantGroup(modes: Iterable<Mode>): Group | null {
  let sawCue = false;
  let sawNoCue = false;
  for (const mode of modes) {
    if (mode === 1 || mode === 2) sawCue = true;
    else if (mode === 3 || mode === 4) sawNoCue = true;
  }
  if (sawCue && !sawNoCue) return 'Cue';
  if (sawNoCue && !sawCue) return 'NoCue';
  return null;
}

type ParticipantCell = {
  participantId: string;
  group: Group;
  audio: number | null;
  visual: number | null;
};

function gammaln(x: number): number {
  const c = [
    76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.001208650973866179, -0.000005395239384953,
  ];
  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) ser += c[j] / ++y;
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

function betacf(a: number, b: number, x: number): number {
  const MAXIT = 200;
  const EPS = 3e-7;
  const FPMIN = 1e-30;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

function betainc(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(
    gammaln(a + b) -
      gammaln(a) -
      gammaln(b) +
      a * Math.log(x) +
      b * Math.log(1 - x),
  );
  if (x < (a + 1) / (a + b + 2)) return (bt * betacf(a, b, x)) / a;
  return 1 - (bt * betacf(b, a, 1 - x)) / b;
}

// Upper-tail p-value for F(df1, df2) at value f.
function fPValue(f: number, df1: number, df2: number): number {
  if (!Number.isFinite(f) || f <= 0) return 1;
  const x = df2 / (df2 + df1 * f);
  return betainc(df2 / 2, df1 / 2, x);
}

// Run a 2x2 mixed ANOVA on a list of participant cells. Participants missing
// either modality score are dropped; counts are reported back via nExcluded.
function runMixedAnova(cells: ParticipantCell[]): AnovaOutput {
  const included = cells.filter((c) => c.audio !== null && c.visual !== null) as Array<
    ParticipantCell & { audio: number; visual: number }
  >;
  const excluded = cells.length - included.length;

  const cueCells = included.filter((c) => c.group === 'Cue');
  const noCueCells = included.filter((c) => c.group === 'NoCue');
  const nCue = cueCells.length;
  const nNoCue = noCueCells.length;
  const N = nCue + nNoCue;

  if (N === 0) {
    return {
      ok: false,
      info: { reason: 'no-complete-cases', nCue, nNoCue, nExcluded: excluded },
    };
  }
  if (nCue === 0 || nNoCue === 0) {
    return {
      ok: false,
      info: { reason: 'one-group-only', nCue, nNoCue, nExcluded: excluded },
    };
  }
  if (nCue < 2 || nNoCue < 2 || N < 4) {
    return {
      ok: false,
      info: { reason: 'insufficient-data', nCue, nNoCue, nExcluded: excluded },
    };
  }

  // Grand mean across all 2N observations.
  let sumAll = 0;
  for (const c of included) sumAll += c.audio + c.visual;
  const Mgrand = sumAll / (2 * N);

  // Group means (across both modalities).
  let sumCue = 0;
  for (const c of cueCells) sumCue += c.audio + c.visual;
  let sumNoCue = 0;
  for (const c of noCueCells) sumNoCue += c.audio + c.visual;
  const Mc = sumCue / (2 * nCue);
  const Mn = sumNoCue / (2 * nNoCue);

  // Modality means (across both groups).
  let sumA = 0;
  let sumV = 0;
  for (const c of included) {
    sumA += c.audio;
    sumV += c.visual;
  }
  const Ma = sumA / N;
  const Mv = sumV / N;

  // Cell means.
  let sumCA = 0;
  let sumCV = 0;
  for (const c of cueCells) {
    sumCA += c.audio;
    sumCV += c.visual;
  }
  let sumNA = 0;
  let sumNV = 0;
  for (const c of noCueCells) {
    sumNA += c.audio;
    sumNV += c.visual;
  }
  const Mca = sumCA / nCue;
  const Mcv = sumCV / nCue;
  const Mna = sumNA / nNoCue;
  const Mnv = sumNV / nNoCue;

  // Sums of squares.
  let SSbetween = 0;
  for (const c of included) {
    const Sk = (c.audio + c.visual) / 2;
    SSbetween += (Sk - Mgrand) * (Sk - Mgrand);
  }
  SSbetween *= 2;

  const SSgroup =
    2 *
    (nCue * (Mc - Mgrand) * (Mc - Mgrand) + nNoCue * (Mn - Mgrand) * (Mn - Mgrand));
  const SSsubjWithin = SSbetween - SSgroup;

  let SStotal = 0;
  for (const c of included) {
    SStotal += (c.audio - Mgrand) * (c.audio - Mgrand);
    SStotal += (c.visual - Mgrand) * (c.visual - Mgrand);
  }
  const SSwithin = SStotal - SSbetween;

  const SSmodality =
    N * ((Ma - Mgrand) * (Ma - Mgrand) + (Mv - Mgrand) * (Mv - Mgrand));

  const iCA = Mca - Mc - Ma + Mgrand;
  const iCV = Mcv - Mc - Mv + Mgrand;
  const iNA = Mna - Mn - Ma + Mgrand;
  const iNV = Mnv - Mn - Mv + Mgrand;
  const SSinteraction =
    nCue * iCA * iCA +
    nCue * iCV * iCV +
    nNoCue * iNA * iNA +
    nNoCue * iNV * iNV;

  const SSerrorWithin = SSwithin - SSmodality - SSinteraction;

  const dfGroup = 1;
  const dfSubjWithin = N - 2;
  const dfModality = 1;
  const dfInteraction = 1;
  const dfErrorWithin = N - 2;

  const msSubjWithin = SSsubjWithin / dfSubjWithin;
  const msErrorWithin = SSerrorWithin / dfErrorWithin;

  const Fgroup = msSubjWithin > 0 ? SSgroup / dfGroup / msSubjWithin : Number.POSITIVE_INFINITY;
  const Fmodality =
    msErrorWithin > 0 ? SSmodality / dfModality / msErrorWithin : Number.POSITIVE_INFINITY;
  const Finteraction =
    msErrorWithin > 0
      ? SSinteraction / dfInteraction / msErrorWithin
      : Number.POSITIVE_INFINITY;

  const pGroup = fPValue(Fgroup, dfGroup, dfSubjWithin);
  const pModality = fPValue(Fmodality, dfModality, dfErrorWithin);
  const pInteraction = fPValue(Finteraction, dfInteraction, dfErrorWithin);

  // Generalized eta-squared (Olejnik & Algina 2003, Bakeman 2005).
  // For a mixed 2x2 design with one between factor (Group) and one within
  // factor (Modality), every "measured" effect pools both the between-subject
  // error (SS_subjWithin) and the within-subject error (SS_errorWithin) in the
  // denominator — identical across all three effects, only the effect SS in
  // the numerator (and the leading term of the denominator) changes.
  const denominatorCommon = SSsubjWithin + SSerrorWithin;
  const gesDenomGroup = SSgroup + denominatorCommon;
  const gesDenomModality = SSmodality + denominatorCommon;
  const gesDenomInteraction = SSinteraction + denominatorCommon;
  const gesGroup = gesDenomGroup > 0 ? SSgroup / gesDenomGroup : 0;
  const gesModality = gesDenomModality > 0 ? SSmodality / gesDenomModality : 0;
  const gesInteraction =
    gesDenomInteraction > 0 ? SSinteraction / gesDenomInteraction : 0;

  return {
    ok: true,
    result: {
      effects: [
        {
          name: 'Group',
          F: Fgroup,
          df1: dfGroup,
          df2: dfSubjWithin,
          p: pGroup,
          generalizedEtaSq: gesGroup,
        },
        {
          name: 'Modality',
          F: Fmodality,
          df1: dfModality,
          df2: dfErrorWithin,
          p: pModality,
          generalizedEtaSq: gesModality,
        },
        {
          name: 'Group × Modality',
          F: Finteraction,
          df1: dfInteraction,
          df2: dfErrorWithin,
          p: pInteraction,
          generalizedEtaSq: gesInteraction,
        },
      ],
      nCue,
      nNoCue,
      nExcluded: excluded,
    },
  };
}

// DV1 — Learning: proportion of (face) pairs ever bucketed know-it, per
// participant-and-modality. Excludes participants whose modes span both groups.
function collectLearningCells(sessions: UploadedAnalysisSession[]): ParticipantCell[] {
  const cells: ParticipantCell[] = [];

  // Deterministic participant order: alphabetical by participantId.
  const sorted = sessions.slice().sort((a, b) =>
    a.participantId < b.participantId ? -1 : a.participantId > b.participantId ? 1 : 0,
  );

  for (const session of sorted) {
    const exposures = collectExposures(session);
    const sessionModes = new Set<Mode>();
    for (const exp of exposures) {
      if (exp.mode !== null) sessionModes.add(exp.mode);
    }
    for (const mode of Object.values(session.modeAssignment)) {
      sessionModes.add(mode);
    }
    const group = inferParticipantGroup(sessionModes);
    if (group === null) continue;

    // Key per (personId) -> track if any know-it occurred, grouped by modality.
    const byPerson = new Map<string, { mode: Mode; firstKnowIt: number | null }>();
    // Count exposures in chronological order (collectExposures already returns
    // in chronological order).
    const counts = new Map<string, number>();
    for (const exp of exposures) {
      if (exp.mode === null) continue;
      const c = (counts.get(exp.personId) ?? 0) + 1;
      counts.set(exp.personId, c);
      const cur = byPerson.get(exp.personId) ?? { mode: exp.mode, firstKnowIt: null };
      if (exp.bucket === 'know-it' && cur.firstKnowIt === null) {
        cur.firstKnowIt = c;
      }
      byPerson.set(exp.personId, cur);
    }

    // Aggregate by modality.
    let audioTotal = 0;
    let audioLearned = 0;
    let visualTotal = 0;
    let visualLearned = 0;
    for (const info of byPerson.values()) {
      const { modality } = modeToFactors(info.mode);
      if (modality === 'Audio') {
        audioTotal += 1;
        if (info.firstKnowIt !== null) audioLearned += 1;
      } else {
        visualTotal += 1;
        if (info.firstKnowIt !== null) visualLearned += 1;
      }
    }

    cells.push({
      participantId: session.participantId,
      group,
      audio: audioTotal > 0 ? audioLearned / audioTotal : null,
      visual: visualTotal > 0 ? visualLearned / visualTotal : null,
    });
  }

  return cells;
}

// DV2 — Recall time: mean RT (seconds) across correct+incorrect trials per
// participant-and-modality.
function collectRecallTimeCells(sessions: UploadedAnalysisSession[]): ParticipantCell[] {
  const cells: ParticipantCell[] = [];

  const sorted = sessions.slice().sort((a, b) =>
    a.participantId < b.participantId ? -1 : a.participantId > b.participantId ? 1 : 0,
  );

  for (const session of sorted) {
    const attempts = collectQuizAttempts(session);
    const sessionModes = new Set<Mode>();
    for (const attempt of attempts) {
      if (attempt.mode !== null) sessionModes.add(attempt.mode);
    }
    for (const mode of Object.values(session.modeAssignment)) {
      sessionModes.add(mode);
    }
    const group = inferParticipantGroup(sessionModes);
    if (group === null) continue;

    let audioSum = 0;
    let audioN = 0;
    let visualSum = 0;
    let visualN = 0;
    for (const attempt of attempts) {
      if (attempt.mode === null) continue;
      if (attempt.outcome !== 'correct' && attempt.outcome !== 'incorrect') continue;
      if (attempt.rtMs === null) continue;
      const { modality } = modeToFactors(attempt.mode);
      const seconds = attempt.rtMs / 1000;
      if (modality === 'Audio') {
        audioSum += seconds;
        audioN += 1;
      } else {
        visualSum += seconds;
        visualN += 1;
      }
    }

    cells.push({
      participantId: session.participantId,
      group,
      audio: audioN > 0 ? audioSum / audioN : null,
      visual: visualN > 0 ? visualSum / visualN : null,
    });
  }

  return cells;
}

// DV3 — Accuracy: proportion correct across all 4 outcomes per
// participant-and-modality.
function collectAccuracyCells(sessions: UploadedAnalysisSession[]): ParticipantCell[] {
  const cells: ParticipantCell[] = [];

  const sorted = sessions.slice().sort((a, b) =>
    a.participantId < b.participantId ? -1 : a.participantId > b.participantId ? 1 : 0,
  );

  for (const session of sorted) {
    const attempts = collectQuizAttempts(session);
    const sessionModes = new Set<Mode>();
    for (const attempt of attempts) {
      if (attempt.mode !== null) sessionModes.add(attempt.mode);
    }
    for (const mode of Object.values(session.modeAssignment)) {
      sessionModes.add(mode);
    }
    const group = inferParticipantGroup(sessionModes);
    if (group === null) continue;

    let audioCorrect = 0;
    let audioTotal = 0;
    let visualCorrect = 0;
    let visualTotal = 0;
    for (const attempt of attempts) {
      if (attempt.mode === null) continue;
      const { modality } = modeToFactors(attempt.mode);
      if (modality === 'Audio') {
        audioTotal += 1;
        if (attempt.outcome === 'correct') audioCorrect += 1;
      } else {
        visualTotal += 1;
        if (attempt.outcome === 'correct') visualCorrect += 1;
      }
    }

    cells.push({
      participantId: session.participantId,
      group,
      audio: audioTotal > 0 ? audioCorrect / audioTotal : null,
      visual: visualTotal > 0 ? visualCorrect / visualTotal : null,
    });
  }

  return cells;
}

// Count sessions whose modes span both groups (mixed) — those are excluded
// and contribute to the "excluded" tally even though they never produced a
// ParticipantCell. Uses modeAssignment as the canonical source.
function countMixedGroupSessions(sessions: UploadedAnalysisSession[]): number {
  let mixed = 0;
  for (const session of sessions) {
    const sessionModes = new Set<Mode>();
    for (const mode of Object.values(session.modeAssignment)) {
      sessionModes.add(mode);
    }
    if (sessionModes.size === 0) continue;
    let sawCue = false;
    let sawNoCue = false;
    for (const mode of sessionModes) {
      if (mode === 1 || mode === 2) sawCue = true;
      else if (mode === 3 || mode === 4) sawNoCue = true;
    }
    if (sawCue && sawNoCue) mixed += 1;
  }
  return mixed;
}

function finalizeAnova(cells: ParticipantCell[], mixedCount: number): AnovaOutput {
  const result = runMixedAnova(cells);
  if (result.ok) {
    return {
      ok: true,
      result: {
        ...result.result,
        nExcluded: result.result.nExcluded + mixedCount,
      },
    };
  }
  return {
    ok: false,
    info: {
      ...result.info,
      nExcluded: result.info.nExcluded + mixedCount,
    },
  };
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
  const mixed = countMixedGroupSessions(sessions);
  return {
    sessions,
    failures,
    participantCount: sessions.length,
    learning: buildLearningData(sessions),
    recallTime: buildRecallTime(sessions),
    accuracy: buildAccuracy(sessions),
    anovaLearning: finalizeAnova(collectLearningCells(sessions), mixed),
    anovaRecallTime: finalizeAnova(collectRecallTimeCells(sessions), mixed),
    anovaAccuracy: finalizeAnova(collectAccuracyCells(sessions), mixed),
  };
}

export async function exportAnalyzerBatch(batch: AnalyzerBatch): Promise<void> {
  const learningRows = batch.learning.points.map((p) => ({
    mode: p.mode,
    modeLabel: MODE_LABELS[p.mode],
    exposureNumber: p.exposureNumber,
    cumulativeLearned: p.cumulativeLearned,
    totalPairs: p.totalPairs,
    rate: p.rate,
  }));

  const learningSummaryRows = batch.learning.summary.map((s) => ({
    mode: s.mode,
    modeLabel: s.label,
    participantCount: s.participantCount,
    totalPairs: s.totalPairs,
    everLearned: s.everLearned,
    finalRate: s.finalRate,
    medianExposuresToLearn: s.medianExposuresToLearn,
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
  zip.file('learning_curve_by_exposure.csv', toCsv(learningRows));
  zip.file('learning_curve_summary.csv', toCsv(learningSummaryRows));
  zip.file('recall_time_trials.csv', toCsv(recallTrialRows));
  zip.file('recall_time_summary.csv', toCsv(recallSummaryRows));
  zip.file('testing_accuracy.csv', toCsv(accuracyRows));

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  triggerDownload(blob, `HFE-analysis_${stamp}.zip`);
}
