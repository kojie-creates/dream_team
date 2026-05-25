'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service';
import {
  GoogleCalendarError,
  eventToBriefText,
  listUpcomingCalendarEvents,
  type NormalizedEvent,
} from '@/lib/connectors/googleCalendar';

export type CreateRuleState = { error: string | null; ok: string | null };
export type RunRuleState = { error: string | null; ok: string | null };

const NAME_MAX = 80;
const MATCH_MAX = 200;
const TITLE_MAX = 120;
const ALLOWED_WINDOWS = new Set([7, 14]);

type RuleConfig = {
  match_text?: string;
  window_days: number;
};

function wordCount(raw: string): number {
  const matches = raw.trim().match(/\S+/g);
  return matches ? matches.length : 0;
}

function eventStartMs(e: NormalizedEvent): number {
  if (!e.start) return Number.POSITIVE_INFINITY;
  const ms = Date.parse(e.start);
  return Number.isFinite(ms) ? ms : Number.POSITIVE_INFINITY;
}

function eventMatchesText(e: NormalizedEvent, needle: string): boolean {
  const n = needle.toLowerCase();
  if (e.title?.toLowerCase().includes(n)) return true;
  if (e.descriptionSnippet?.toLowerCase().includes(n)) return true;
  if (e.location?.toLowerCase().includes(n)) return true;
  return false;
}

export async function createAutomationRule(
  _prev: CreateRuleState,
  form: FormData,
): Promise<CreateRuleState> {
  const slug = String(form.get('slug') ?? '').trim();
  const name = String(form.get('name') ?? '').trim();
  const matchText = String(form.get('match_text') ?? '').trim();
  const windowDays = Number.parseInt(String(form.get('window_days') ?? '7'), 10);

  if (!slug) return { error: 'Workspace missing.', ok: null };
  if (!name) return { error: 'Rule name required.', ok: null };
  if (name.length > NAME_MAX) return { error: `Name must be ${NAME_MAX} chars or fewer.`, ok: null };
  if (matchText.length > MATCH_MAX) {
    return { error: `Match text must be ${MATCH_MAX} chars or fewer.`, ok: null };
  }
  if (!ALLOWED_WINDOWS.has(windowDays)) {
    return { error: 'Event window must be 7 or 14 days.', ok: null };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/signin');

  const { data: workspace } = await supabase
    .from('workspaces')
    .select('id, slug')
    .eq('slug', slug)
    .maybeSingle();
  if (!workspace) return { error: 'Workspace not found or access denied.', ok: null };

  const { data: connector } = await supabase
    .from('connectors')
    .select('id, status')
    .eq('workspace_id', workspace.id)
    .eq('provider', 'google_calendar')
    .maybeSingle();
  if (!connector) return { error: 'Google Calendar is not connected.', ok: null };

  const config: RuleConfig = {
    window_days: windowDays,
    ...(matchText ? { match_text: matchText } : {}),
  };

  const { error: insertErr } = await supabase.from('automation_rules').insert({
    workspace_id: workspace.id,
    connector_id: connector.id,
    name,
    status: 'paused',
    trigger_type: 'manual_calendar_ingest',
    config,
    created_by: user.id,
  });
  if (insertErr) {
    return {
      error: `Could not create rule: ${insertErr.message} (owner/admin required).`,
      ok: null,
    };
  }

  revalidatePath(`/w/${slug}/settings/automations`);
  return { error: null, ok: `Created rule "${name}".` };
}

/**
 * Phase 5 T5 — manual run. Fetches upcoming Google Calendar events server-side,
 * picks the first one matching the rule's config inside its window, and creates
 * a brief + ticket pair as the calling user. Idempotence: looks up
 * trace_events for an existing brief_ingested marker carrying the same
 * provider_event_id in this workspace; if present, skips creation and reports
 * the duplicate.
 *
 * No scheduler. No cron. Caller must click "Run now" each time.
 */
export async function runAutomationRuleNow(
  _prev: RunRuleState,
  form: FormData,
): Promise<RunRuleState> {
  const slug = String(form.get('slug') ?? '').trim();
  const ruleId = String(form.get('rule_id') ?? '').trim();
  if (!slug) return { error: 'Workspace missing.', ok: null };
  if (!ruleId) return { error: 'Rule id missing.', ok: null };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/signin');

  // (1) RLS-gated workspace read
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('id, slug')
    .eq('slug', slug)
    .maybeSingle();
  if (!workspace) return { error: 'Workspace not found or access denied.', ok: null };

  // (2) RLS-gated rule read
  const { data: rule } = await supabase
    .from('automation_rules')
    .select('id, workspace_id, connector_id, trigger_type, config')
    .eq('id', ruleId)
    .eq('workspace_id', workspace.id)
    .maybeSingle();
  if (!rule) return { error: 'Rule not found.', ok: null };
  if (rule.trigger_type !== 'manual_calendar_ingest') {
    return { error: `Trigger type "${rule.trigger_type}" cannot be run manually in T5.`, ok: null };
  }

  // (3) RLS-gated connector check
  const { data: connector } = await supabase
    .from('connectors')
    .select('id, status')
    .eq('id', rule.connector_id)
    .maybeSingle();
  if (!connector || connector.status !== 'connected') {
    return { error: 'Google Calendar is not connected.', ok: null };
  }

  const cfg = (rule.config ?? {}) as Partial<RuleConfig>;
  const windowDays = ALLOWED_WINDOWS.has(cfg.window_days ?? 7) ? (cfg.window_days ?? 7) : 7;
  const matchText = (cfg.match_text ?? '').trim();
  const windowEndMs = Date.now() + windowDays * 24 * 60 * 60 * 1000;

  // (4) server-only Calendar fetch
  let events: NormalizedEvent[];
  try {
    events = await listUpcomingCalendarEvents(workspace.id, 50);
  } catch (e) {
    const msg =
      e instanceof GoogleCalendarError ? `${e.code}: ${e.message}` : 'Failed to list events.';
    await recordRuleResult(rule.id, `error: ${msg}`);
    return { error: msg, ok: null };
  }

  const matches = events.filter((e) => {
    if (eventStartMs(e) > windowEndMs) return false;
    if (matchText && !eventMatchesText(e, matchText)) return false;
    return true;
  });

  const event = matches[0];
  if (!event) {
    const reason = matchText
      ? `no event matched "${matchText}" in next ${windowDays}d`
      : `no upcoming events in next ${windowDays}d`;
    await recordRuleResult(rule.id, `no match: ${reason}`);
    return { error: null, ok: `No matching event. ${reason}.` };
  }

  // (5) idempotence — has this provider_event_id already been ingested in
  // this workspace via a connector trace event? trace_events.select is
  // RLS-gated to workspace members, which the caller already is.
  const { data: existing } = await supabase
    .from('trace_events')
    .select('ticket_id')
    .eq('workspace_id', workspace.id)
    .eq('event_type', 'brief_ingested')
    .filter('payload->>provider_event_id', 'eq', event.providerEventId)
    .limit(1)
    .maybeSingle();
  if (existing?.ticket_id) {
    const msg = `duplicate: event already ingested (ticket ${existing.ticket_id}).`;
    await recordRuleResult(rule.id, msg);
    return { error: null, ok: msg };
  }

  // (6) RLS-gated brief + ticket inserts as the caller (T4 path).
  const briefText = eventToBriefText(event);
  const title = (event.title ?? '').trim().slice(0, TITLE_MAX) || 'Calendar event';

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
  if (briefErr || !brief) {
    const msg = `brief insert failed: ${briefErr?.message ?? 'unknown'}`;
    await recordRuleResult(rule.id, msg);
    return { error: msg, ok: null };
  }

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
  if (ticketErr || !ticket) {
    const msg = `ticket insert failed: ${ticketErr?.message ?? 'unknown'}`;
    await recordRuleResult(rule.id, msg);
    return { error: msg, ok: null };
  }

  // (7) Best-effort trace + connector sync stamp + rule last_run via service-role.
  // Auth + workspace membership were verified in (1)-(3); service-role here is
  // limited to rows the caller already has write authority for via RLS-gated
  // paths (briefs/tickets above) or read authority for (trace_events).
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
        automation_rule_id: rule.id,
      },
    });
    await admin
      .from('connectors')
      .update({ last_sync_at: new Date().toISOString(), last_error: null })
      .eq('id', connector.id);
  } catch {
    // non-fatal — brief/ticket already exist
  }

  await recordRuleResult(rule.id, `created ticket ${ticket.id}`);

  revalidatePath(`/w/${slug}`);
  revalidatePath(`/w/${slug}/settings/automations`);
  redirect(`/w/${slug}/tickets/${ticket.id}`);
}

/**
 * Service-role update of rule.last_run_at + last_result. Required because
 * automation_rules_admin_update gates UPDATE on owner/admin, but any member
 * may invoke a manual run. The rule has already been authorization-checked
 * by a prior RLS-gated select in the same request.
 */
async function recordRuleResult(ruleId: string, result: string): Promise<void> {
  try {
    const admin = createSupabaseServiceRoleClient();
    await admin
      .from('automation_rules')
      .update({
        last_run_at: new Date().toISOString(),
        last_result: result.slice(0, 500),
      })
      .eq('id', ruleId);
  } catch {
    // non-fatal
  }
}
