import {
  ALL_MODES,
  MODE_COLORS,
  MODE_LABELS,
  MODE_SHORT_LABELS,
  type AnovaOutput,
  type LearningCurvePoint,
  type LearningData,
} from '../../lib/resultsAnalyzer';

const WIDTH = 760;
const HEIGHT = 360;
const PADDING = { top: 24, right: 28, bottom: 56, left: 56 };
const Y_TICKS = [0, 0.25, 0.5, 0.75, 1];

function computeXTicks(maxExposure: number): number[] {
  if (maxExposure <= 1) return [1];
  if (maxExposure <= 12) {
    return Array.from({ length: maxExposure }, (_, i) => i + 1);
  }
  // Aim for ~7 labels, stepped on nice integer increments.
  const rawStep = maxExposure / 6;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const normalized = rawStep / magnitude;
  let nice: number;
  if (normalized <= 1) nice = 1;
  else if (normalized <= 2) nice = 2;
  else if (normalized <= 5) nice = 5;
  else nice = 10;
  const step = Math.max(1, Math.round(nice * magnitude));
  const ticks: number[] = [1];
  for (let t = step; t < maxExposure; t += step) {
    if (t !== 1) ticks.push(t);
  }
  if (ticks[ticks.length - 1] !== maxExposure) ticks.push(maxExposure);
  return ticks;
}

function xForExposure(exposureNumber: number, maxExposure: number): number {
  const chartWidth = WIDTH - PADDING.left - PADDING.right;
  if (maxExposure <= 1) return PADDING.left + chartWidth;
  return PADDING.left + ((exposureNumber - 1) / (maxExposure - 1)) * chartWidth;
}

function yForRate(rate: number): number {
  const chartHeight = HEIGHT - PADDING.top - PADDING.bottom;
  return PADDING.top + (1 - Math.max(0, Math.min(1, rate))) * chartHeight;
}

function formatPercent(value: number | null, digits = 0): string {
  if (value === null || Number.isNaN(value)) return '--';
  return `${(value * 100).toFixed(digits)}%`;
}

function formatExposures(value: number | null, digits = 1): string {
  if (value === null || Number.isNaN(value)) return '--';
  return value.toFixed(digits);
}

export function LearningRateChart({
  data,
  anova,
}: {
  data: LearningData;
  anova: AnovaOutput;
}) {
  const hasData = data.points.length > 0;
  const maxExposure = Math.max(1, data.maxExposure);
  const xTicks = computeXTicks(maxExposure);

  return (
    <section className="flex flex-col gap-3 bg-white px-6 py-6">
      <header className="flex flex-col gap-1">
        <span className="text-xs uppercase tracking-widest text-neutral-400">
          Dependent variable 1
        </span>
        <h3 className="font-display text-2xl leading-none text-neutral-900">
          Exposures until &quot;I know it&quot;
        </h3>
        <p className="max-w-3xl text-sm text-neutral-500">
          Each (participant, face) pair contributes one exposure sequence; the curve
          shows the cumulative share of pairs that have been bucketed as
          &quot;know-it&quot; at least once by that exposure. Higher and earlier is
          faster learning. Pairs that never reach know-it keep the line below 100%.
        </p>
      </header>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          {hasData ? (
            <svg
              viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
              preserveAspectRatio="xMidYMid meet"
              className="h-auto w-full"
              role="img"
              aria-label="Cumulative share of face-participant pairs that have reached know-it by exposure number, one line per mode"
            >
              {Y_TICKS.map((tick) => {
                const y = yForRate(tick);
                return (
                  <g key={tick}>
                    <line
                      x1={PADDING.left}
                      x2={WIDTH - PADDING.right}
                      y1={y}
                      y2={y}
                      stroke="#e5e5e5"
                      strokeWidth="1"
                    />
                    <text
                      x={PADDING.left - 10}
                      y={y + 4}
                      textAnchor="end"
                      className="fill-neutral-400 text-[11px]"
                    >
                      {Math.round(tick * 100)}%
                    </text>
                  </g>
                );
              })}

              {xTicks.map((n) => {
                const x = xForExposure(n, maxExposure);
                return (
                  <g key={n}>
                    <line
                      x1={x}
                      x2={x}
                      y1={PADDING.top}
                      y2={HEIGHT - PADDING.bottom}
                      stroke="#f2f2f2"
                      strokeWidth="1"
                    />
                    <text
                      x={x}
                      y={HEIGHT - PADDING.bottom + 18}
                      textAnchor="middle"
                      className="fill-neutral-400 text-[11px]"
                    >
                      {n}
                    </text>
                  </g>
                );
              })}

              <text
                x={PADDING.left - 40}
                y={PADDING.top + (HEIGHT - PADDING.top - PADDING.bottom) / 2}
                textAnchor="middle"
                transform={`rotate(-90, ${PADDING.left - 40}, ${
                  PADDING.top + (HEIGHT - PADDING.top - PADDING.bottom) / 2
                })`}
                className="fill-neutral-500 text-[11px]"
              >
                Cumulative know-it rate
              </text>
              <text
                x={PADDING.left + (WIDTH - PADDING.left - PADDING.right) / 2}
                y={HEIGHT - 8}
                textAnchor="middle"
                className="fill-neutral-500 text-[11px]"
              >
                Exposure number
              </text>

              {ALL_MODES.map((mode) => (
                <ModeSeries
                  key={mode}
                  mode={mode}
                  points={data.points.filter((p) => p.mode === mode)}
                  maxExposure={maxExposure}
                />
              ))}
            </svg>
          ) : (
            <EmptyState />
          )}

          <Legend />
        </div>

        <aside className="w-full shrink-0 lg:w-72">
          <StatsTable summary={data.summary} anova={anova} />
        </aside>
      </div>
    </section>
  );
}

function ModeSeries({
  mode,
  points,
  maxExposure,
}: {
  mode: Mode;
  points: LearningCurvePoint[];
  maxExposure: number;
}) {
  if (points.length === 0) return null;

  const sorted = points.slice().sort((a, b) => a.exposureNumber - b.exposureNumber);
  const color = MODE_COLORS[mode];

  // Prepend (0, 0) so every curve visibly starts at the origin.
  const linePath = [
    `M ${xForExposure(1, maxExposure) - 0.001} ${yForRate(0)}`,
    ...sorted.map((p) => `L ${xForExposure(p.exposureNumber, maxExposure)} ${yForRate(p.rate)}`),
  ].join(' ');

  return (
    <g>
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth="2.25"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {sorted.map((p) => (
        <circle
          key={p.exposureNumber}
          cx={xForExposure(p.exposureNumber, maxExposure)}
          cy={yForRate(p.rate)}
          r="3"
          fill={color}
          stroke="#ffffff"
          strokeWidth="1"
        >
          <title>
            {`${MODE_LABELS[mode]} - by exposure ${p.exposureNumber}: ${p.cumulativeLearned}/${p.totalPairs} pairs learned (${formatPercent(
              p.rate,
              1,
            )})`}
          </title>
        </circle>
      ))}
    </g>
  );
}

function Legend() {
  return (
    <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2 text-xs text-neutral-500">
      {ALL_MODES.map((mode) => (
        <div key={mode} className="flex items-center gap-2">
          <span
            className="inline-block h-2.5 w-4 rounded-sm"
            style={{ backgroundColor: MODE_COLORS[mode] }}
            aria-hidden
          />
          <span>
            Mode {mode}: {MODE_LABELS[mode]}
          </span>
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-[220px] items-center justify-center border border-dashed border-neutral-200 text-sm text-neutral-400">
      No flashcard exposures recorded yet.
    </div>
  );
}

function StatsTable({
  summary,
  anova,
}: {
  summary: LearningData['summary'];
  anova: AnovaOutput;
}) {
  return (
    <div className="flex flex-col gap-3">
      <h4 className="text-xs uppercase tracking-widest text-neutral-400">
        Per-mode summary
      </h4>
      <table className="w-full text-[12px] text-neutral-700">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-widest text-neutral-400">
            <th className="py-1 font-medium">Mode</th>
            <th className="py-1 text-right font-medium">Learned</th>
            <th className="py-1 text-right font-medium">Median exp.</th>
            <th className="py-1 text-right font-medium">Pairs</th>
            <th className="py-1 text-right font-medium">n</th>
          </tr>
        </thead>
        <tbody>
          {summary.map((row) => (
            <tr key={row.mode} className="border-t border-neutral-100">
              <td className="py-2">
                <span className="flex items-center gap-2">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-sm"
                    style={{ backgroundColor: MODE_COLORS[row.mode] }}
                    aria-hidden
                  />
                  <span>{MODE_SHORT_LABELS[row.mode]}</span>
                </span>
              </td>
              <td className="py-2 text-right tabular-nums">
                {formatPercent(row.finalRate)}
              </td>
              <td className="py-2 text-right tabular-nums">
                {formatExposures(row.medianExposuresToLearn)}
              </td>
              <td className="py-2 text-right tabular-nums">{row.totalPairs || '--'}</td>
              <td className="py-2 text-right tabular-nums">
                {row.participantCount || '--'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <AnovaBlock anova={anova} />
      <p className="text-[11px] leading-snug text-neutral-400">
        Learned = share of pairs that ever reached know-it. Median exp. = median
        number of exposures until first know-it (among pairs that learned). Pairs =
        (participant, face) denominators for this mode. n = distinct participants.
      </p>
    </div>
  );
}

function formatF(value: number): string {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(2);
}

function formatP(value: number): string {
  if (!Number.isFinite(value)) return '--';
  if (value < 0.001) return '<.001';
  return value.toFixed(3).replace(/^0/, '');
}

function formatEta(value: number): string {
  if (!Number.isFinite(value)) return '--';
  const clamped = Math.max(0, Math.min(0.999, value));
  return clamped.toFixed(2).replace(/^0/, '');
}

function interpretP(p: number): string {
  if (!Number.isFinite(p)) return '--';
  if (p < 0.001) return 'very significant';
  if (p < 0.05) return 'significant';
  if (p < 0.10) return 'marginal';
  return 'not significant';
}

function anovaUnavailableReason(anova: Extract<AnovaOutput, { ok: false }>): string {
  switch (anova.info.reason) {
    case 'no-complete-cases':
      return 'no complete cases';
    case 'one-group-only':
      return 'need both Cue and NoCue participants';
    case 'insufficient-data':
      return 'need ≥2 participants per group';
  }
}

function AnovaBlock({ anova }: { anova: AnovaOutput }) {
  if (!anova.ok) {
    return (
      <div className="flex flex-col gap-2">
        <h4 className="text-xs uppercase tracking-widest text-neutral-400">
          ANOVA (mixed 2×2)
        </h4>
        <p className="text-[11px] text-neutral-400">
          ANOVA unavailable — {anovaUnavailableReason(anova)}
        </p>
      </div>
    );
  }
  const { effects, nCue, nNoCue } = anova.result;
  const N = nCue + nNoCue;
  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-xs uppercase tracking-widest text-neutral-400">
        ANOVA (mixed 2×2)
      </h4>
      <table className="w-full text-[12px] text-neutral-700">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-widest text-neutral-400">
            <th className="py-1 font-medium">Effect</th>
            <th className="py-1 text-right font-medium">F</th>
            <th className="py-1 text-right font-medium">p</th>
            <th className="py-1 text-right font-medium">ges</th>
            <th className="py-1 font-medium">Interpretation</th>
          </tr>
        </thead>
        <tbody>
          {effects.map((e) => (
            <tr key={e.name} className="border-t border-neutral-100">
              <td className="py-2">{e.name}</td>
              <td className="py-2 text-right tabular-nums">{formatF(e.F)}</td>
              <td className="py-2 text-right tabular-nums">{formatP(e.p)}</td>
              <td className="py-2 text-right tabular-nums">
                {formatEta(e.generalizedEtaSq)}
              </td>
              <td className="py-2 whitespace-nowrap text-[12px] text-neutral-600">
                {interpretP(e.p)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[11px] text-neutral-400">df = (1, {N - 2})</p>
    </div>
  );
}
