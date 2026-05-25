'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  submitNeedsInputResponse,
  type OrchestratorRunState,
} from '@/app/actions/orchestration';

const INITIAL: OrchestratorRunState = { error: null };
const MAX_LEN = 4000;

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded border border-sky-700/60 bg-sky-900/30 px-3 py-1.5 text-xs font-medium text-sky-100 hover:bg-sky-900/50 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? 'Submitting response…' : 'Submit response'}
    </button>
  );
}

export function NeedsInputResponseForm({
  slug,
  ticketId,
}: {
  slug: string;
  ticketId: string;
}) {
  const [state, formAction] = useActionState(submitNeedsInputResponse, INITIAL);
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="ticketId" value={ticketId} />
      <label className="block space-y-1 text-[11px] text-neutral-400">
        <span>Your response</span>
        <textarea
          name="response"
          required
          maxLength={MAX_LEN}
          rows={4}
          className="w-full rounded border border-neutral-800 bg-neutral-950 p-2 font-mono text-xs text-neutral-200 focus:border-sky-700 focus:outline-none"
          placeholder="Single structured human answer."
        />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Submit />
        <span className="text-[11px] text-neutral-500">
          One answer. Recorded as append-only evidence. No retry action yet — Phase 4 T5 will wire
          continuation.
        </span>
      </div>
      {state.error ? (
        <p className="text-[11px] text-red-400">{state.error}</p>
      ) : null}
    </form>
  );
}
