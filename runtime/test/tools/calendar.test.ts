// calendar_read (CONr) + calendar_write (CONw) — token reached via ctx.connectors;
// API via global fetch (stubbed). Fail-closed when connectors are absent or the
// connector errors.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { calendarReadTool, calendarWriteTool } from '../../src/tools/calendar.ts';
import { ConnectorError } from '../../src/connectors/google.ts';
import type { ToolExecContext } from '../../src/tools/types.ts';

const boundary = { workspaceRoot: '/ws', readAllowlist: [] };
afterEach(() => vi.unstubAllGlobals());

function ctxWith(googleToken: () => Promise<string>): ToolExecContext {
  return { boundary, connectors: { googleToken } } as ToolExecContext;
}
const noConnectors = { boundary } as ToolExecContext;

function jsonResponse(status: number, obj: unknown) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => obj,
  };
}

describe('calendar — declarations', () => {
  it('read is CONr/T2, write is CONw/T1', () => {
    expect(calendarReadTool.capability).toBe('CONr');
    expect(calendarReadTool.actionTier).toBe('T2');
    expect(calendarWriteTool.capability).toBe('CONw');
    expect(calendarWriteTool.actionTier).toBe('T1');
  });
});

describe('calendar_read', () => {
  it('lists + normalizes upcoming events', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      jsonResponse(200, {
        items: [
          { id: 'e1', summary: 'Standup', start: { dateTime: '2026-06-10T09:00:00Z' }, end: { dateTime: '2026-06-10T09:15:00Z' }, htmlLink: 'http://x' },
        ],
      }),
    ));
    const obs = await calendarReadTool.execute({}, ctxWith(async () => 'tok'));
    expect(obs.ok).toBe(true);
    const events = (obs.data as { events: Array<{ providerEventId: string; summary: string }> }).events;
    expect(events).toHaveLength(1);
    expect(events[0]!.providerEventId).toBe('e1');
    expect(events[0]!.summary).toBe('Standup');
  });

  it('refuses when connectors are absent', async () => {
    const obs = await calendarReadTool.execute({}, noConnectors);
    expect(obs.ok).toBe(false);
    expect(obs.summary).toMatch(/not available/);
  });

  it('surfaces a connector error (not_connected) as execution_error', async () => {
    const obs = await calendarReadTool.execute({}, ctxWith(async () => {
      throw new ConnectorError('not_connected', 'Google Calendar is not connected');
    }));
    expect(obs.ok).toBe(false);
    expect(obs.summary).toMatch(/not_connected/);
  });
});

describe('calendar_write', () => {
  it('creates an event and returns the normalized result', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      jsonResponse(200, { id: 'new1', summary: 'Intern test', htmlLink: 'http://link' }),
    ));
    const obs = await calendarWriteTool.execute(
      { title: 'Intern test', startIso: '2026-06-10T15:00:00+12:00', endIso: '2026-06-10T15:30:00+12:00' },
      ctxWith(async () => 'tok'),
    );
    expect(obs.ok).toBe(true);
    expect((obs.data as { event: { providerEventId: string } }).event.providerEventId).toBe('new1');
  });

  it('maps a Google 4xx to execution_error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(403, {})));
    const obs = await calendarWriteTool.execute(
      { title: 'x', startIso: 'a', endIso: 'b' },
      ctxWith(async () => 'tok'),
    );
    expect(obs.ok).toBe(false);
    expect(obs.summary).toMatch(/403/);
  });

  it('refuses when connectors are absent', async () => {
    const obs = await calendarWriteTool.execute({ title: 'x', startIso: 'a', endIso: 'b' }, noConnectors);
    expect(obs.ok).toBe(false);
  });
});
