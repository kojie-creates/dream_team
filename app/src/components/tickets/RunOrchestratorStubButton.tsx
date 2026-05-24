'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  runOrchestratorStub,
  type OrchestratorStubState,
} from '@/app/actions/orchestration';

const INITIAL: OrchestratorStubState = { error: null };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-900 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? 'Running stub…' : 'Run Orchestrator stub'}
    </button>
  );
}

export function RunOrchestratorStubButton({
  slug,
  ticketId,
}: {
  slug: string;
  ticketId: string;
}) {
  const [state, formAction] = useActionState(runOrchestratorStub, INITIAL);
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="ticketId" value={ticketId} />
      <Submit />
      <span className="text-[11px] text-neutral-500">
        Deterministic stub — no model call. Writes one workflow_run, trace_event, and packet.
      </span>
      {state.error ? (
        <span className="text-[11px] text-red-400">{state.error}</span>
      ) : null}
    </form>
  );
}
