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
const PADDING = { top: 24, right: 28, bottom: 56, left: 56 };
const Y_TICKS = [0, 0.25, 0.5, 0.75, 1];

function xForBlock(blockIndex: number, minBlock: number, maxBlock: number): number {
  const chartWidth = WIDTH - PADDING.left - PADDING.right;
  if (maxBlock === minBlock) return PADDING.left + chartWidth / 2;
  return PADDING.left + ((blockIndex - minBlock) / (maxBlock - minBlock)) * chartWidth;
}

function yForRate(rate: number): number {
  const chartHeight = HEIGHT - PADDING.top - PADDING.bottom;
  return PADDING.top + (1 - Math.max(0, Math.min(1, rate))) * chartHeight;
}

function formatPercent(value: number | null, digits = 0): string {
  if (value === null || Number.isNaN(value)) return '--';
  return `${(value * 100).toFixed(digits)}%`;
}

function formatSignedPercent(value: number | null): string {
  if (value === null || Number.isNaN(value)) return '--';
  const pct = value * 100;
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}

function formatSlope(value: number | null): string {
  if (value === null || Number.isNaN(value)) return '--';
  const pct = value * 100;
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%/block`;
}

export function LearningRateChart({ data }: { data: LearningData }) {
  const hasData = data.cells.length > 0;

  const minBlock = hasData ? data.blockIndices[0] : 1;
  const maxBlock = hasData ? data.blockIndices[data.blockIndices.length - 1] : 1;

  return (
    <section className="flex flex-col gap-3 bg-white px-6 py-6">
      <header className="flex flex-col gap-1">
        <span className="text-xs uppercase tracking-widest text-neutral-400">
          Dependent variable 1
        </span>
        <h3 className="font-display text-2xl leading-none text-neutral-900">
          Learning rate by block
        </h3>
        <p className="max-w-3xl text-sm text-neutral-500">
          Mean know-it rate across participants, per flashcard block. One line per mode,
          shaded band is +/-1 SEM across participants. Higher and steeper is better.
        </p>
      </header>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="flex-1 overflow-x-auto">
          {hasData ? (
            <svg
              viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
              className="h-[360px] min-w-[680px] w-full"
              role="img"
              aria-label="Learning rate by flashcard block, one line per mode"
            >
              {/* y grid + labels */}
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
                x={PADDING.left - 40}
                y={PADDING.top + (HEIGHT - PADDING.top - PADDING.bottom) / 2}
                textAnchor="middle"
                transform={`rotate(-90, ${PADDING.left - 40}, ${
                  PADDING.top + (HEIGHT - PADDING.top - PADDING.bottom) / 2
                })`}
                className="fill-neutral-500 text-[11px]"
              >
                Know-it rate
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
}: {
  mode: Mode;
  cells: LearningBlockCell[];
  minBlock: number;
  maxBlock: number;
}) {
  if (cells.length === 0) return null;

  const sorted = cells.slice().sort((a, b) => a.blockIndex - b.blockIndex);
  const color = MODE_COLORS[mode];

  // Shaded SEM band as a closed path (upper edge forward, lower edge backward).
  const upper = sorted
    .map((cell) => {
      const x = xForBlock(cell.blockIndex, minBlock, maxBlock);
      const y = yForRate(cell.meanKnowItRate + cell.sem);
      return `${x},${y}`;
    })
    .join(' ');
  const lower = sorted
    .slice()
    .reverse()
    .map((cell) => {
      const x = xForBlock(cell.blockIndex, minBlock, maxBlock);
      const y = yForRate(cell.meanKnowItRate - cell.sem);
      return `${x},${y}`;
    })
    .join(' ');
  const bandPath = sorted.length > 1 ? `M ${upper} L ${lower} Z` : '';

  const linePath = sorted
    .map((cell, index) => {
      const x = xForBlock(cell.blockIndex, minBlock, maxBlock);
      const y = yForRate(cell.meanKnowItRate);
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
          cy={yForRate(cell.meanKnowItRate)}
          r="4"
          fill={color}
          stroke="#ffffff"
          strokeWidth="1.25"
        >
          <title>
            {`${MODE_LABELS[mode]} - Block ${cell.blockIndex} - ${formatPercent(
              cell.meanKnowItRate,
              1,
            )} (+/-${formatPercent(cell.sem, 1)}) - n=${cell.participantCount}`}
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
    <div className="flex h-[300px] items-center justify-center border border-dashed border-neutral-200 text-sm text-neutral-400">
      No flashcard bucket data yet.
    </div>
  );
}

function StatsTable({
  summary,
}: {
  summary: LearningData['summary'];
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
                {formatPercent(row.firstBlockRate)}
              </td>
              <td className="py-2 text-right tabular-nums">
                {formatPercent(row.lastBlockRate)}
              </td>
              <td className="py-2 text-right tabular-nums">
                {formatSignedPercent(row.delta)}
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
        n = participants with any data in this mode. Slope is the linear-regression
        slope of mean know-it rate versus block index.
      </p>
    </div>
  );
}
