'use client';

// Phase 2 T5 — polite client-side refresh ergonomics.
//
// Two behaviors:
//   1. Manual: a "Refresh status" button calls router.refresh().
//   2. Polling: while `polling` is true, ticks router.refresh() every 5s.
//      Tab-visibility aware: pauses when the tab is hidden.
//
// No streaming. No SSE. No Realtime. Polling stops once the parent decides
// the ticket is complete (passes `polling={false}`).

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

const POLL_INTERVAL_MS = 5000;

export function TicketAutoRefresh({
  polling,
  lastUpdatedIso,
}: {
  polling: boolean;
  lastUpdatedIso: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!polling) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer) return;
      timer = setInterval(() => {
        if (document.visibilityState !== 'visible') return;
        startTransition(() => router.refresh());
        setTick((n) => n + 1);
      }, POLL_INTERVAL_MS);
    };
    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };
    const onVis = () => {
      if (document.visibilityState === 'visible') start();
      else stop();
    };
    start();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [polling, router]);

  const fmt = lastUpdatedIso
    ? new Date(lastUpdatedIso).toLocaleTimeString()
    : null;

  return (
    <div className="flex flex-wrap items-center gap-3 text-[11px] text-neutral-500">
      <button
        type="button"
        onClick={() => startTransition(() => router.refresh())}
        disabled={pending}
        className="rounded border border-neutral-700 px-2 py-1 text-neutral-300 hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? 'Refreshing…' : 'Refresh status'}
      </button>
      {polling ? (
        <span>
          Auto-refreshing every {POLL_INTERVAL_MS / 1000}s while ticket is in progress.
        </span>
      ) : (
        <span>Auto-refresh off — full evidence chain recorded.</span>
      )}
      {fmt ? <span>Last evidence: {fmt}</span> : null}
      <span className="sr-only" aria-live="polite">
        Tick {tick}
      </span>
    </div>
  );
}
