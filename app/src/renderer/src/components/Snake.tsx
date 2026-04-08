import { useEffect, useRef } from 'react';

const GRID = 20;
const CELL = 18;
const TICK_MS = 110;

type Dir = { x: number; y: number };
type Cell = { x: number; y: number };

type GameState = {
  snake: Cell[];
  dir: Dir;
  pendingDir: Dir | null;
  food: Cell;
  score: number;
  alive: boolean;
  lastTick: number;
};

function randomFood(snake: Cell[]): Cell {
  const maxAttempts = GRID * GRID;
  for (let i = 0; i < maxAttempts; i++) {
    const f = { x: Math.floor(Math.random() * GRID), y: Math.floor(Math.random() * GRID) };
    if (!snake.some((s) => s.x === f.x && s.y === f.y)) return f;
  }
  // Board is completely full — fall back to any cell (snake has already won)
  return { x: 0, y: 0 };
}

function freshState(): GameState {
  const snake: Cell[] = [
    { x: 10, y: 10 },
    { x: 9, y: 10 },
    { x: 8, y: 10 },
  ];
  return {
    snake,
    dir: { x: 1, y: 0 },
    pendingDir: null,
    food: randomFood(snake),
    score: 0,
    alive: true,
    lastTick: 0,
  };
}

export type SnakeProps = {
  onScore?: (score: number) => void;
  onGameOver?: (finalScore: number) => void;
};

export function Snake({ onScore, onGameOver }: SnakeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<GameState>(freshState());
  const onScoreRef = useRef(onScore);
  const onGameOverRef = useRef(onGameOver);
  onScoreRef.current = onScore;
  onGameOverRef.current = onGameOver;

  useEffect(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;
    const ctxEl = canvasEl.getContext('2d');
    if (!ctxEl) return;
    const canvas: HTMLCanvasElement = canvasEl;
    const ctx: CanvasRenderingContext2D = ctxEl;

    let rafId = 0;

    function step(ts: number) {
      const s = stateRef.current;
      if (!s.lastTick) s.lastTick = ts;

      if (s.alive && ts - s.lastTick >= TICK_MS) {
        s.lastTick = ts;

        if (s.pendingDir) {
          // prevent reversing into self
          if (s.pendingDir.x !== -s.dir.x || s.pendingDir.y !== -s.dir.y) {
            s.dir = s.pendingDir;
          }
          s.pendingDir = null;
        }

        const head = s.snake[0];
        const newHead: Cell = { x: head.x + s.dir.x, y: head.y + s.dir.y };

        // wall collision
        if (newHead.x < 0 || newHead.x >= GRID || newHead.y < 0 || newHead.y >= GRID) {
          s.alive = false;
        } else if (s.snake.some((seg) => seg.x === newHead.x && seg.y === newHead.y)) {
          s.alive = false;
        } else {
          s.snake.unshift(newHead);
          if (newHead.x === s.food.x && newHead.y === s.food.y) {
            s.score += 1;
            onScoreRef.current?.(s.score);
            s.food = randomFood(s.snake);
          } else {
            s.snake.pop();
          }
        }

        if (!s.alive) {
          onGameOverRef.current?.(s.score);
          stateRef.current = freshState();
        }
      }

      // draw
      const cur = stateRef.current;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.strokeStyle = '#e5e5e5';
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, canvas.width - 1, canvas.height - 1);

      ctx.fillStyle = '#171717';
      for (const seg of cur.snake) {
        ctx.fillRect(seg.x * CELL, seg.y * CELL, CELL - 1, CELL - 1);
      }

      ctx.fillStyle = '#a3a3a3';
      ctx.fillRect(cur.food.x * CELL, cur.food.y * CELL, CELL - 1, CELL - 1);

      rafId = requestAnimationFrame(step);
    }

    function handleKey(e: KeyboardEvent) {
      const s = stateRef.current;
      if (e.key === 'ArrowUp') s.pendingDir = { x: 0, y: -1 };
      else if (e.key === 'ArrowDown') s.pendingDir = { x: 0, y: 1 };
      else if (e.key === 'ArrowLeft') s.pendingDir = { x: -1, y: 0 };
      else if (e.key === 'ArrowRight') s.pendingDir = { x: 1, y: 0 };
    }

    window.addEventListener('keydown', handleKey);
    rafId = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('keydown', handleKey);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={GRID * CELL}
      height={GRID * CELL}
      className="bg-white"
    />
  );
}
