// Small presentational primitives shared across screens (mirrors the web app's
// StatusPill semantics).
import type { ReactNode } from 'react';
import type { TicketStatus } from '../lib/db.ts';

const STATUS_STYLES: Record<string, string> = {
  open: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-fuchsia-100 text-fuchsia-800',
  needs_input: 'bg-sky-100 text-sky-800',
  done: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  looped: 'bg-violet-100 text-violet-800',
};

export function StatusPill({ status }: { status: TicketStatus | string }): JSX.Element {
  const cls = STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-700';
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${cls}`}>
      {String(status).replace('_', ' ')}
    </span>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }): JSX.Element {
  return <div className={`rounded-lg border border-gray-200 bg-white p-4 shadow-sm ${className}`}>{children}</div>;
}

export function Spinner({ label = 'loading…' }: { label?: string }): JSX.Element {
  return <p className="text-sm text-gray-500">{label}</p>;
}

export function ErrorNote({ children }: { children: ReactNode }): JSX.Element {
  return <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{children}</p>;
}

export function relTime(iso: string): string {
  const d = Date.now() - new Date(iso).getTime();
  const s = Math.round(d / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString();
}
