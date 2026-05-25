'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  holdLoopedTicket,
  reopenFailedTicket,
  type OrchestratorRunState,
} from '@/app/actions/orchestration';

const INITIAL: OrchestratorRunState = { error: null };

function ReopenSubmit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded border border-amber-700/60 bg-amber-900/30 px-3 py-1.5 text-xs font-medium text-amber-100 hover:bg-amber-900/50 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? 'Reopening…' : 'Reopen for orchestrator'}
    </button>
  );
}

function HoldSubmit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded border border-violet-700/60 bg-violet-900/30 px-3 py-1.5 text-xs font-medium text-violet-100 hover:bg-violet-900/50 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? 'Holding…' : 'Hold for human review'}
    </button>
  );
}

export function ReopenFailedTicketAction({
  slug,
  ticketId,
}: {
  slug: string;
  ticketId: string;
}) {
  const [state, formAction] = useActionState(reopenFailedTicket, INITIAL);
  return (
    <form
      action={formAction}
      className="space-y-2 rounded border border-amber-900/40 bg-amber-950/10 p-3"
    >
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="ticketId" value={ticketId} />
      <h3 className="text-[11px] font-medium uppercase tracking-wider text-amber-100">
        Reopen for orchestrator
      </h3>
      <ul className="text-[11px] text-neutral-400">
        <li>Status: failed → open</li>
        <li>Preserves: all failure packets, traces, failure_type</li>
        <li>Effect: writes a recovery trace + recovery packet, hands back to orchestrator</li>
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        <ReopenSubmit />
        {state.error ? (
          <span className="text-[11px] text-red-400">{state.error}</span>
        ) : null}
      </div>
    </form>
  );
}

export function HoldLoopedTicketAction({
  slug,
  ticketId,
}: {
  slug: string;
  ticketId: string;
}) {
  const [state, formAction] = useActionState(holdLoopedTicket, INITIAL);
  return (
    <form
      action={formAction}
      className="space-y-2 rounded border border-violet-900/40 bg-violet-950/10 p-3"
    >
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="ticketId" value={ticketId} />
      <h3 className="text-[11px] font-medium uppercase tracking-wider text-violet-100">
        Hold for human review
      </h3>
      <ul className="text-[11px] text-neutral-400">
        <li>Status: looped → needs_input (human-review)</li>
        <li>Preserves: loop_signature, failure packets, traces</li>
        <li>Effect: writes a recovery trace + recovery packet, no model retry</li>
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        <HoldSubmit />
        {state.error ? (
          <span className="text-[11px] text-red-400">{state.error}</span>
        ) : null}
      </div>
    </form>
  );
}
