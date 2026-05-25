// Phase 5 T4 — Google Calendar connector detail page.
// Lists upcoming events (read-only) and previews one event before the user
// confirms creating a brief + ticket. No background polling, no writes.

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service';
import {
  GoogleCalendarError,
  eventToBriefText,
  getCalendarEvent,
  listUpcomingCalendarEvents,
  type NormalizedEvent,
} from '@/lib/connectors/googleCalendar';
import { ConfirmCalendarBriefForm } from '@/components/connectors/ConfirmCalendarBriefForm';

function fmtWhen(event: NormalizedEvent): string {
  if (!event.start) return '(no start time)';
  try {
    const d = new Date(event.start);
    if (Number.isNaN(d.getTime())) return event.start;
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: event.isAllDay ? undefined : '2-digit',
      minute: event.isAllDay ? undefined : '2-digit',
    });
  } catch {
    return event.start;
  }
}

export default async function GoogleCalendarConnectorPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ eventId?: string; error?: string }>;
}) {
  const { slug } = await params;
  const { eventId, error: errorParam } = await searchParams;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/signin');

  const { data: workspace } = await supabase
    .from('workspaces')
    .select('id, slug, name')
    .eq('slug', slug)
    .maybeSingle();
  if (!workspace) notFound();

  // RLS-gated connector metadata read.
  const { data: connector } = await supabase
    .from('connectors')
    .select('id, status, connected_at, last_sync_at, last_error')
    .eq('workspace_id', workspace.id)
    .eq('provider', 'google_calendar')
    .maybeSingle();

  // Display-only account email via service-role on a non-secret column.
  let accountEmail: string | null = null;
  if (connector && connector.status === 'connected') {
    const admin = createSupabaseServiceRoleClient();
    const { data: meta } = await admin
      .from('connector_tokens')
      .select('provider_account_email')
      .eq('connector_id', connector.id)
      .maybeSingle();
    accountEmail = (meta?.provider_account_email as string | null) ?? null;
  }

  const isConnected = !!connector && connector.status === 'connected';

  let events: NormalizedEvent[] | null = null;
  let listError: string | null = null;
  let preview: NormalizedEvent | null = null;
  let previewError: string | null = null;

  if (isConnected) {
    try {
      events = await listUpcomingCalendarEvents(workspace.id, 10);
    } catch (e) {
      listError =
        e instanceof GoogleCalendarError
          ? `${e.code}: ${e.message}`
          : 'Could not load events.';
    }
    if (eventId) {
      try {
        preview = await getCalendarEvent(workspace.id, eventId);
      } catch (e) {
        previewError =
          e instanceof GoogleCalendarError
            ? `${e.code}: ${e.message}`
            : 'Could not load event.';
      }
    }
  }

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-wider text-neutral-500">
          <Link href={`/w/${workspace.slug}`} className="hover:text-neutral-300">
            {workspace.name}
          </Link>
          {' · '}
          <Link
            href={`/w/${workspace.slug}/settings/connectors`}
            className="hover:text-neutral-300"
          >
            ← Connectors
          </Link>
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-100">
          Google Calendar
        </h1>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span
            className={`rounded px-2 py-0.5 font-medium uppercase tracking-wider ${
              isConnected
                ? 'bg-emerald-900/40 text-emerald-200'
                : 'bg-neutral-800 text-neutral-300'
            }`}
          >
            {isConnected ? 'Connected' : 'Not connected'}
          </span>
          {accountEmail ? (
            <span className="text-neutral-400">as {accountEmail}</span>
          ) : null}
        </div>
      </header>

      <div className="rounded-lg border border-amber-900/40 bg-amber-950/20 p-3 text-xs text-amber-100/90">
        <p className="font-medium uppercase tracking-wider text-amber-300/80">Read-only</p>
        <p className="mt-1">
          Dream Team reads event metadata only. It does not create, modify, or delete events in
          your Google Calendar in this phase. Briefs are created only after you confirm here.
        </p>
      </div>

      {errorParam ? (
        <div className="rounded border border-rose-900/60 bg-rose-950/30 p-3 text-xs text-rose-200">
          {errorParam}
        </div>
      ) : null}

      {!isConnected ? (
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-6 text-sm text-neutral-300">
          <p>Google Calendar is not connected for this workspace.</p>
          <p className="mt-2">
            <Link
              href={`/w/${workspace.slug}/settings/connectors`}
              className="text-sky-300 hover:text-sky-200"
            >
              Go to Connectors to connect →
            </Link>
          </p>
        </div>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-sm font-medium uppercase tracking-wider text-neutral-400">
              Next 10 upcoming events
            </h2>
            {listError ? (
              <div className="rounded border border-rose-900/60 bg-rose-950/30 p-3 text-xs text-rose-200">
                {listError}
              </div>
            ) : events && events.length === 0 ? (
              <p className="text-sm text-neutral-500">No upcoming events in this calendar.</p>
            ) : events ? (
              <ul className="divide-y divide-neutral-800 rounded-lg border border-neutral-800 bg-neutral-900/40">
                {events.map((e) => {
                  const isSelected = e.providerEventId === eventId;
                  return (
                    <li
                      key={e.providerEventId}
                      className={`flex items-start justify-between gap-3 p-3 ${
                        isSelected ? 'bg-neutral-800/40' : ''
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm text-neutral-100">{e.title}</p>
                        <p className="text-[11px] text-neutral-500">
                          {fmtWhen(e)} · {e.attendeesCount} attendee
                          {e.attendeesCount === 1 ? '' : 's'}
                          {e.hasMeetingLink ? ' · video link' : ''}
                        </p>
                      </div>
                      <Link
                        href={`/w/${workspace.slug}/settings/connectors/google-calendar?eventId=${encodeURIComponent(e.providerEventId)}`}
                        scroll={false}
                        className="shrink-0 rounded border border-sky-900/60 bg-sky-950/40 px-2 py-1 text-[11px] text-sky-200 hover:bg-sky-950/60"
                      >
                        Preview as brief
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </section>

          {eventId ? (
            <section className="space-y-3">
              <h2 className="text-sm font-medium uppercase tracking-wider text-neutral-400">
                Preview
              </h2>
              {previewError ? (
                <div className="rounded border border-rose-900/60 bg-rose-950/30 p-3 text-xs text-rose-200">
                  {previewError}
                </div>
              ) : preview ? (
                <div className="space-y-3 rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
                  <div className="text-[11px] text-neutral-500">
                    Source: <span className="text-neutral-300">google_calendar</span> · event id{' '}
                    <span className="font-mono text-neutral-400">{preview.providerEventId}</span>
                  </div>
                  <pre className="whitespace-pre-wrap rounded bg-neutral-950 p-3 font-mono text-xs text-neutral-200">
                    {eventToBriefText(preview)}
                  </pre>
                  <ConfirmCalendarBriefForm
                    slug={workspace.slug}
                    eventId={preview.providerEventId}
                  />
                </div>
              ) : null}
            </section>
          ) : null}

          {connector?.last_sync_at ? (
            <p className="text-[11px] text-neutral-600">
              Last ingest: {new Date(connector.last_sync_at).toLocaleString()}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
