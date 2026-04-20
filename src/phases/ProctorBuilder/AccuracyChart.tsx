import {
  ALL_MODES,
  MODE_COLORS,
  MODE_LABELS,
  MODE_SHORT_LABELS,
  type AccuracyModeData,
} from '../../lib/resultsAnalyzer';

const WIDTH = 760;
const HEIGHT = 360;
const PADDING = { top: 34, right: 28, bottom: 60, left: 56 };
const Y_TICKS = [0, 0.25, 0.5, 0.75, 1];

const OUTCOME_COLORS = {
  incorrect: '#71717a', // zinc-500
  idk: '#a1a1aa', // zinc-400
  timeout: '#d4d4d8', // zinc-300
} as const;

function yForProportion(p: number): number {
  const chartHeight = HEIGHT - PADDING.top - PADDING.bottom;
  const clamped = Math.max(0, Math.min(1, p));
  return PADDING.top + (1 - clamped) * chartHeight;
}

function xForMode(mode: Mode): number {
  const chartWidth = WIDTH - PADDING.left - PADDING.right;
  const step = chartWidth / ALL_MODES.length;
  const index = ALL_MODES.indexOf(mode);
  return PADDING.left + step * (index + 0.5);
}

function formatPercent(value: number | null, digits = 0): string {
  if (value === null || Number.isNaN(value)) return '--';
  return `${(value * 100).toFixed(digits)}%`;
}

export function AccuracyChart({ data }: { data: AccuracyModeData[] }) {
  const hasData = data.some((m) => m.total > 0);

  const chartWidth = WIDTH - PADDING.left - PADDING.right;
  const columnWidth = chartWidth / ALL_MODES.length;
  const barHalf = Math.min(38, columnWidth * 0.3);

  return (
    <section className="flex flex-col gap-3 bg-white px-6 py-6">
      <header className="flex flex-col gap-1">
        <span className="text-xs uppercase tracking-widest text-neutral-400">
          Dependent variable 3
        </span>
        <h3 className="font-display text-2xl leading-none text-neutral-900">
          Testing accuracy by mode
        </h3>
        <p className="max-w-3xl text-sm text-neutral-500">
          End-of-study quiz outcome breakdown per mode. Colored segment is the fraction
          correct; the bracket is the Wilson 95% CI on accuracy. Grayscale segments
          show incorrect, IDK, and timeout.
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
              aria-label="Stacked bar chart of quiz outcomes per mode"
            >
              {/* y grid + labels */}
              {Y_TICKS.map((tick) => {
                const y = yForProportion(tick);
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

              {/* axis labels */}
              <text
                x={PADDING.left - 42}
                y={PADDING.top + (HEIGHT - PADDING.top - PADDING.bottom) / 2}
                textAnchor="middle"
                transform={`rotate(-90, ${PADDING.left - 42}, ${
                  PADDING.top + (HEIGHT - PADDING.top - PADDING.bottom) / 2
                })`}
                className="fill-neutral-500 text-[11px]"
              >
                Proportion of trials
              </text>

              {/* x labels */}
              {ALL_MODES.map((mode) => {
                const x = xForMode(mode);
                const entry = data.find((m) => m.mode === mode);
                return (
                  <g key={mode}>
                    <text
                      x={x}
                      y={HEIGHT - PADDING.bottom + 18}
                      textAnchor="middle"
                      className="fill-neutral-600 text-[11px]"
                    >
                      Mode {mode}
                    </text>
                    <text
                      x={x}
                      y={HEIGHT - PADDING.bottom + 32}
                      textAnchor="middle"
                      className="fill-neutral-400 text-[10px]"
                    >
                      {MODE_SHORT_LABELS[mode]} &middot; n={entry?.total ?? 0}
                    </text>
                  </g>
                );
              })}

              {ALL_MODES.map((mode) => {
                const entry = data.find((m) => m.mode === mode);
                if (!entry) return null;
                return (
                  <ModeBar
                    key={mode}
                    entry={entry}
                    barHalf={barHalf}
                  />
                );
              })}
            </svg>
          ) : (
            <EmptyState />
          )}

          <Legend />
        </div>

        <aside className="w-full shrink-0 lg:w-72">
          <StatsTable data={data} />
        </aside>
      </div>
    </section>
  );
}

function ModeBar({
  entry,
  barHalf,
}: {
  entry: AccuracyModeData;
  barHalf: number;
}) {
  const { mode, total, correct, incorrect, idk, timeout, accuracy, ci95Lower, ci95Upper } = entry;
  const xCenter = xForMode(mode);

  if (total === 0) {
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

  const pCorrect = correct / total;
  const pIncorrect = incorrect / total;
  const pIdk = idk / total;
  const pTimeout = timeout / total;

  const baseY = yForProportion(0);
  const correctTop = yForProportion(pCorrect);
  const incorrectTop = yForProportion(pCorrect + pIncorrect);
  const idkTop = yForProportion(pCorrect + pIncorrect + pIdk);
  const timeoutTop = yForProportion(pCorrect + pIncorrect + pIdk + pTimeout);

  const color = MODE_COLORS[mode];

  return (
    <g>
      {/* Correct (mode color) */}
      {pCorrect > 0 ? (
        <rect
          x={xCenter - barHalf}
          y={correctTop}
          width={barHalf * 2}
          height={Math.max(0.5, baseY - correctTop)}
          fill={color}
          fillOpacity="0.9"
        >
          <title>
            {`${MODE_LABELS[mode]} - correct ${correct}/${total} (${formatPercent(pCorrect, 1)})`}
          </title>
        </rect>
      ) : null}

      {/* Incorrect */}
      {pIncorrect > 0 ? (
        <rect
          x={xCenter - barHalf}
          y={incorrectTop}
          width={barHalf * 2}
          height={Math.max(0.5, correctTop - incorrectTop)}
          fill={OUTCOME_COLORS.incorrect}
        >
          <title>
            {`${MODE_LABELS[mode]} - incorrect ${incorrect}/${total} (${formatPercent(pIncorrect, 1)})`}
          </title>
        </rect>
      ) : null}

      {/* IDK */}
      {pIdk > 0 ? (
        <rect
          x={xCenter - barHalf}
          y={idkTop}
          width={barHalf * 2}
          height={Math.max(0.5, incorrectTop - idkTop)}
          fill={OUTCOME_COLORS.idk}
        >
          <title>
            {`${MODE_LABELS[mode]} - IDK ${idk}/${total} (${formatPercent(pIdk, 1)})`}
          </title>
        </rect>
      ) : null}

      {/* Timeout */}
      {pTimeout > 0 ? (
        <rect
          x={xCenter - barHalf}
          y={timeoutTop}
          width={barHalf * 2}
          height={Math.max(0.5, idkTop - timeoutTop)}
          fill={OUTCOME_COLORS.timeout}
        >
          <title>
            {`${MODE_LABELS[mode]} - timeout ${timeout}/${total} (${formatPercent(pTimeout, 1)})`}
          </title>
        </rect>
      ) : null}

      {/* Outline around the whole bar for crispness */}
      <rect
        x={xCenter - barHalf}
        y={timeoutTop}
        width={barHalf * 2}
        height={Math.max(0.5, baseY - timeoutTop)}
        fill="none"
        stroke="#e5e5e5"
        strokeWidth="1"
      />

      {/* 95% CI bracket for accuracy */}
      {ci95Lower !== null && ci95Upper !== null && total >= 5 ? (
        <g>
          <line
            x1={xCenter}
            x2={xCenter}
            y1={yForProportion(ci95Upper)}
            y2={yForProportion(ci95Lower)}
            stroke="#111111"
            strokeWidth="1.25"
          />
          <line
            x1={xCenter - barHalf * 0.45}
            x2={xCenter + barHalf * 0.45}
            y1={yForProportion(ci95Upper)}
            y2={yForProportion(ci95Upper)}
            stroke="#111111"
            strokeWidth="1.25"
          />
          <line
            x1={xCenter - barHalf * 0.45}
            x2={xCenter + barHalf * 0.45}
            y1={yForProportion(ci95Lower)}
            y2={yForProportion(ci95Lower)}
            stroke="#111111"
            strokeWidth="1.25"
          />
        </g>
      ) : null}

      {/* Accuracy label above the bar */}
      <text
        x={xCenter}
        y={PADDING.top - 10}
        textAnchor="middle"
        className="fill-neutral-900 text-[13px] font-semibold"
      >
        {formatPercent(accuracy, 0)}
      </text>
    </g>
  );
}

function EmptyState() {
  return (
    <div className="flex h-[300px] items-center justify-center border border-dashed border-neutral-200 text-sm text-neutral-400">
      No quiz attempts yet.
    </div>
  );
}

function Legend() {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-neutral-500">
      <LegendChip label="Correct (by mode)" swatch="mode" />
      <LegendChip label="Incorrect" color={OUTCOME_COLORS.incorrect} />
      <LegendChip label="IDK" color={OUTCOME_COLORS.idk} />
      <LegendChip label="Timeout" color={OUTCOME_COLORS.timeout} />
      <span className="flex items-center gap-2">
        <span
          className="inline-block h-3 w-px border-l border-r"
          style={{ borderColor: '#111111' }}
          aria-hidden
        />
        <span>95% CI (Wilson)</span>
      </span>
    </div>
  );
}

function LegendChip({
  label,
  color,
  swatch,
}: {
  label: string;
  color?: string;
  swatch?: 'mode';
}) {
  if (swatch === 'mode') {
    return (
      <span className="flex items-center gap-2">
        <span className="inline-flex h-2.5 overflow-hidden rounded-sm" aria-hidden>
          {ALL_MODES.map((mode) => (
            <span
              key={mode}
              className="block h-2.5 w-2"
              style={{ backgroundColor: MODE_COLORS[mode] }}
            />
          ))}
        </span>
        <span>{label}</span>
      </span>
    );
  }
  return (
    <span className="flex items-center gap-2">
      <span
        className="inline-block h-2.5 w-4 rounded-sm"
        style={{ backgroundColor: color }}
        aria-hidden
      />
      <span>{label}</span>
    </span>
  );
}

function StatsTable({ data }: { data: AccuracyModeData[] }) {
  return (
    <div className="flex flex-col gap-3">
      <h4 className="text-xs uppercase tracking-widest text-neutral-400">
        Per-mode summary
      </h4>
      <table className="w-full text-[12px] text-neutral-700">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-widest text-neutral-400">
            <th className="py-1 font-medium">Mode</th>
            <th className="py-1 text-right font-medium">Acc.</th>
            <th className="py-1 text-right font-medium">95% CI</th>
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
                    style={{ backgroundColor: MODE_COLORS[row.mode] }}
                    aria-hidden
                  />
                  <span>{MODE_SHORT_LABELS[row.mode]}</span>
                </span>
              </td>
              <td className="py-2 text-right tabular-nums">
                {formatPercent(row.accuracy, 1)}
              </td>
              <td className="py-2 text-right tabular-nums text-neutral-500">
                {row.ci95Lower !== null && row.ci95Upper !== null
                  ? `${formatPercent(row.ci95Lower, 0)}–${formatPercent(row.ci95Upper, 0)}`
                  : '--'}
              </td>
              <td className="py-2 text-right tabular-nums">{row.total || '--'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex flex-col gap-1 text-[11px] text-neutral-500">
        <p className="uppercase tracking-widest text-[10px] text-neutral-400">
          Breakdown (trials)
        </p>
        {data.map((row) => (
          <div key={row.mode} className="flex items-center justify-between gap-2">
            <span>{MODE_SHORT_LABELS[row.mode]}</span>
            <span className="tabular-nums text-neutral-400">
              {row.correct}C &middot; {row.incorrect}I &middot; {row.idk} IDK &middot;{' '}
              {row.timeout}T
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
