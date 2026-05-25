'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  runQaTruthReview,
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
      {pending ? 'Reviewing…' : 'Run QA + Truth Review'}
    </button>
  );
}

export function RunQaTruthReviewButton({
  slug,
  ticketId,
}: {
  slug: string;
  ticketId: string;
}) {
  const [state, formAction] = useActionState(runQaTruthReview, INITIAL);
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="ticketId" value={ticketId} />
      <Submit />
      <span className="text-[11px] text-neutral-500">
        Internal deterministic review of recorded evidence. Writes QA and Truth
        Agent workflow runs, trace events, and packets. No model call, no
        external attestation.
      </span>
      {state.error ? (
        <span className="text-[11px] text-red-400">{state.error}</span>
      ) : null}
    </form>
  );
}
