// drive_read + sheets_read (CONr) — reuse the connector token path. Happy paths use
// a fake googleToken + stubbed fetch; both fail closed without connectors.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { driveReadTool } from '../../src/tools/drive.ts';
import { sheetsReadTool } from '../../src/tools/sheets.ts';
import { ConnectorError } from '../../src/connectors/google.ts';
import type { ToolExecContext } from '../../src/tools/types.ts';

const boundary = { workspaceRoot: '/ws', readAllowlist: [] };
afterEach(() => vi.unstubAllGlobals());

function ctxWith(googleToken: () => Promise<string>): ToolExecContext {
  return { boundary, connectors: { googleToken } } as ToolExecContext;
}
const noConnectors = { boundary } as ToolExecContext;

function json(status: number, obj: unknown) {
  return { status, ok: status >= 200 && status < 300, json: async () => obj };
}

describe('drive_read', () => {
  it('is CONr / T2', () => {
    expect(driveReadTool.capability).toBe('CONr');
    expect(driveReadTool.actionTier).toBe('T2');
  });

  it('lists file metadata', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      json(200, { files: [{ id: 'f1', name: 'report.pdf', mimeType: 'application/pdf', modifiedTime: 't' }] }),
    ));
    const obs = await driveReadTool.execute({ query: "name contains 'report'" }, ctxWith(async () => 'tok'));
    expect(obs.ok).toBe(true);
    const files = (obs.data as { files: Array<{ id: string; name: string }> }).files;
    expect(files[0]!.id).toBe('f1');
    expect(files[0]!.name).toBe('report.pdf');
  });

  it('refuses without connectors', async () => {
    const obs = await driveReadTool.execute({}, noConnectors);
    expect(obs.ok).toBe(false);
  });

  it('surfaces not_connected', async () => {
    const obs = await driveReadTool.execute({}, ctxWith(async () => {
      throw new ConnectorError('not_connected', 'drive not connected');
    }));
    expect(obs.ok).toBe(false);
    expect(obs.summary).toMatch(/not_connected/);
  });
});

describe('sheets_read', () => {
  it('is CONr / T2', () => {
    expect(sheetsReadTool.capability).toBe('CONr');
    expect(sheetsReadTool.actionTier).toBe('T2');
  });

  it('reads a value range', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      json(200, { range: 'Sheet1!A1:B2', values: [['a', 'b'], ['1', '2']] }),
    ));
    const obs = await sheetsReadTool.execute({ spreadsheetId: 'sid', range: 'Sheet1!A1:B2' }, ctxWith(async () => 'tok'));
    expect(obs.ok).toBe(true);
    const data = obs.data as { values: string[][] };
    expect(data.values).toHaveLength(2);
    expect(data.values[0]).toEqual(['a', 'b']);
  });

  it('requires a spreadsheetId', async () => {
    const obs = await sheetsReadTool.execute({ spreadsheetId: '' }, ctxWith(async () => 'tok'));
    expect(obs.ok).toBe(false);
  });

  it('refuses without connectors', async () => {
    const obs = await sheetsReadTool.execute({ spreadsheetId: 'sid' }, noConnectors);
    expect(obs.ok).toBe(false);
  });
});
