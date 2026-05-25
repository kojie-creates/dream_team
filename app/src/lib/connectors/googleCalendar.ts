// SERVER-ONLY. Read-only Google Calendar v3 helper for Phase 5 T4.
// Never import from a client component. Reads encrypted tokens via the
// service-role client *after* the caller has already performed an
// RLS-gated auth + workspace membership check. Refreshes the access
// token transparently if it is expired or close to expiring.
//
// Boundaries:
//   - GET only. No event create / patch / delete calls.
//   - calendarId is hard-coded to 'primary'.
//   - No background polling; one fetch per caller invocation.

import 'server-only';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service';
import { decryptToken, encryptToken } from '@/lib/connectors/tokenVault';
import { env } from '@/env';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_EVENTS_LIST_URL =
  'https://www.googleapis.com/calendar/v3/calendars/primary/events';
const GOOGLE_EVENT_URL = (id: string) =>
  `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(id)}`;
// Phase 5 T6 — bounded write endpoint. POST only. No patch/delete in this module.
const GOOGLE_EVENTS_INSERT_URL =
  'https://www.googleapis.com/calendar/v3/calendars/primary/events';
export const GOOGLE_CALENDAR_WRITE_SCOPE =
  'https://www.googleapis.com/auth/calendar.events';

const REFRESH_LEEWAY_MS = 60_000; // refresh if <60s left

export type NormalizedEvent = {
  providerEventId: string;
  title: string;
  start: string | null;
  end: string | null;
  startTimeZone: string | null;
  isAllDay: boolean;
  descriptionSnippet: string | null;
  attendeesCount: number;
  meetingLink: string | null;
  hasMeetingLink: boolean;
  htmlLink: string | null;
  location: string | null;
  organizerEmail: string | null;
};

type RawEvent = {
  id?: string;
  summary?: string;
  description?: string;
  htmlLink?: string;
  hangoutLink?: string;
  location?: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: Array<{ email?: string }>;
  organizer?: { email?: string };
  conferenceData?: { entryPoints?: Array<{ entryPointType?: string; uri?: string }> };
};

export class GoogleCalendarError extends Error {
  code: string;
  status?: number;
  constructor(code: string, message: string, status?: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function snippet(text: string | undefined, max = 280): string | null {
  if (!text) return null;
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;
  return cleaned.length > max ? cleaned.slice(0, max - 1) + '…' : cleaned;
}

function normalize(raw: RawEvent): NormalizedEvent {
  const id = raw.id ?? '';
  const startDateTime = raw.start?.dateTime ?? null;
  const startDate = raw.start?.date ?? null;
  const endDateTime = raw.end?.dateTime ?? null;
  const endDate = raw.end?.date ?? null;
  const isAllDay = !startDateTime && !!startDate;

  const meet =
    raw.hangoutLink ??
    raw.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video')?.uri ??
    null;

  return {
    providerEventId: id,
    title: raw.summary?.trim() || '(no title)',
    start: startDateTime ?? startDate,
    end: endDateTime ?? endDate,
    startTimeZone: raw.start?.timeZone ?? null,
    isAllDay,
    descriptionSnippet: snippet(raw.description),
    attendeesCount: raw.attendees?.length ?? 0,
    meetingLink: meet,
    hasMeetingLink: !!meet,
    htmlLink: raw.htmlLink ?? null,
    location: raw.location?.trim() || null,
    organizerEmail: raw.organizer?.email ?? null,
  };
}

type TokenRow = {
  connector_id: string;
  access_token_encrypted: string | null;
  refresh_token_encrypted: string | null;
  expires_at: string | null;
  token_type: string | null;
};

type ConnectorContext = {
  connectorId: string;
  accessToken: string;
};

/**
 * Resolves a usable access token for the workspace's google_calendar connector.
 * Caller MUST have already verified workspace membership via an RLS-gated read.
 * Refreshes the access token if it is expired or expiring soon and a refresh
 * token is available. Persists the refreshed token via service-role.
 */
async function getConnectorAccessToken(workspaceId: string): Promise<ConnectorContext> {
  if (!env.CONNECTOR_TOKEN_ENCRYPTION_KEY) {
    throw new GoogleCalendarError(
      'encryption_key_missing',
      'CONNECTOR_TOKEN_ENCRYPTION_KEY is not configured.',
    );
  }

  const admin = createSupabaseServiceRoleClient();

  const { data: connector, error: connectorErr } = await admin
    .from('connectors')
    .select('id, status')
    .eq('workspace_id', workspaceId)
    .eq('provider', 'google_calendar')
    .maybeSingle();
  if (connectorErr) {
    throw new GoogleCalendarError('connector_lookup_failed', connectorErr.message);
  }
  if (!connector) {
    throw new GoogleCalendarError(
      'not_connected',
      'Google Calendar is not connected for this workspace.',
    );
  }
  if (connector.status !== 'connected') {
    throw new GoogleCalendarError(
      'not_connected',
      `Google Calendar connector status is "${connector.status}".`,
    );
  }

  const { data: tokenRow, error: tokenErr } = await admin
    .from('connector_tokens')
    .select('connector_id, access_token_encrypted, refresh_token_encrypted, expires_at, token_type')
    .eq('connector_id', connector.id)
    .maybeSingle<TokenRow>();
  if (tokenErr) {
    throw new GoogleCalendarError('token_lookup_failed', tokenErr.message);
  }
  if (!tokenRow || !tokenRow.access_token_encrypted) {
    throw new GoogleCalendarError(
      'token_missing',
      'Stored token row is missing. Reconnect Google Calendar.',
    );
  }

  const accessToken = decryptToken(tokenRow.access_token_encrypted);
  if (!accessToken) {
    throw new GoogleCalendarError('token_decrypt_failed', 'Could not decrypt access token.');
  }

  const expiresAtMs = tokenRow.expires_at ? Date.parse(tokenRow.expires_at) : 0;
  const isExpiring = !expiresAtMs || expiresAtMs - Date.now() < REFRESH_LEEWAY_MS;

  if (!isExpiring) {
    return { connectorId: connector.id, accessToken };
  }

  // Need refresh. If no refresh token, surface a reconnect-needed error.
  const refreshToken = decryptToken(tokenRow.refresh_token_encrypted);
  if (!refreshToken) {
    throw new GoogleCalendarError(
      'refresh_unavailable',
      'Access token expired and no refresh token is stored. Reconnect Google Calendar.',
    );
  }
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new GoogleCalendarError(
      'oauth_not_configured',
      'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set.',
    );
  }

  const refreshRes = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }).toString(),
    cache: 'no-store',
  });
  if (!refreshRes.ok) {
    throw new GoogleCalendarError(
      'refresh_failed',
      `Token refresh failed (${refreshRes.status}).`,
      refreshRes.status,
    );
  }
  const refreshJson = (await refreshRes.json()) as {
    access_token?: string;
    expires_in?: number;
    token_type?: string;
  };
  if (!refreshJson.access_token) {
    throw new GoogleCalendarError('refresh_failed', 'No access_token in refresh response.');
  }

  const newExpiresAt =
    typeof refreshJson.expires_in === 'number'
      ? new Date(Date.now() + refreshJson.expires_in * 1000).toISOString()
      : null;

  const { error: persistErr } = await admin
    .from('connector_tokens')
    .update({
      access_token_encrypted: encryptToken(refreshJson.access_token),
      expires_at: newExpiresAt,
      token_type: refreshJson.token_type ?? tokenRow.token_type,
      updated_at: new Date().toISOString(),
    })
    .eq('connector_id', connector.id);
  if (persistErr) {
    throw new GoogleCalendarError('refresh_persist_failed', persistErr.message);
  }

  return { connectorId: connector.id, accessToken: refreshJson.access_token };
}

async function googleGet<T>(url: string, accessToken: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new GoogleCalendarError(
      'google_api_error',
      `Google Calendar API ${res.status}: ${text.slice(0, 200)}`,
      res.status,
    );
  }
  return (await res.json()) as T;
}

export async function listUpcomingCalendarEvents(
  workspaceId: string,
  maxResults = 10,
): Promise<NormalizedEvent[]> {
  const { accessToken } = await getConnectorAccessToken(workspaceId);
  const url = new URL(GOOGLE_EVENTS_LIST_URL);
  url.searchParams.set('timeMin', new Date().toISOString());
  url.searchParams.set('maxResults', String(Math.min(Math.max(maxResults, 1), 50)));
  url.searchParams.set('singleEvents', 'true');
  url.searchParams.set('orderBy', 'startTime');
  const json = await googleGet<{ items?: RawEvent[] }>(url.toString(), accessToken);
  return (json.items ?? []).map(normalize);
}

// ---------------------------------------------------------------------------
// Phase 5 T6 — Controlled write path.
//
// Single bounded POST to events.insert. No patch / delete / move calls.
// Caller MUST have already:
//   - verified workspace membership via RLS,
//   - verified the connector has the calendar.events write scope,
//   - obtained explicit user confirmation of the exact event details.
// This helper does not log tokens or full response bodies.
// ---------------------------------------------------------------------------

export type CreatedCalendarEvent = {
  providerEventId: string;
  htmlLink: string | null;
  startIso: string;
  endIso: string;
};

export type CreateCalendarEventInput = {
  workspaceId: string;
  title: string;
  startIso: string;
  endIso: string;
  description: string;
  timeZone?: string | null;
};

export async function createCalendarEvent(
  input: CreateCalendarEventInput,
): Promise<CreatedCalendarEvent> {
  const { accessToken } = await getConnectorAccessToken(input.workspaceId);
  const tz = input.timeZone ?? 'UTC';
  const body = {
    summary: input.title,
    description: input.description,
    start: { dateTime: input.startIso, timeZone: tz },
    end: { dateTime: input.endIso, timeZone: tz },
  };
  const res = await fetch(GOOGLE_EVENTS_INSERT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  if (!res.ok) {
    const status = res.status;
    // Read enough to surface the error code, but do not echo the full payload.
    let code = 'google_api_error';
    try {
      const text = await res.text();
      const parsed = JSON.parse(text) as { error?: { status?: string; message?: string } };
      if (parsed?.error?.status) code = parsed.error.status;
    } catch {
      // ignore
    }
    throw new GoogleCalendarError(
      'event_insert_failed',
      `Calendar events.insert ${status} (${code}).`,
      status,
    );
  }
  const json = (await res.json()) as {
    id?: string;
    htmlLink?: string;
    start?: { dateTime?: string };
    end?: { dateTime?: string };
  };
  if (!json.id) {
    throw new GoogleCalendarError('event_insert_failed', 'No event id in response.');
  }
  return {
    providerEventId: json.id,
    htmlLink: json.htmlLink ?? null,
    startIso: json.start?.dateTime ?? input.startIso,
    endIso: json.end?.dateTime ?? input.endIso,
  };
}

export async function getCalendarEvent(
  workspaceId: string,
  providerEventId: string,
): Promise<NormalizedEvent> {
  const { accessToken } = await getConnectorAccessToken(workspaceId);
  const raw = await googleGet<RawEvent>(GOOGLE_EVENT_URL(providerEventId), accessToken);
  return normalize(raw);
}

/**
 * Renders a Google Calendar event into a plain-text brief body. No HTML.
 * The output is what gets written into briefs.raw_text on confirm.
 */
export function eventToBriefText(event: NormalizedEvent): string {
  const lines: string[] = [];
  lines.push(`Calendar event: ${event.title}`);
  if (event.start) {
    const when = event.end ? `${event.start} → ${event.end}` : event.start;
    const tz = event.startTimeZone ? ` (${event.startTimeZone})` : '';
    lines.push(`When: ${when}${tz}`);
  }
  if (event.isAllDay) lines.push('All-day event.');
  if (event.location) lines.push(`Location: ${event.location}`);
  if (event.organizerEmail) lines.push(`Organizer: ${event.organizerEmail}`);
  lines.push(`Attendees: ${event.attendeesCount}`);
  if (event.hasMeetingLink && event.meetingLink) {
    lines.push(`Meeting link: ${event.meetingLink}`);
  }
  if (event.descriptionSnippet) {
    lines.push('');
    lines.push('Description:');
    lines.push(event.descriptionSnippet);
  }
  lines.push('');
  lines.push(`Source: google_calendar event ${event.providerEventId}`);
  return lines.join('\n');
}
