'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  requestNeedsInput,
  type OrchestratorRunState,
} from '@/app/actions/orchestration';

const INITIAL: OrchestratorRunState = { error: null };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded border border-sky-700/60 bg-sky-900/30 px-3 py-1.5 text-xs font-medium text-sky-100 hover:bg-sky-900/50 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? 'Writing request…' : 'Ask for input'}
    </button>
  );
}

export function RequestNeedsInputButton({
  slug,
  ticketId,
}: {
  slug: string;
  ticketId: string;
}) {
  const [state, formAction] = useActionState(requestNeedsInput, INITIAL);
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="ticketId" value={ticketId} />
      <label className="block space-y-1 text-[11px] text-neutral-400">
        <span>Question (optional)</span>
        <input
          type="text"
          name="question"
          maxLength={1000}
          className="w-full rounded border border-neutral-800 bg-neutral-950 px-2 py-1 font-mono text-xs text-neutral-200 focus:border-sky-700 focus:outline-none"
          placeholder="What additional information is needed to continue this ticket?"
        />
      </label>
      <label className="block space-y-1 text-[11px] text-neutral-400">
        <span>Reason (optional)</span>
        <input
          type="text"
          name="reason"
          maxLength={1000}
          className="w-full rounded border border-neutral-800 bg-neutral-950 px-2 py-1 font-mono text-xs text-neutral-200 focus:border-sky-700 focus:outline-none"
          placeholder="Why the orchestrator paused for input."
        />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Submit />
        <span className="text-[11px] text-neutral-500">
          Demo/test action. Marks the ticket needs_input and records one structured question packet.
        </span>
      </div>
      {state.error ? (
        <p className="text-[11px] text-red-400">{state.error}</p>
      ) : null}
    </form>
  );
}
