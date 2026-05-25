'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  injectControlledLoop,
  type OrchestratorRunState,
} from '@/app/actions/orchestration';

const INITIAL: OrchestratorRunState = { error: null };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded border border-violet-700/60 bg-violet-900/30 px-3 py-1.5 text-xs font-medium text-violet-100 hover:bg-violet-900/50 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? 'Writing loop…' : 'Inject controlled loop'}
    </button>
  );
}

export function InjectControlledLoopButton({
  slug,
  ticketId,
}: {
  slug: string;
  ticketId: string;
}) {
  const [state, formAction] = useActionState(injectControlledLoop, INITIAL);
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="ticketId" value={ticketId} />
      <Submit />
      <span className="text-[11px] text-neutral-500">
        Demo/test action. No recovery action is wired yet. Writes two loop iteration trace events,
        a termination event, and a timeout failure packet, then marks the ticket looped.
      </span>
      {state.error ? (
        <span className="text-[11px] text-red-400">{state.error}</span>
      ) : null}
    </form>
  );
}
