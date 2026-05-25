'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service';
import {
  GOOGLE_CALENDAR_WRITE_SCOPE,
  GoogleCalendarError,
  createCalendarEvent,
  eventToBriefText,
  getCalendarEvent,
} from '@/lib/connectors/googleCalendar';

export type DisconnectState = { error: string | null; ok: string | null };
export type CreateBriefFromEventState = { error: string | null };
export type CreateCalendarHoldState = {
  error: string | null;
  ok: string | null;
  eventLink: string | null;
};

export async function disconnectGoogleCalendar(
  _: DisconnectState,
  form: FormData,
): Promise<DisconnectState> {
  const slug = String(form.get('slug') ?? '').trim();
  if (!slug) return { error: 'Missing workspace slug.', ok: null };

  // (1) auth
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/signin');

  // (2) workspace membership via RLS-gated read
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('id, slug')
    .eq('slug', slug)
    .maybeSingle();
  if (!workspace) return { error: 'Workspace not found or access denied.', ok: null };

  // (3) admin-only update via RLS — connectors_admin_update policy enforces
  // owner/admin. If caller is a plain member the row will not be filtered to
  // them for update and the affected count will be 0, which we report.
  const { data: updated, error: updateErr } = await supabase
    .from('connectors')
    .update({ status: 'disconnected', last_error: null })
    .eq('workspace_id', workspace.id)
    .eq('provider', 'google_calendar')
    .select('id');
  if (updateErr) return { error: updateErr.message, ok: null };
  const updatedRow = updated?.[0];
  if (!updatedRow) {
    return {
      error: 'No connector to disconnect, or insufficient role (owner/admin required).',
      ok: null,
    };
  }

  // (4) service-role only after authorization — wipe token row.
  const admin = createSupabaseServiceRoleClient();
  const { error: delErr } = await admin
    .from('connector_tokens')
    .delete()
    .eq('connector_id', updatedRow.id);
  if (delErr) return { error: `Token row delete failed: ${delErr.message}`, ok: null };

  revalidatePath(`/w/${slug}/settings/connectors`);
  return { error: null, ok: 'Google Calendar disconnected.' };
}

const TITLE_MAX = 120;

function wordCount(raw: string): number {
  const matches = raw.trim().match(/\S+/g);
  return matches ? matches.length : 0;
}

/**
 * Phase 5 T4 — confirm-to-create. User has already previewed an event; this
 * action fetches the event metadata server-side once more (single source of
 * truth, no client-supplied event body), writes a brief and a ticket under
 * the caller's auth, and redirects to the ticket detail page.
 */
export async function createBriefFromCalendarEvent(
  _: CreateBriefFromEventState,
  form: FormData,
): Promise<CreateBriefFromEventState> {
  const slug = String(form.get('slug') ?? '').trim();
  const eventId = String(form.get('event_id') ?? '').trim();
  if (!slug) return { error: 'Workspace missing from request.' };
  if (!eventId) return { error: 'Event id missing from request.' };

  // (1) session
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/signin');

  // (2) RLS-gated workspace read
  const { data: workspace, error: wsErr } = await supabase
    .from('workspaces')
    .select('id, slug')
    .eq('slug', slug)
    .maybeSingle();
  if (wsErr) return { error: wsErr.message };
  if (!workspace) return { error: 'Workspace not found or access denied.' };

  // (3) RLS-gated connector metadata read (member can see status)
  const { data: connector } = await supabase
    .from('connectors')
    .select('id, status')
    .eq('workspace_id', workspace.id)
    .eq('provider', 'google_calendar')
    .maybeSingle();
  if (!connector || connector.status !== 'connected') {
    return { error: 'Google Calendar is not connected.' };
  }

  // (4) server-only provider fetch (decrypts token via service-role)
  let event;
  try {
    event = await getCalendarEvent(workspace.id, eventId);
  } catch (e) {
    const msg =
      e instanceof GoogleCalendarError ? `${e.code}: ${e.message}` : 'Failed to read event.';
    return { error: msg };
  }

  const title = (event.title ?? '').trim().slice(0, TITLE_MAX) || 'Calendar event';
  const briefText = eventToBriefText(event);

  // (5) RLS-gated insert as the caller
  const { data: brief, error: briefErr } = await supabase
    .from('briefs')
    .insert({
      workspace_id: workspace.id,
      source: 'connector',
      raw_text: briefText,
      word_count: wordCount(briefText),
      parsed_status: 'ready',
      created_by: user.id,
    })
    .select('id')
    .single();
  if (briefErr || !brief) return { error: briefErr?.message ?? 'Failed to save brief.' };

  const { data: ticket, error: ticketErr } = await supabase
    .from('tickets')
    .insert({
      workspace_id: workspace.id,
      brief_id: brief.id,
      title,
      status: 'open',
      created_by: user.id,
    })
    .select('id')
    .single();
  if (ticketErr || !ticket) return { error: ticketErr?.message ?? 'Failed to open ticket.' };

  // (6) Best-effort trace event marking the connector ingest. trace_events
  // has no client policy, so we use service-role. Failure is logged in
  // last_sync_at but does NOT block the ticket creation — the brief/ticket
  // pair is the user-facing artifact, not the trace.
  try {
    const admin = createSupabaseServiceRoleClient();
    await admin.from('trace_events').insert({
      workspace_id: workspace.id,
      ticket_id: ticket.id,
      seq: 1,
      from_agent: 'connector:google_calendar',
      to_agent: 'user',
      event_type: 'brief_ingested',
      payload: {
        provider: 'google_calendar',
        provider_event_id: event.providerEventId,
        title: event.title,
        attendees_count: event.attendeesCount,
        has_meeting_link: event.hasMeetingLink,
        ingested_by: user.id,
      },
    });
    await admin
      .from('connectors')
      .update({ last_sync_at: new Date().toISOString(), last_error: null })
      .eq('id', connector.id);
  } catch {
    // non-fatal — brief/ticket already exist
  }

  revalidatePath(`/w/${slug}`);
  revalidatePath(`/w/${slug}/settings/connectors`);
  redirect(`/w/${slug}/tickets/${ticket.id}`);
}

// ---------------------------------------------------------------------------
// Phase 5 T6 — Controlled tool write: create a Google Calendar hold from a
// ticket. The only outbound write surface in Phase 5. Requires:
//   - authenticated user + workspace membership (RLS)
//   - ticket visible under workspace RLS
//   - connector status='connected' AND scopes include calendar.events
//   - explicit form submission carrying every field shown in confirmation
//
// No autonomous trigger. No second write. No retry path. On success we write
// a trace_events row + a 'trace' packet whose body_parsed.packet_kind is
// 'tool_write', so the ticket page can render the audit. Ticket status is
// NOT auto-completed by a successful hold.
// ---------------------------------------------------------------------------

const HOLD_TITLE_MAX = 200;
const HOLD_DESC_MAX = 2000;
const HOLD_MIN_DURATION_MIN = 5;
const HOLD_MAX_DURATION_MIN = 8 * 60;

function clampDuration(n: number): number {
  if (!Number.isFinite(n)) return 30;
  return Math.min(Math.max(Math.round(n), HOLD_MIN_DURATION_MIN), HOLD_MAX_DURATION_MIN);
}

export async function createCalendarHoldForTicket(
  _prev: CreateCalendarHoldState,
  form: FormData,
): Promise<CreateCalendarHoldState> {
  const fail = (error: string): CreateCalendarHoldState => ({ error, ok: null, eventLink: null });

  const slug = String(form.get('slug') ?? '').trim();
  const ticketId = String(form.get('ticketId') ?? '').trim();
  const rawTitle = String(form.get('title') ?? '').trim();
  const date = String(form.get('date') ?? '').trim(); // YYYY-MM-DD
  const startTime = String(form.get('start_time') ?? '').trim(); // HH:MM
  const durationMin = clampDuration(Number(form.get('duration_min') ?? 30));
  const description = String(form.get('description') ?? '').trim().slice(0, HOLD_DESC_MAX);
  const tz = String(form.get('time_zone') ?? '').trim() || 'UTC';
  const confirmedAccount = String(form.get('confirmed_account') ?? '').trim();

  if (!slug || !ticketId) return fail('Missing workspace or ticket.');
  if (!rawTitle) return fail('Title is required.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail('Date must be YYYY-MM-DD.');
  if (!/^\d{2}:\d{2}$/.test(startTime)) return fail('Start time must be HH:MM.');

  const title = rawTitle.slice(0, HOLD_TITLE_MAX);
  // Treat date+time as wall-clock in the supplied tz. We do the duration math
  // by pretending the wall-clock is UTC (purely arithmetic), then strip the
  // offset so Google interprets it under the tz field we send alongside.
  const startWall = new Date(`${date}T${startTime}:00Z`);
  if (Number.isNaN(startWall.getTime())) return fail('Invalid start date/time.');
  const endWall = new Date(startWall.getTime() + durationMin * 60_000);
  const fmtWall = (d: Date) => d.toISOString().slice(0, 19); // YYYY-MM-DDTHH:MM:SS
  const startIso = fmtWall(startWall);
  const endIso = fmtWall(endWall);

  // (1) session
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/signin');

  // (2) RLS-gated workspace
  const { data: workspace, error: wsErr } = await supabase
    .from('workspaces')
    .select('id, slug')
    .eq('slug', slug)
    .maybeSingle();
  if (wsErr) return fail(wsErr.message);
  if (!workspace) return fail('Workspace not found or access denied.');

  // (3) RLS-gated ticket read
  const { data: ticket, error: tErr } = await supabase
    .from('tickets')
    .select('id, title, workspace_id, status')
    .eq('id', ticketId)
    .eq('workspace_id', workspace.id)
    .maybeSingle();
  if (tErr) return fail(tErr.message);
  if (!ticket) return fail('Ticket not found or access denied.');

  // (4) RLS-gated connector metadata read — confirm connect + write scope
  const { data: connector, error: cErr } = await supabase
    .from('connectors')
    .select('id, status, scopes')
    .eq('workspace_id', workspace.id)
    .eq('provider', 'google_calendar')
    .maybeSingle();
  if (cErr) return fail(cErr.message);
  if (!connector || connector.status !== 'connected') {
    return fail('Google Calendar is not connected.');
  }
  const scopes = (connector.scopes ?? []) as string[];
  if (!scopes.includes(GOOGLE_CALENDAR_WRITE_SCOPE)) {
    return fail('Calendar write scope missing. Reconnect Google Calendar with event-write scope.');
  }

  // (5) Service-role: read provider account email so we can verify the user
  // confirmed against the correct account before issuing the write.
  const admin = createSupabaseServiceRoleClient();
  const { data: tokenMeta, error: tmErr } = await admin
    .from('connector_tokens')
    .select('provider_account_email')
    .eq('connector_id', connector.id)
    .maybeSingle();
  if (tmErr) return fail(tmErr.message);
  const accountEmail = tokenMeta?.provider_account_email ?? null;
  if (!accountEmail) {
    return fail('Connected account email is unavailable. Reconnect Google Calendar.');
  }
  if (confirmedAccount && confirmedAccount !== accountEmail) {
    return fail('Confirmed account does not match the connected Google Calendar account.');
  }

  // (6) External write — single bounded POST.
  let created;
  try {
    created = await createCalendarEvent({
      workspaceId: workspace.id as string,
      title,
      startIso,
      endIso,
      description,
      timeZone: tz,
    });
  } catch (e) {
    const msg =
      e instanceof GoogleCalendarError
        ? `${e.code}: ${e.message}`
        : 'Calendar write failed.';
    return fail(msg);
  }

  // (7) Audit trail — trace event + packet linked to the ticket. Mirrors
  // Phase 2/4 service-role-after-authorization pattern.
  const { data: maxRow } = await admin
    .from('trace_events')
    .select('seq')
    .eq('ticket_id', ticket.id)
    .order('seq', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSeq = ((maxRow?.seq as number | undefined) ?? 0) + 1;

  const tracePayload = {
    provider: 'google_calendar',
    action: 'calendar_hold.created',
    provider_event_id: created.providerEventId,
    html_link: created.htmlLink,
    title,
    start: created.startIso,
    end: created.endIso,
    duration_min: durationMin,
    time_zone: tz,
    confirmed_by: user.id,
    confirmed_account: accountEmail,
    external_write: true,
    tool_use: true,
  };

  const { data: traceEvent, error: trErr } = await admin
    .from('trace_events')
    .insert({
      workspace_id: workspace.id,
      ticket_id: ticket.id,
      seq: nextSeq,
      from_agent: 'human-confirmed-tool',
      to_agent: 'google_calendar',
      event_type: 'tool.calendar_hold.created',
      payload: tracePayload,
    })
    .select('id')
    .single();
  if (trErr || !traceEvent) {
    return {
      error: trErr?.message ?? 'Failed to write trace event.',
      ok: 'Calendar event created, but audit write failed.',
      eventLink: created.htmlLink,
    };
  }

  const bodyRaw =
    `TOOL WRITE PACKET\n` +
    `From: human-confirmed-tool\n` +
    `To: google_calendar\n` +
    `Work item: ${ticket.id}\n` +
    `Action: calendar_hold.created\n` +
    `Confirmed by: ${user.id}\n` +
    `Confirmed account: ${accountEmail}\n` +
    `Title: ${title}\n` +
    `Start: ${created.startIso}\n` +
    `End: ${created.endIso}\n` +
    `Duration (min): ${durationMin}\n` +
    `Time zone: ${tz}\n` +
    `Provider event id: ${created.providerEventId}\n` +
    `External write: true`;

  await admin.from('packets').insert({
    workspace_id: workspace.id,
    ticket_id: ticket.id,
    trace_event_id: traceEvent.id,
    packet_type: 'trace',
    body_raw: bodyRaw,
    body_parsed: {
      packet_kind: 'tool_write',
      from: 'human-confirmed-tool',
      to: 'google_calendar',
      provider: 'google_calendar',
      action: 'calendar_hold.created',
      provider_event_id: created.providerEventId,
      html_link: created.htmlLink,
      title,
      start: created.startIso,
      end: created.endIso,
      duration_min: durationMin,
      time_zone: tz,
      confirmed_by: user.id,
      confirmed_account: accountEmail,
      external_write: true,
      tool_use: true,
    },
  });

  revalidatePath(`/w/${slug}/tickets/${ticket.id}`);

  return {
    error: null,
    ok: `Calendar hold created on ${accountEmail}.`,
    eventLink: created.htmlLink,
  };
}
