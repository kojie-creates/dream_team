import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen flex items-center justify-center bg-neutral-950 text-neutral-100 p-6">
      <div className="w-full max-w-sm rounded-lg border border-neutral-800 bg-neutral-900 p-6 shadow-lg">
        <div className="mb-6 text-center">
          <h1 className="text-lg font-semibold tracking-tight">Dream Team</h1>
          <p className="text-xs text-neutral-400">v1 dashboard — Phase 0</p>
        </div>
        {children}
      </div>
    </main>
  );
}
