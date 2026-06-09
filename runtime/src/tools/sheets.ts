// sheets_read (CONr) — read a range of values from a Google Sheet. Reuses the
// runtime connector token path (ctx.connectors.googleToken('google_sheets')).
// Read-only; requires the sheets connector with a spreadsheets.readonly scope.
// Fails closed when connectors are absent or the connector errors.
//
// Decoupling: no electron, no app imports.

import type { ToolDef, ToolExecContext, ToolObservation } from './types.ts';
import { ConnectorError } from '../connectors/google.ts';

const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

export interface SheetsReadInput {
  spreadsheetId: string;
  range?: string;
}

export const sheetsReadTool: ToolDef<SheetsReadInput> = {
  name: 'sheets_read',
  capability: 'CONr',
  actionTier: 'T2',
  inputSchema: {
    type: 'object',
    properties: {
      spreadsheetId: { type: 'string', description: 'The spreadsheet ID (from its URL).' },
      range: { type: 'string', description: "A1 range, e.g. 'Sheet1!A1:D50'. Default 'A1:Z100'." },
    },
    required: ['spreadsheetId'],
    additionalProperties: false,
  },
  async execute(input: SheetsReadInput, ctx: ToolExecContext): Promise<ToolObservation> {
    if (!ctx.connectors) return fail('sheets access is not available in this run');
    if (!input.spreadsheetId || input.spreadsheetId.trim() === '') return fail('spreadsheetId is required');

    let token: string;
    try {
      token = await ctx.connectors.googleToken('google_sheets');
    } catch (err) {
      return fail(connMsg(err));
    }

    const range = input.range && input.range.trim() ? input.range.trim() : 'A1:Z100';
    const url = `${SHEETS_BASE}/${encodeURIComponent(input.spreadsheetId)}/values/${encodeURIComponent(range)}`;

    let res: Response;
    try {
      res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    } catch (err) {
      return fail(`sheets request failed: ${describe(err)}`);
    }
    if (!res.ok) return fail(`Google Sheets API ${res.status}`);
    const json = (await res.json()) as { values?: string[][]; range?: string };
    const values = json.values ?? [];
    return {
      ok: true,
      summary: `sheets_read: ${values.length} row(s) from ${json.range ?? range}`,
      data: { range: json.range ?? range, values },
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
