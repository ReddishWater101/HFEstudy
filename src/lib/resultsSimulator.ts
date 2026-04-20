import JSZip from 'jszip';

// This module is deliberately self-contained: it shares no runtime code with
// resultsAnalyzer.ts so the analyzer cannot be disturbed by changes here.

type Baselines = {
  accuracy: number;        // baseline p(correct) on quiz at skill = 0
  rtMeanSec: number;       // target E[RT] (seconds) for correct+incorrect
  rtSdSec: number;         // target SD[RT] (seconds)
  knowItHazard: number[];  // per-exposure hazard: p(first-know-it at k | not yet)
};

// Extrapolated from docs/imageA.png (learning curves), imageB.png (recall-time),
// and imageC.png (accuracy). These are the *shape* of what a real batch looks
// like. When the user loads the generated ZIPs back into the analyzer, the
// resulting charts should broadly resemble those images.
const MODE_BASELINES: Record<Mode, Baselines> = {
  1: { accuracy: 0.94, rtMeanSec: 2.93, rtSdSec: 1.89, knowItHazard: [0.62, 0.61, 0.53, 0.35] },
  2: { accuracy: 0.97, rtMeanSec: 2.67, rtSdSec: 1.89, knowItHazard: [0.73, 0.30, 0.30, 0.30] },
  3: { accuracy: 0.88, rtMeanSec: 3.80, rtSdSec: 2.55, knowItHazard: [0.55, 0.40, 0.45, 0.35] },
  4: { accuracy: 0.93, rtMeanSec: 3.28, rtSdSec: 1.59, knowItHazard: [0.55, 0.55, 0.50, 0.45] },
};

// Latent participant skill: each simulated participant draws a z-score that
// shifts their accuracy / recall time / learning rate coherently. Without this
// the box plots look unnaturally tight.
const SKILL_SIGMA = 1.0;
const SKILL_ACCURACY_SLOPE = 0.5;  // logit shift on accuracy per z
const SKILL_RT_SLOPE = -0.15;      // ln(rt) shift per z (negative z ⇒ slower)
const SKILL_KNOWIT_SLOPE = 0.4;    // logit shift on know-it hazard per z

// Split of non-correct quiz outcomes. Mirrors the small tails visible in imageC
// where most participants are correct and the residual skews toward timeouts.
const FAILURE_INCORRECT = 0.25;
const FAILURE_IDK = 0.25;
// timeout is the remainder (0.50).

function randNormal(): number {
  // Box-Muller
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function logit(p: number): number {
  const eps = 1e-6;
  const q = Math.min(1 - eps, Math.max(eps, p));
  return Math.log(q / (1 - q));
}

function invLogit(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

// Draw from a lognormal parameterised so E[X] = meanSec and SD[X] ≈ sdSec.
function drawLognormalSeconds(meanSec: number, sdSec: number): number {
  const cv = sdSec / meanSec;
  const sigma = Math.sqrt(Math.log(1 + cv * cv));
  const mu = Math.log(meanSec) - (sigma * sigma) / 2;
  return Math.exp(mu + sigma * randNormal());
}

function pickFailureOutcome(): 'incorrect' | 'idk' | 'timeout' {
  const r = Math.random();
  if (r < FAILURE_INCORRECT) return 'incorrect';
  if (r < FAILURE_INCORRECT + FAILURE_IDK) return 'idk';
  return 'timeout';
}

function shuffle<T>(arr: readonly T[]): T[] {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function assignModesEvenly(peopleIds: readonly string[], enabledModes: readonly Mode[]): Record<string, Mode> {
  const shuffled = shuffle(peopleIds);
  const assignment: Record<string, Mode> = {};
  shuffled.forEach((pid, i) => {
    assignment[pid] = enabledModes[i % enabledModes.length];
  });
  return assignment;
}

type SimParticipant = {
  participantId: string;
  intake: IntakeData;
  modeAssignment: Record<string, Mode>;
  people: { id: string; firstName: string }[];
  events: SessionEvent[];
};

function simulateParticipant(config: StudyConfig, index: number): SimParticipant {
  const suffix = (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Math.random()}`)
    .replace(/-/g, '')
    .slice(0, 8);
  const participantId = `SIM-${String(index + 1).padStart(4, '0')}-${suffix}`;
  const intake: IntakeData = {
    firstName: `Sim${index + 1}`,
    lastName: 'Participant',
    email: `sim${index + 1}@simulated.local`,
  };

  const skillZ = randNormal() * SKILL_SIGMA;

  const personMap = config.personMap ?? {};
  const people = config.people.map((id) => ({
    id,
    firstName: personMap[id] ?? `Unknown-${id.slice(0, 4)}`,
  }));

  const enabledModes: Mode[] = config.enabledModes.length > 0 ? config.enabledModes : [1];
  const modeAssignment = assignModesEvenly(config.people, enabledModes);

  const events: SessionEvent[] = [];
  let t = 0;
  const tick = (ms: number) => {
    t += ms;
    return t;
  };

  events.push({
    type: 'session.start',
    t,
    participantId,
    intake,
    modeAssignment,
    people,
    studyConfigId: config.id,
    blockCount: config.flashcardBlockCount,
    enabledModes,
  });
  tick(800);

  // Flashcard simulation. For each block, each not-yet-learned face is shown
  // up to 2 times; bucketed as know-it with probability driven by the per-mode
  // hazard (shifted by participant skill). Once bucketed as know-it the face
  // is removed from subsequent blocks, mirroring the real UI.
  const exposureCount = new Map<string, number>();
  const hasLearned = new Set<string>();
  const maxExposuresPerPair = Math.max(2, config.flashcardBlockCount * 2);

  for (let block = 1; block <= config.flashcardBlockCount; block++) {
    const blockLabel = String(block);
    const order = shuffle(people);
    for (const person of order) {
      if (hasLearned.has(person.id)) continue;
      const mode = modeAssignment[person.id];
      if (!mode) continue;
      const baseline = MODE_BASELINES[mode];
      const priorSoFar = exposureCount.get(person.id) ?? 0;
      if (priorSoFar >= maxExposuresPerPair) continue;
      const budgetThisBlock = Math.min(2, maxExposuresPerPair - priorSoFar);

      for (let k = 0; k < budgetThisBlock; k++) {
        const exposureNum = (exposureCount.get(person.id) ?? 0) + 1;
        const hazardIdx = Math.min(exposureNum - 1, baseline.knowItHazard.length - 1);
        const baseHazard = baseline.knowItHazard[hazardIdx] ?? 0.3;
        const shifted = invLogit(logit(baseHazard) + SKILL_KNOWIT_SLOPE * skillZ);
        const knowIt = Math.random() < shifted;
        const durationMs = Math.max(
          400,
          Math.round(1500 + Math.abs(randNormal()) * 1200),
        );

        events.push({
          type: 'flashcard.show',
          t,
          personId: person.id,
          mode,
          blockLabel,
        });
        tick(120);
        events.push({
          type: 'flashcard.bucket',
          t,
          personId: person.id,
          bucket: knowIt ? 'know-it' : 'still-learning',
          durationMs,
        });
        exposureCount.set(person.id, exposureNum);
        tick(80);

        if (knowIt) {
          hasLearned.add(person.id);
          break;
        }
      }
    }
  }

  // Quiz — one trial per face.
  for (const person of shuffle(people)) {
    const mode = modeAssignment[person.id];
    if (!mode) continue;
    const baseline = MODE_BASELINES[mode];
    const accShifted = invLogit(logit(baseline.accuracy) + SKILL_ACCURACY_SLOPE * skillZ);
    const rtScale = Math.exp(SKILL_RT_SLOPE * skillZ);

    if (Math.random() < accShifted) {
      const rtMs = Math.max(
        250,
        Math.round(drawLognormalSeconds(baseline.rtMeanSec, baseline.rtSdSec) * rtScale * 1000),
      );
      events.push({
        type: 'quiz.answer',
        t,
        personId: person.id,
        typed: person.firstName,
        correct: true,
        editDistance: 0,
        rtMs,
      });
      tick(300);
      continue;
    }

    const outcome = pickFailureOutcome();
    if (outcome === 'incorrect') {
      const rtMs = Math.max(
        250,
        Math.round(drawLognormalSeconds(baseline.rtMeanSec * 1.15, baseline.rtSdSec) * rtScale * 1000),
      );
      events.push({
        type: 'quiz.answer',
        t,
        personId: person.id,
        typed: fuzzTyped(person.firstName),
        correct: false,
        editDistance: 3,
        rtMs,
      });
      tick(300);
    } else if (outcome === 'idk') {
      const rtMs = Math.max(200, Math.round(drawLognormalSeconds(1.5, 0.8) * 1000));
      events.push({
        type: 'quiz.idk',
        t,
        personId: person.id,
        rtMs,
      });
      tick(300);
    } else {
      events.push({
        type: 'quiz.timeout',
        t,
        personId: person.id,
      });
      tick(300);
    }
  }

  events.push({ type: 'session.finalize', t });

  return { participantId, intake, modeAssignment, people, events };
}

function fuzzTyped(firstName: string): string {
  if (firstName.length <= 2) return firstName + 'xz';
  const head = firstName.slice(0, Math.max(2, firstName.length - 2)).toLowerCase();
  return `${head}xz`;
}

export type StudyConfigValidation =
  | { ok: true; config: StudyConfig }
  | { ok: false; error: string };

// Non-throwing validator so the UI can show the error message without a crash.
export function validateStudyConfig(raw: unknown): StudyConfigValidation {
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, error: 'JSON root must be an object.' };
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.id !== 'string' || obj.id.length === 0) {
    return { ok: false, error: 'Missing "id" string.' };
  }
  if (!Array.isArray(obj.people) || obj.people.length === 0) {
    return { ok: false, error: '"people" must be a non-empty array.' };
  }
  if (!obj.people.every((p) => typeof p === 'string')) {
    return { ok: false, error: '"people" entries must all be strings.' };
  }
  if (!Array.isArray(obj.enabledModes) || obj.enabledModes.length === 0) {
    return { ok: false, error: '"enabledModes" must be a non-empty array.' };
  }
  const validModes = obj.enabledModes.every((m) => m === 1 || m === 2 || m === 3 || m === 4);
  if (!validModes) {
    return { ok: false, error: '"enabledModes" entries must each be 1, 2, 3, or 4.' };
  }
  if (typeof obj.flashcardBlockCount !== 'number' || obj.flashcardBlockCount < 1) {
    return { ok: false, error: '"flashcardBlockCount" must be a positive number.' };
  }
  return { ok: true, config: raw as StudyConfig };
}

export async function simulateResultsZip(
  config: StudyConfig,
  sampleSize: number,
  onProgress?: (done: number, total: number) => void,
): Promise<Blob> {
  const outer = new JSZip();

  for (let i = 0; i < sampleSize; i++) {
    const sim = simulateParticipant(config, i);

    const sessionJson = {
      participantId: sim.participantId,
      studyConfigId: config.id,
      modeAssignment: sim.modeAssignment,
      people: sim.people,
      intake: sim.intake,
      events: sim.events,
    };

    const inner = new JSZip();
    inner.file('session.json', JSON.stringify(sessionJson, null, 2));
    inner.file(
      'events.jsonl',
      sim.events.map((ev) => JSON.stringify(ev)).join('\n') + '\n',
    );

    const innerBlob = await inner.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    outer.file(`${sim.participantId}.zip`, innerBlob);

    onProgress?.(i + 1, sampleSize);
  }

  return await outer.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

export function triggerSimulatorDownload(blob: Blob, sampleSize: number): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  anchor.download = `HFE-simulated-N${sampleSize}_${stamp}.zip`;
  document.body.appendChild(anchor);
  anchor.click();
  window.setTimeout(() => {
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, 100);
}
