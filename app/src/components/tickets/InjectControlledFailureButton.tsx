'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  injectControlledFailure,
  type OrchestratorRunState,
} from '@/app/actions/orchestration';

const INITIAL: OrchestratorRunState = { error: null };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded border border-amber-700/60 bg-amber-900/30 px-3 py-1.5 text-xs font-medium text-amber-100 hover:bg-amber-900/50 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? 'Writing failure…' : 'Inject controlled failure'}
    </button>
  );
}

export function InjectControlledFailureButton({
  slug,
  ticketId,
}: {
  slug: string;
  ticketId: string;
}) {
  const [state, formAction] = useActionState(injectControlledFailure, INITIAL);
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="ticketId" value={ticketId} />
      <Submit />
      <span className="text-[11px] text-neutral-500">
        Demo/test action. No recovery is wired yet. Writes one workflow_run, trace_event, and
        failure packet, then marks the ticket failed.
      </span>
      {state.error ? (
        <span className="text-[11px] text-red-400">{state.error}</span>
      ) : null}
    </form>
  );
}
