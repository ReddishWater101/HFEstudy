import {
  MODE_LABELS,
  MODE_SHORT_LABELS,
  type AnovaOutput,
  type RecallTimeModeData,
} from '../../lib/resultsAnalyzer';

const WIDTH = 760;
const HEIGHT = 360;
const PADDING = { top: 24, right: 28, bottom: 76, left: 56 };

// Regroup the four modes into two modality clusters (Audio, Visual) with
// Cue/NoCue bars adjacent inside each cluster. Visual layout only — underlying
// data and stats are unchanged.
const DISPLAY_ORDER: readonly Mode[] = [2, 4, 1, 3];
const BAR_X_PCTS = [0.20, 0.30, 0.70, 0.80] as const;
const GROUP_CENTERS_PCT = [0.25, 0.75] as const;

// Two-colour palette keyed by Cue (phrase) vs NoCue (no-phrase). Matches the
// ggplot2 scale_fill_hue defaults from docs/grouping.png.
const GROUP_COLORS: Record<Mode, string> = {
  1: '#F8766D', // P+T  -> Cue   (salmon)
  2: '#F8766D', // P+A  -> Cue   (salmon)
  3: '#00BFC4', // NP+T -> NoCue (teal)
  4: '#00BFC4', // NP+A -> NoCue (teal)
};

const BAR_SUB_LABEL: Record<Mode, string> = {
  1: 'Cue',
  2: 'Cue',
  3: 'NoCue',
  4: 'NoCue',
};

function niceMax(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
  const normalized = raw / magnitude;
  let nice: number;
  if (normalized <= 1) nice = 1;
  else if (normalized <= 2) nice = 2;
  else if (normalized <= 2.5) nice = 2.5;
  else if (normalized <= 5) nice = 5;
  else nice = 10;
  return nice * magnitude;
}

// Deterministic jitter so dots don't jump between renders. Seeds with the mode
// as well as the trial index so the four columns don't share the same pattern.
function jitterOffset(mode: Mode, index: number, spread: number): number {
  const pseudo = Math.sin(mode * 928.37 + index * 12.9898) * 43758.5453;
  const normalized = pseudo - Math.floor(pseudo);
  return (normalized - 0.5) * 2 * spread;
}

function xForMode(mode: Mode): number {
  const chartWidth = WIDTH - PADDING.left - PADDING.right;
  const displayIdx = DISPLAY_ORDER.indexOf(mode);
  return PADDING.left + chartWidth * BAR_X_PCTS[displayIdx];
}

function xForGroup(groupIdx: 0 | 1): number {
  const chartWidth = WIDTH - PADDING.left - PADDING.right;
  return PADDING.left + chartWidth * GROUP_CENTERS_PCT[groupIdx];
}

function yForValue(value: number, maxValue: number): number {
  const chartHeight = HEIGHT - PADDING.top - PADDING.bottom;
  const clamped = Math.max(0, Math.min(maxValue, value));
  return PADDING.top + (1 - clamped / maxValue) * chartHeight;
}

function formatSec(value: number | null, digits = 2): string {
  if (value === null || Number.isNaN(value)) return '--';
  return `${value.toFixed(digits)}s`;
}

export function RecallTimeChart({
  data,
  anova,
}: {
  data: RecallTimeModeData[];
  anova: AnovaOutput;
}) {
  const allValues = data.flatMap((m) => m.rtSec);
  const hasData = allValues.length > 0;

  const rawMax = hasData ? Math.max(...allValues) : 1;
  const chartMax = niceMax(rawMax * 1.08);
  const tickValues = [0, chartMax / 4, chartMax / 2, (chartMax * 3) / 4, chartMax];

  const chartWidth = WIDTH - PADDING.left - PADDING.right;
  const withinPairPx = chartWidth * (BAR_X_PCTS[1] - BAR_X_PCTS[0]);
  const boxHalf = Math.min(24, withinPairPx * 0.35);
  const stripHalf = Math.min(30, withinPairPx * 0.46);

  return (
    <section className="flex flex-col gap-3 bg-white px-6 py-6">
      <header className="flex flex-col gap-1">
        <span className="text-xs uppercase tracking-widest text-neutral-400">
          Dependent variable 2
        </span>
        <h3 className="font-display text-2xl leading-none text-neutral-900">
          Recall time in quiz
        </h3>
        <p className="max-w-3xl text-sm text-neutral-500">
          Time from seeing a face to pressing Enter on a typed name, per quiz trial,
          grouped by mode. Box = Q1/median/Q3, whiskers = 1.5&middot;IQR, dots = trials.
          IDKs and timeouts excluded.
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
              aria-label="Box and strip plot of recall time per mode, grouped by modality"
            >
              {/* y grid + labels */}
              {tickValues.map((tick, i) => {
                const y = yForValue(tick, chartMax);
                return (
                  <g key={i}>
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
                      {tick.toFixed(tick < 10 && tick > 0 ? 1 : 0)}s
                    </text>
                  </g>
                );
              })}

              {/* y-axis title */}
              <text
                x={PADDING.left - 42}
                y={PADDING.top + (HEIGHT - PADDING.top - PADDING.bottom) / 2}
                textAnchor="middle"
                transform={`rotate(-90, ${PADDING.left - 42}, ${
                  PADDING.top + (HEIGHT - PADDING.top - PADDING.bottom) / 2
                })`}
                className="fill-neutral-500 text-[11px]"
              >
                Recall time (s)
              </text>

              {/* per-bar sub-labels (Cue / NoCue + n) */}
              {DISPLAY_ORDER.map((mode) => {
                const x = xForMode(mode);
                const entry = data.find((m) => m.mode === mode);
                const n = entry?.n ?? 0;
                return (
                  <g key={`label-${mode}`}>
                    <text
                      x={x}
                      y={HEIGHT - PADDING.bottom + 16}
                      textAnchor="middle"
                      className="fill-neutral-600 text-[11px]"
                    >
                      {BAR_SUB_LABEL[mode]}
                    </text>
                    <text
                      x={x}
                      y={HEIGHT - PADDING.bottom + 28}
                      textAnchor="middle"
                      className="fill-neutral-400 text-[10px]"
                    >
                      n={n}
                    </text>
                  </g>
                );
              })}

              {/* group labels (Audio / Visual) */}
              <text
                x={xForGroup(0)}
                y={HEIGHT - PADDING.bottom + 52}
                textAnchor="middle"
                className="fill-neutral-700 text-[12px] font-medium"
              >
                Audio
              </text>
              <text
                x={xForGroup(1)}
                y={HEIGHT - PADDING.bottom + 52}
                textAnchor="middle"
                className="fill-neutral-700 text-[12px] font-medium"
              >
                Visual
              </text>

              {DISPLAY_ORDER.map((mode) => {
                const entry = data.find((m) => m.mode === mode);
                if (!entry) return null;
                return (
                  <ModeColumn
                    key={mode}
                    entry={entry}
                    chartMax={chartMax}
                    boxHalf={boxHalf}
                    stripHalf={stripHalf}
                  />
                );
              })}
            </svg>
          ) : (
            <EmptyState />
          )}
        </div>

        <aside className="w-full shrink-0 lg:w-72">
          <StatsTable data={data} anova={anova} />
        </aside>
      </div>
    </section>
  );
}

function ModeColumn({
  entry,
  chartMax,
  boxHalf,
  stripHalf,
}: {
  entry: RecallTimeModeData;
  chartMax: number;
  boxHalf: number;
  stripHalf: number;
}) {
  const { mode, rtSec, q1, q3, median, mean, min, max } = entry;
  const color = GROUP_COLORS[mode];
  const xCenter = xForMode(mode);

  if (rtSec.length === 0) {
    return (
      <text
        x={xCenter}
        y={PADDING.top + (HEIGHT - PADDING.top - PADDING.bottom) / 2}
        textAnchor="middle"
        className="fill-neutral-300 text-[11px]"
      >
        no data
      </text>
    );
  }

  const stripDots = rtSec.map((value, index) => (
    <circle
      key={index}
      cx={xCenter + jitterOffset(mode, index, stripHalf)}
      cy={yForValue(value, chartMax)}
      r="2.5"
      fill={color}
      fillOpacity="0.35"
    />
  ));

  if (q1 === null || q3 === null || median === null) return <g>{stripDots}</g>;

  const iqr = q3 - q1;
  const upperFence = q3 + 1.5 * iqr;
  const lowerFence = Math.max(0, q1 - 1.5 * iqr);
  const withinFences = rtSec.filter((v) => v >= lowerFence && v <= upperFence);
  const whiskerTop = withinFences.length > 0 ? Math.max(...withinFences) : (max ?? q3);
  const whiskerBottom = withinFences.length > 0 ? Math.min(...withinFences) : (min ?? q1);

  const yQ1 = yForValue(q1, chartMax);
  const yQ3 = yForValue(q3, chartMax);
  const yMedian = yForValue(median, chartMax);
  const yWhiskerTop = yForValue(whiskerTop, chartMax);
  const yWhiskerBottom = yForValue(whiskerBottom, chartMax);

  return (
    <g>
      {stripDots}

      <line
        x1={xCenter}
        x2={xCenter}
        y1={yWhiskerTop}
        y2={yWhiskerBottom}
        stroke={color}
        strokeOpacity="0.55"
        strokeWidth="1.25"
      />
      <line
        x1={xCenter - boxHalf * 0.55}
        x2={xCenter + boxHalf * 0.55}
        y1={yWhiskerTop}
        y2={yWhiskerTop}
        stroke={color}
        strokeOpacity="0.55"
        strokeWidth="1.25"
      />
      <line
        x1={xCenter - boxHalf * 0.55}
        x2={xCenter + boxHalf * 0.55}
        y1={yWhiskerBottom}
        y2={yWhiskerBottom}
        stroke={color}
        strokeOpacity="0.55"
        strokeWidth="1.25"
      />

      <rect
        x={xCenter - boxHalf}
        y={yQ3}
        width={boxHalf * 2}
        height={Math.max(1, yQ1 - yQ3)}
        fill={color}
        fillOpacity="0.14"
        stroke={color}
        strokeWidth="1.5"
      />
      <line
        x1={xCenter - boxHalf}
        x2={xCenter + boxHalf}
        y1={yMedian}
        y2={yMedian}
        stroke={color}
        strokeWidth="2.25"
      />

      {mean !== null ? (
        <g>
          <circle
            cx={xCenter}
            cy={yForValue(mean, chartMax)}
            r="4.5"
            fill="#ffffff"
            stroke={color}
            strokeWidth="1.75"
          />
          <line
            x1={xCenter - 3}
            x2={xCenter + 3}
            y1={yForValue(mean, chartMax)}
            y2={yForValue(mean, chartMax)}
            stroke={color}
            strokeWidth="1.5"
          />
          <line
            x1={xCenter}
            x2={xCenter}
            y1={yForValue(mean, chartMax) - 3}
            y2={yForValue(mean, chartMax) + 3}
            stroke={color}
            strokeWidth="1.5"
          />
        </g>
      ) : null}
    </g>
  );
}

function EmptyState() {
  return (
    <div className="flex h-[300px] items-center justify-center border border-dashed border-neutral-200 text-sm text-neutral-400">
      No quiz response times yet.
    </div>
  );
}

function StatsTable({
  data,
  anova,
}: {
  data: RecallTimeModeData[];
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
            <th className="py-1 text-right font-medium">Mean</th>
            <th className="py-1 text-right font-medium">SD</th>
            <th className="py-1 text-right font-medium">Median</th>
            <th className="py-1 text-right font-medium">n</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.mode} className="border-t border-neutral-100">
              <td className="py-2">
                <span className="flex items-center gap-2">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-sm"
                    style={{ backgroundColor: GROUP_COLORS[row.mode] }}
                    aria-hidden
                  />
                  <span>{MODE_SHORT_LABELS[row.mode]}</span>
                </span>
              </td>
              <td className="py-2 text-right tabular-nums">{formatSec(row.mean)}</td>
              <td className="py-2 text-right tabular-nums">{formatSec(row.sd)}</td>
              <td className="py-2 text-right tabular-nums">{formatSec(row.median)}</td>
              <td className="py-2 text-right tabular-nums">{row.n || '--'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <AnovaBlock anova={anova} />
      <p className="text-[11px] leading-snug text-neutral-400">
        n = quiz trials (correct + incorrect). Cross marker in chart is the mean.
      </p>
      <div className="flex flex-col gap-1 text-[11px] text-neutral-500">
        <p className="uppercase tracking-widest text-[10px] text-neutral-400">
          Mode key
        </p>
        {DISPLAY_ORDER.map((mode) => (
          <div key={mode} className="flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: GROUP_COLORS[mode] }}
              aria-hidden
            />
            <span>
              {MODE_SHORT_LABELS[mode]} &mdash; {MODE_LABELS[mode]}
            </span>
          </div>
        ))}
      </div>
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
            <th className="py-1 text-right font-medium">ηp²</th>
          </tr>
        </thead>
        <tbody>
          {effects.map((e) => (
            <tr key={e.name} className="border-t border-neutral-100">
              <td className="py-2">{e.name}</td>
              <td className="py-2 text-right tabular-nums">{formatF(e.F)}</td>
              <td className="py-2 text-right tabular-nums">{formatP(e.p)}</td>
              <td className="py-2 text-right tabular-nums">
                {formatEta(e.partialEtaSq)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[11px] text-neutral-400">df = (1, {N - 2})</p>
    </div>
  );
}
