import {
  ALL_MODES,
  MODE_COLORS,
  MODE_LABELS,
  MODE_SHORT_LABELS,
  type LearningBlockCell,
  type LearningData,
} from '../../lib/resultsAnalyzer';

const WIDTH = 760;
const HEIGHT = 360;
const PADDING = { top: 24, right: 28, bottom: 56, left: 60 };

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

function xForBlock(blockIndex: number, minBlock: number, maxBlock: number): number {
  const chartWidth = WIDTH - PADDING.left - PADDING.right;
  if (maxBlock === minBlock) return PADDING.left + chartWidth / 2;
  return PADDING.left + ((blockIndex - minBlock) / (maxBlock - minBlock)) * chartWidth;
}

function yForValue(value: number, maxValue: number): number {
  const chartHeight = HEIGHT - PADDING.top - PADDING.bottom;
  const clamped = Math.max(0, Math.min(maxValue, value));
  return PADDING.top + (1 - clamped / maxValue) * chartHeight;
}

function formatExposures(value: number | null, digits = 1): string {
  if (value === null || Number.isNaN(value)) return '--';
  return value.toFixed(digits);
}

function formatSigned(value: number | null, digits = 1): string {
  if (value === null || Number.isNaN(value)) return '--';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(digits)}`;
}

function formatSlope(value: number | null): string {
  if (value === null || Number.isNaN(value)) return '--';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}/blk`;
}

export function LearningRateChart({ data }: { data: LearningData }) {
  const hasData = data.cells.length > 0;

  const minBlock = hasData ? data.blockIndices[0] : 1;
  const maxBlock = hasData ? data.blockIndices[data.blockIndices.length - 1] : 1;

  // Auto-scale y-axis to the highest (mean + SEM) observed. Padding for breathing room.
  const observedMax = hasData
    ? Math.max(...data.cells.map((c) => c.meanExposures + c.sem))
    : 1;
  const chartMax = niceMax(Math.max(observedMax * 1.1, 1));
  const tickValues = [0, chartMax / 4, chartMax / 2, (chartMax * 3) / 4, chartMax];

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
          Within each block, how many flashcard exposures a face takes before the
          participant first buckets it as &quot;know-it&quot;. Shown per mode across
          blocks &mdash; <span className="font-medium">lower is faster learning</span>.
          Shaded band is +/-1 SEM across participants. Faces never rated
          &quot;know-it&quot; in a block contribute no sample.
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
              aria-label="Mean exposures until know-it per block, one line per mode"
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
                      {tick.toFixed(chartMax < 5 ? 1 : 0)}
                    </text>
                  </g>
                );
              })}

              {/* x labels */}
              {data.blockIndices.map((blockIndex) => {
                const x = xForBlock(blockIndex, minBlock, maxBlock);
                return (
                  <g key={blockIndex}>
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
                      Block {blockIndex}
                    </text>
                  </g>
                );
              })}

              {/* axis labels */}
              <text
                x={PADDING.left - 44}
                y={PADDING.top + (HEIGHT - PADDING.top - PADDING.bottom) / 2}
                textAnchor="middle"
                transform={`rotate(-90, ${PADDING.left - 44}, ${
                  PADDING.top + (HEIGHT - PADDING.top - PADDING.bottom) / 2
                })`}
                className="fill-neutral-500 text-[11px]"
              >
                Mean exposures to know-it
              </text>
              <text
                x={PADDING.left + (WIDTH - PADDING.left - PADDING.right) / 2}
                y={HEIGHT - 8}
                textAnchor="middle"
                className="fill-neutral-500 text-[11px]"
              >
                Flashcard block
              </text>

              {/* per-mode series */}
              {ALL_MODES.map((mode) => (
                <ModeSeries
                  key={mode}
                  mode={mode}
                  cells={data.cells.filter((c) => c.mode === mode)}
                  minBlock={minBlock}
                  maxBlock={maxBlock}
                  chartMax={chartMax}
                />
              ))}
            </svg>
          ) : (
            <EmptyState />
          )}

          <Legend />
        </div>

        <aside className="w-full shrink-0 lg:w-72">
          <StatsTable summary={data.summary} />
        </aside>
      </div>
    </section>
  );
}

function ModeSeries({
  mode,
  cells,
  minBlock,
  maxBlock,
  chartMax,
}: {
  mode: Mode;
  cells: LearningBlockCell[];
  minBlock: number;
  maxBlock: number;
  chartMax: number;
}) {
  if (cells.length === 0) return null;

  const sorted = cells.slice().sort((a, b) => a.blockIndex - b.blockIndex);
  const color = MODE_COLORS[mode];

  const upper = sorted
    .map((cell) => {
      const x = xForBlock(cell.blockIndex, minBlock, maxBlock);
      const y = yForValue(cell.meanExposures + cell.sem, chartMax);
      return `${x},${y}`;
    })
    .join(' ');
  const lower = sorted
    .slice()
    .reverse()
    .map((cell) => {
      const x = xForBlock(cell.blockIndex, minBlock, maxBlock);
      const y = yForValue(Math.max(0, cell.meanExposures - cell.sem), chartMax);
      return `${x},${y}`;
    })
    .join(' ');
  const bandPath = sorted.length > 1 ? `M ${upper} L ${lower} Z` : '';

  const linePath = sorted
    .map((cell, index) => {
      const x = xForBlock(cell.blockIndex, minBlock, maxBlock);
      const y = yForValue(cell.meanExposures, chartMax);
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');

  return (
    <g>
      {bandPath ? <path d={bandPath} fill={color} fillOpacity="0.12" stroke="none" /> : null}
      <path d={linePath} fill="none" stroke={color} strokeWidth="2.25" strokeLinejoin="round" />
      {sorted.map((cell) => (
        <circle
          key={cell.blockIndex}
          cx={xForBlock(cell.blockIndex, minBlock, maxBlock)}
          cy={yForValue(cell.meanExposures, chartMax)}
          r="4"
          fill={color}
          stroke="#ffffff"
          strokeWidth="1.25"
        >
          <title>
            {`${MODE_LABELS[mode]} - Block ${cell.blockIndex} - ${formatExposures(
              cell.meanExposures,
            )} exposures (+/-${formatExposures(cell.sem, 2)} SEM) - n=${cell.participantCount}, samples=${cell.sampleCount}`}
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
      No know-it buckets recorded yet.
    </div>
  );
}

function StatsTable({ summary }: { summary: LearningData['summary'] }) {
  return (
    <div className="flex flex-col gap-3">
      <h4 className="text-xs uppercase tracking-widest text-neutral-400">
        Per-mode summary
      </h4>
      <table className="w-full text-[12px] text-neutral-700">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-widest text-neutral-400">
            <th className="py-1 font-medium">Mode</th>
            <th className="py-1 text-right font-medium">First</th>
            <th className="py-1 text-right font-medium">Last</th>
            <th className="py-1 text-right font-medium">&Delta;</th>
            <th className="py-1 text-right font-medium">Slope</th>
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
                {formatExposures(row.firstBlockMean)}
              </td>
              <td className="py-2 text-right tabular-nums">
                {formatExposures(row.lastBlockMean)}
              </td>
              <td className="py-2 text-right tabular-nums">
                {formatSigned(row.delta)}
              </td>
              <td className="py-2 text-right tabular-nums">
                {formatSlope(row.slopePerBlock)}
              </td>
              <td className="py-2 text-right tabular-nums">
                {row.participantCount || '--'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[11px] leading-snug text-neutral-400">
        Values are mean exposures before first &quot;know-it&quot;. Negative &Delta;
        and slope = learning sped up across blocks. n = participants contributing to
        this mode.
      </p>
    </div>
  );
}
