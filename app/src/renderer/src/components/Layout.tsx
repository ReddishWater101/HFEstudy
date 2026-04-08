import type { ReactNode } from 'react';

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-white text-neutral-900">
      <div className="w-full max-w-[480px] px-12">{children}</div>
    </div>
  );
}
