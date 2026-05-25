// Server component. Decides whether to render the Calendar hold form on a
// ticket page. Visibility rules:
//   - Google Calendar connector exists for the workspace AND status='connected'.
//   - Connector scopes include the calendar.events write scope.
//   - Account email is known (provider_account_email is set).
// If connected but write scope is missing, the panel renders a reconnect call-
// to-action and explicitly does NOT show a submit button.
//
// Reads connector + scopes via RLS-gated session client. Reads
// provider_account_email via service-role only AFTER the RLS read confirms the
// caller is a workspace member — same envelope as Phase 5 T3/T4 settings page.

import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service';
import { CalendarHoldForm } from './CalendarHoldForm';

const WRITE_SCOPE = 'https://www.googleapis.com/auth/calendar.events';

function nextHalfHourIsoParts(): { date: string; time: string; tz: string } {
  const now = new Date();
  // Round up to next 30-minute boundary.
  const ms = now.getTime();
  const slot = 30 * 60_000;
  const rounded = new Date(Math.ceil(ms / slot) * slot);
  const yyyy = rounded.getFullYear();
  const mm = String(rounded.getMonth() + 1).padStart(2, '0');
  const dd = String(rounded.getDate()).padStart(2, '0');
  const hh = String(rounded.getHours()).padStart(2, '0');
  const mi = String(rounded.getMinutes()).padStart(2, '0');
  let tz = 'UTC';
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    // ignore
  }
  return { date: `${yyyy}-${mm}-${dd}`, time: `${hh}:${mi}`, tz };
}

export async function CalendarHoldPanel({
  slug,
  workspaceId,
  ticketId,
  ticketTitle,
}: {
  slug: string;
  workspaceId: string;
  ticketId: string;
  ticketTitle: string;
}) {
  const supabase = await createSupabaseServerClient();

  const { data: connector } = await supabase
    .from('connectors')
    .select('id, status, scopes')
    .eq('workspace_id', workspaceId)
    .eq('provider', 'google_calendar')
    .maybeSingle();

  if (!connector || connector.status !== 'connected') {
    // Don't show the panel at all — keeps the ticket page clean when the
    // workspace hasn't opted into a Calendar connection.
    return null;
  }

  const scopes = (connector.scopes ?? []) as string[];
  const hasWriteScope = scopes.includes(WRITE_SCOPE);

  if (!hasWriteScope) {
    return (
      <section className="space-y-2 rounded border border-amber-900/40 bg-amber-950/10 p-4 text-xs text-amber-100">
        <h2 className="text-sm font-medium text-amber-100">Calendar hold</h2>
        <p>
          Google Calendar is connected with read-only scope. Creating a hold requires the bounded
          event-write scope (<span className="font-mono">calendar.events</span>).
        </p>
        <p>
          <Link
            href={`/w/${slug}/settings/connectors/google-calendar/start?write=1`}
            className="inline-block rounded bg-amber-200/90 px-3 py-1.5 font-medium text-amber-950 hover:bg-amber-200"
          >
            Reconnect Google Calendar with event-write scope
          </Link>
        </p>
        <p className="text-[11px] text-amber-200/70">
          No write button is shown until the expanded scope is granted.
        </p>
      </section>
    );
  }

  // Post-auth, RLS-confirmed: read connected account email for display.
  const admin = createSupabaseServiceRoleClient();
  const { data: tokenMeta } = await admin
    .from('connector_tokens')
    .select('provider_account_email')
    .eq('connector_id', connector.id)
    .maybeSingle();
  const accountEmail = (tokenMeta?.provider_account_email as string | null) ?? null;

  if (!accountEmail) {
    return (
      <section className="space-y-2 rounded border border-amber-900/40 bg-amber-950/10 p-4 text-xs text-amber-100">
        <h2 className="text-sm font-medium text-amber-100">Calendar hold</h2>
        <p>
          Connected account email is unavailable. Reconnect Google Calendar before creating a
          hold.
        </p>
        <Link
          href={`/w/${slug}/settings/connectors/google-calendar/start?write=1`}
          className="inline-block rounded bg-amber-200/90 px-3 py-1.5 font-medium text-amber-950 hover:bg-amber-200"
        >
          Reconnect Google Calendar
        </Link>
      </section>
    );
  }

  const { date, time, tz } = nextHalfHourIsoParts();
  const defaultDescription =
    `Hold created from Dream Team ticket.\n` +
    `Ticket: ${ticketTitle}\n` +
    `Ticket id: ${ticketId}\n` +
    `Workspace: ${slug}`;

  return (
    <section className="space-y-3 rounded border border-neutral-800 bg-neutral-950 p-4">
      <header className="space-y-1">
        <h2 className="text-sm font-medium text-neutral-200">Calendar hold</h2>
        <p className="text-[11px] text-neutral-500">
          Single confirmed write to your connected Google Calendar. Reversible from your calendar.
          Account: <span className="font-mono text-neutral-300">{accountEmail}</span>.
        </p>
      </header>
      <CalendarHoldForm
        slug={slug}
        ticketId={ticketId}
        ticketTitle={ticketTitle}
        accountEmail={accountEmail}
        defaultDate={date}
        defaultStartTime={time}
        defaultDescription={defaultDescription}
        defaultTimeZone={tz}
      />
    </section>
  );
}
