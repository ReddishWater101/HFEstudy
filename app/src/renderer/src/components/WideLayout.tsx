import type { ReactNode } from 'react';

/**
 * Full-window layout used by the proctor builder. Unlike the participant
 * `Layout` (480px column), this stretches edge-to-edge so the people grid
 * has room to breathe. Still flat — no borders, no chrome.
 */
export function WideLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-full w-full overflow-y-auto bg-white text-neutral-900">
      <div className="mx-auto w-full max-w-[1100px] px-12 py-12">{children}</div>
    </div>
  );
}
