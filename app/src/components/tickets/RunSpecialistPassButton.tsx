'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  runCoordinatorSpecialistPass,
  type OrchestratorRunState,
} from '@/app/actions/orchestration';

const INITIAL: OrchestratorRunState = { error: null };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-900 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? 'Running specialist…' : 'Run Specialist Pass'}
    </button>
  );
}

export function RunSpecialistPassButton({
  slug,
  ticketId,
}: {
  slug: string;
  ticketId: string;
}) {
  const [state, formAction] = useActionState(runCoordinatorSpecialistPass, INITIAL);
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="ticketId" value={ticketId} />
      <Submit />
      <span className="text-[11px] text-neutral-500">
        Routes through Coordinator and Specialist. Writes a markdown artifact and marks the ticket done.
      </span>
      {state.error ? (
        <span className="text-[11px] text-red-400">{state.error}</span>
      ) : null}
    </form>
  );
}
