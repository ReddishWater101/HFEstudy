import { useId } from 'react';
import type { AverageBlockTrendPoint, BlockTrendPoint } from '../../lib/resultsAnalyzer';

type Props = {
  points: BlockTrendPoint[];
  averagePoints: AverageBlockTrendPoint[];
};

const WIDTH = 760;
const HEIGHT = 340;
const PADDING = { top: 24, right: 28, bottom: 40, left: 46 };
const Y_TICKS = [0, 0.25, 0.5, 0.75, 1];

function xForBlock(blockIndex: number, maxBlock: number): number {
  const chartWidth = WIDTH - PADDING.left - PADDING.right;
  if (maxBlock <= 1) return PADDING.left + chartWidth / 2;
  return PADDING.left + ((blockIndex - 1) / (maxBlock - 1)) * chartWidth;
}

function yForRate(rate: number): number {
  const chartHeight = HEIGHT - PADDING.top - PADDING.bottom;
  return PADDING.top + (1 - rate) * chartHeight;
}

function jitter(index: number): number {
  const offsets = [-10, -6, -2, 2, 6, 10];
  return offsets[index % offsets.length];
}

export function ScatterTrendChart({ points, averagePoints }: Props) {
  const gradientId = useId();
  const maxBlock = Math.max(
    1,
    ...points.map((point) => point.blockIndex),
    ...averagePoints.map((point) => point.blockIndex),
  );

  const averagePath = averagePoints
    .map((point, index) => {
      const prefix = index === 0 ? 'M' : 'L';
      return `${prefix} ${xForBlock(point.blockIndex, maxBlock)} ${yForRate(point.knowItRate)}`;
    })
    .join(' ');

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="h-[320px] min-w-[640px] w-full"
          role="img"
          aria-label="Scatter chart of know-it rates by flashcard block with an average trend line"
        >
          <defs>
            <linearGradient id={gradientId} x1="0%" x2="100%" y1="0%" y2="0%">
              <stop offset="0%" stopColor="#111111" />
              <stop offset="100%" stopColor="#5f5f5f" />
            </linearGradient>
          </defs>

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
                  x={PADDING.left - 12}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-neutral-400 text-[11px]"
                >
                  {Math.round(tick * 100)}%
                </text>
              </g>
            );
          })}

          {Array.from({ length: maxBlock }, (_, index) => index + 1).map((blockIndex) => {
            const x = xForBlock(blockIndex, maxBlock);
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
                  y={HEIGHT - 12}
                  textAnchor="middle"
                  className="fill-neutral-400 text-[11px]"
                >
                  Block {blockIndex}
                </text>
              </g>
            );
          })}

          {points.map((point, index) => (
            <circle
              key={`${point.participantLabel}-${point.blockIndex}`}
              cx={xForBlock(point.blockIndex, maxBlock) + jitter(index)}
              cy={yForRate(point.knowItRate)}
              r="4.5"
              fill="#9ca3af"
              fillOpacity="0.5"
            >
              <title>
                {`${point.participantLabel} - Block ${point.blockIndex} - ${Math.round(
                  point.knowItRate * 100,
                )}% know-it`}
              </title>
            </circle>
          ))}

          {averagePoints.length > 0 ? (
            <>
              <path
                d={averagePath}
                fill="none"
                stroke={`url(#${gradientId})`}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="3"
              />
              {averagePoints.map((point) => (
                <circle
                  key={`avg-${point.blockIndex}`}
                  cx={xForBlock(point.blockIndex, maxBlock)}
                  cy={yForRate(point.knowItRate)}
                  r="5"
                  fill="#111111"
                >
                  <title>
                    {`Average - Block ${point.blockIndex} - ${Math.round(
                      point.knowItRate * 100,
                    )}% know-it`}
                  </title>
                </circle>
              ))}
            </>
          ) : null}
        </svg>
      </div>

      <div className="flex flex-wrap gap-x-8 gap-y-2 text-xs text-neutral-400">
        <span>Light points: participant know-it rate by block</span>
        <span>Dark line: average across participants with data in that block</span>
      </div>
    </div>
  );
}
