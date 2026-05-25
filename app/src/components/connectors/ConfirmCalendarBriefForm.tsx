'use client';

import { useActionState } from 'react';
import {
  createBriefFromCalendarEvent,
  type CreateBriefFromEventState,
} from '@/app/actions/connectors';

const initial: CreateBriefFromEventState = { error: null };

export function ConfirmCalendarBriefForm({
  slug,
  eventId,
}: {
  slug: string;
  eventId: string;
}) {
  const [state, formAction, pending] = useActionState(createBriefFromCalendarEvent, initial);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="event_id" value={eventId} />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-900 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? 'Creating…' : 'Create brief and ticket'}
        </button>
        <span className="text-[11px] text-neutral-500">
          Opens a new ticket. The brief is the text above, verbatim.
        </span>
      </div>
      {state.error ? (
        <p role="alert" className="text-xs text-rose-300">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
