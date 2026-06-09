// calendar — CONr (read) + CONw (write) tools over Google Calendar. The runtime
// resolves the user's calendar token via ctx.connectors (the user-session RPC +
// in-memory refresh, connectors/google.ts) and calls the Calendar API directly.
//
// Static declaration (Decision 5): calendar_read = CONr / T2; calendar_write =
// CONw / T1 (a T1 write requires standing grant + per-action approval at the gate).
// Both fail closed (execution_error, no side effect) when ctx.connectors is absent
// — exactly like shell refuses without ctx.confine.
//
// Decoupling: no electron, no app imports — the runtime owns its own connector path.

import type { ToolDef, ToolExecContext, ToolObservation } from './types.ts';
import { ConnectorError } from '../connectors/google.ts';

const EVENTS_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

export interface CalendarReadInput {
  maxResults?: number;
}

export interface CalendarWriteInput {
  title: string;
  startIso: string;
  endIso: string;
  description?: string;
  timeZone?: string;
}

interface RawEvent {
  id?: string;
  summary?: string;
  htmlLink?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}

interface NormalizedEvent {
  providerEventId: string | null;
  summary: string;
  start: string | null;
  end: string | null;
  htmlLink: string | null;
}

function normalize(e: RawEvent): NormalizedEvent {
  return {
    providerEventId: e.id ?? null,
    summary: e.summary ?? '(no title)',
    start: e.start?.dateTime ?? e.start?.date ?? null,
    end: e.end?.dateTime ?? e.end?.date ?? null,
    htmlLink: e.htmlLink ?? null,
  };
}

export const calendarReadTool: ToolDef<CalendarReadInput> = {
  name: 'calendar_read',
  capability: 'CONr',
  actionTier: 'T2',
  inputSchema: {
    type: 'object',
    properties: {
      maxResults: { type: 'number', description: 'How many upcoming events to list (1–50, default 10).' },
    },
    required: [],
    additionalProperties: false,
  },
  async execute(input: CalendarReadInput, ctx: ToolExecContext): Promise<ToolObservation> {
    if (!ctx.connectors) return fail('calendar access is not available in this run');
    let token: string;
    try {
      token = await ctx.connectors.googleToken('google_calendar');
    } catch (err) {
      return fail(connMsg(err));
    }

    const url = new URL(EVENTS_URL);
    url.searchParams.set('timeMin', new Date().toISOString());
    url.searchParams.set('maxResults', String(Math.min(Math.max(input.maxResults ?? 10, 1), 50)));
    url.searchParams.set('singleEvents', 'true');
    url.searchParams.set('orderBy', 'startTime');

    let res: Response;
    try {
      res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (err) {
      return fail(`calendar request failed: ${describe(err)}`);
    }
    if (!res.ok) return fail(`Google Calendar API ${res.status}`);
    const json = (await res.json()) as { items?: RawEvent[] };
    const events = (json.items ?? []).map(normalize);
    return {
      ok: true,
      summary: `calendar_read: ${events.length} upcoming event(s)`,
      data: { events },
    };
  },
};

export const calendarWriteTool: ToolDef<CalendarWriteInput> = {
  name: 'calendar_write',
  capability: 'CONw',
  actionTier: 'T1',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Event title/summary.' },
      startIso: { type: 'string', description: 'Start time, ISO 8601 (e.g. 2026-06-10T15:00:00+12:00).' },
      endIso: { type: 'string', description: 'End time, ISO 8601.' },
      description: { type: 'string', description: 'Optional event description.' },
      timeZone: { type: 'string', description: 'IANA time zone (e.g. Pacific/Auckland). Optional.' },
    },
    required: ['title', 'startIso', 'endIso'],
    additionalProperties: false,
  },
  async execute(input: CalendarWriteInput, ctx: ToolExecContext): Promise<ToolObservation> {
    if (!ctx.connectors) return fail('calendar access is not available in this run');
    if (typeof input.title !== 'string' || input.title.trim() === '') return fail('event title is required');
    if (!input.startIso || !input.endIso) return fail('startIso and endIso are required');

    let token: string;
    try {
      token = await ctx.connectors.googleToken('google_calendar');
    } catch (err) {
      return fail(connMsg(err));
    }

    const body = {
      summary: input.title,
      ...(input.description ? { description: input.description } : {}),
      start: { dateTime: input.startIso, ...(input.timeZone ? { timeZone: input.timeZone } : {}) },
      end: { dateTime: input.endIso, ...(input.timeZone ? { timeZone: input.timeZone } : {}) },
    };

    let res: Response;
    try {
      res = await fetch(EVENTS_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (err) {
      return fail(`calendar request failed: ${describe(err)}`);
    }
    if (!res.ok) return fail(`Google Calendar API ${res.status}`);
    const created = normalize((await res.json()) as RawEvent);
    return {
      ok: true,
      summary: `calendar_write: created "${created.summary}"`,
      data: { event: created },
    };
  },
};

function connMsg(err: unknown): string {
  if (err instanceof ConnectorError) return `${err.code}: ${err.message}`;
  return describe(err);
}

function fail(detail: string): ToolObservation {
  return { ok: false, is_error: true, summary: `execution_error: ${detail}` };
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
