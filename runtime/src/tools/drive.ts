// drive_read (CONr) — list/search Google Drive file metadata. Reuses the runtime
// connector token path (ctx.connectors.googleToken('google_drive')). Read-only;
// requires the drive connector with a (metadata.)readonly scope. Fails closed when
// connectors are absent or the connector errors.
//
// Decoupling: no electron, no app imports.

import type { ToolDef, ToolExecContext, ToolObservation } from './types.ts';
import { ConnectorError } from '../connectors/google.ts';

const FILES_URL = 'https://www.googleapis.com/drive/v3/files';

export interface DriveReadInput {
  query?: string;
  maxResults?: number;
}

interface RawFile {
  id?: string;
  name?: string;
  mimeType?: string;
  modifiedTime?: string;
  webViewLink?: string;
}

export const driveReadTool: ToolDef<DriveReadInput> = {
  name: 'drive_read',
  capability: 'CONr',
  actionTier: 'T2',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: "Drive search query (e.g. \"name contains 'report'\"). Optional." },
      maxResults: { type: 'number', description: 'How many files to list (1–50, default 20).' },
    },
    required: [],
    additionalProperties: false,
  },
  async execute(input: DriveReadInput, ctx: ToolExecContext): Promise<ToolObservation> {
    if (!ctx.connectors) return fail('drive access is not available in this run');
    let token: string;
    try {
      token = await ctx.connectors.googleToken('google_drive');
    } catch (err) {
      return fail(connMsg(err));
    }

    const url = new URL(FILES_URL);
    url.searchParams.set('pageSize', String(Math.min(Math.max(input.maxResults ?? 20, 1), 50)));
    url.searchParams.set('fields', 'files(id,name,mimeType,modifiedTime,webViewLink)');
    url.searchParams.set('orderBy', 'modifiedTime desc');
    if (input.query && input.query.trim()) url.searchParams.set('q', input.query.trim());

    let res: Response;
    try {
      res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
    } catch (err) {
      return fail(`drive request failed: ${describe(err)}`);
    }
    if (!res.ok) return fail(`Google Drive API ${res.status}`);
    const json = (await res.json()) as { files?: RawFile[] };
    const files = (json.files ?? []).map((f) => ({
      id: f.id ?? null,
      name: f.name ?? '(unnamed)',
      mimeType: f.mimeType ?? null,
      modifiedTime: f.modifiedTime ?? null,
      link: f.webViewLink ?? null,
    }));
    return { ok: true, summary: `drive_read: ${files.length} file(s)`, data: { files } };
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
