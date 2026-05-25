'use client';

import { useActionState, useState } from 'react';
import {
  createCalendarHoldForTicket,
  type CreateCalendarHoldState,
} from '@/app/actions/connectors';

const initial: CreateCalendarHoldState = { error: null, ok: null, eventLink: null };

function fmtPreview(date: string, startTime: string, durationMin: number, tz: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(startTime)) return '—';
  const start = new Date(`${date}T${startTime}:00`);
  if (Number.isNaN(start.getTime())) return '—';
  const end = new Date(start.getTime() + durationMin * 60_000);
  return `${start.toLocaleString()} → ${end.toLocaleTimeString()} (${tz})`;
}

export function CalendarHoldForm({
  slug,
  ticketId,
  ticketTitle,
  accountEmail,
  defaultDate,
  defaultStartTime,
  defaultDescription,
  defaultTimeZone,
}: {
  slug: string;
  ticketId: string;
  ticketTitle: string;
  accountEmail: string;
  defaultDate: string;
  defaultStartTime: string;
  defaultDescription: string;
  defaultTimeZone: string;
}) {
  const [state, formAction, pending] = useActionState(createCalendarHoldForTicket, initial);

  const [title, setTitle] = useState(ticketTitle.slice(0, 200) || 'Calendar hold');
  const [date, setDate] = useState(defaultDate);
  const [startTime, setStartTime] = useState(defaultStartTime);
  const [duration, setDuration] = useState(30);
  const [description, setDescription] = useState(defaultDescription);

  // Disable submission after a successful write to prevent a second hold.
  const alreadyCreated = state.ok !== null && state.error === null;

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="ticketId" value={ticketId} />
      <input type="hidden" name="time_zone" value={defaultTimeZone} />
      <input type="hidden" name="confirmed_account" value={accountEmail} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs text-neutral-300 sm:col-span-2">
          <span>Event title</span>
          <input
            name="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            required
            className="block w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm text-neutral-100"
          />
        </label>
        <label className="space-y-1 text-xs text-neutral-300">
          <span>Date</span>
          <input
            type="date"
            name="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            className="block w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm text-neutral-100"
          />
        </label>
        <label className="space-y-1 text-xs text-neutral-300">
          <span>Start time</span>
          <input
            type="time"
            name="start_time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            required
            className="block w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm text-neutral-100"
          />
        </label>
        <label className="space-y-1 text-xs text-neutral-300">
          <span>Duration (minutes)</span>
          <input
            type="number"
            name="duration_min"
            min={5}
            max={480}
            step={5}
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value) || 30)}
            required
            className="block w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm text-neutral-100"
          />
        </label>
        <label className="space-y-1 text-xs text-neutral-300 sm:col-span-2">
          <span>Description</span>
          <textarea
            name="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            maxLength={2000}
            className="block w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 font-mono text-xs text-neutral-100"
          />
        </label>
      </div>

      <div className="space-y-1 rounded border border-amber-900/40 bg-amber-950/10 p-3 text-xs text-amber-100">
        <p className="font-medium uppercase tracking-wider text-[11px] text-amber-200">
          Confirm before writing
        </p>
        <p>
          This will create <strong>one</strong> event in your connected Google Calendar.
        </p>
        <ul className="space-y-0.5 text-amber-100/90">
          <li>
            <span className="text-amber-300/80">Account:</span>{' '}
            <span className="font-mono">{accountEmail}</span>
          </li>
          <li>
            <span className="text-amber-300/80">Title:</span>{' '}
            <span className="font-mono">{title || '—'}</span>
          </li>
          <li>
            <span className="text-amber-300/80">When:</span>{' '}
            <span className="font-mono">{fmtPreview(date, startTime, duration, defaultTimeZone)}</span>
          </li>
          <li>
            <span className="text-amber-300/80">Duration:</span>{' '}
            <span className="font-mono">{duration} min</span>
          </li>
          <li>
            <span className="text-amber-300/80">Linked ticket:</span>{' '}
            <span className="font-mono">{ticketId}</span>
          </li>
          <li>
            <span className="text-amber-300/80">Description:</span>{' '}
            <span className="font-mono">
              {description ? description.slice(0, 200) + (description.length > 200 ? '…' : '') : '—'}
            </span>
          </li>
        </ul>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || alreadyCreated}
          className="rounded bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-900 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? 'Creating…' : 'Create calendar hold'}
        </button>
        <span className="text-[11px] text-neutral-500">
          Single write. Reversible from your calendar.
        </span>
      </div>

      {state.error ? (
        <p role="alert" className="text-xs text-rose-300">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="text-xs text-emerald-300">
          {state.ok}{' '}
          {state.eventLink ? (
            <a
              href={state.eventLink}
              target="_blank"
              rel="noreferrer"
              className="underline hover:text-emerald-200"
            >
              Open in Google Calendar
            </a>
          ) : null}
        </p>
      ) : null}
    </form>
  );
}
