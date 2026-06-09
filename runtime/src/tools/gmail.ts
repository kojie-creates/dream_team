// gmail_send — the COMM-capability tool: send an email as the connected user via
// the Gmail API. COMM ("send external messages") is held only by community-manager
// in §4, so an "email me X" task routes orchestrator → distribution-coordinator →
// community-manager → gmail_send. T1: requires standing grant + per-action approval.
//
// Resolves the user's gmail token via ctx.connectors (connectors/google.ts). Fails
// closed (execution_error, nothing sent) when connectors are absent or gmail is not
// connected. Prerequisite: the gmail connector must hold the `gmail.send` OAuth scope.
//
// Decoupling: no electron, no app imports.

import type { ToolDef, ToolExecContext, ToolObservation } from './types.ts';
import { ConnectorError } from '../connectors/google.ts';

const GMAIL_SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';

export interface GmailSendInput {
  to: string;
  subject: string;
  body: string;
}

export const gmailSendTool: ToolDef<GmailSendInput> = {
  name: 'gmail_send',
  capability: 'COMM',
  actionTier: 'T1',
  inputSchema: {
    type: 'object',
    properties: {
      to: { type: 'string', description: 'Recipient email address.' },
      subject: { type: 'string', description: 'Email subject line.' },
      body: { type: 'string', description: 'Plain-text email body.' },
    },
    required: ['to', 'subject', 'body'],
    additionalProperties: false,
  },
  async execute(input: GmailSendInput, ctx: ToolExecContext): Promise<ToolObservation> {
    if (!ctx.connectors) return fail('email access is not available in this run');
    if (!input.to || !input.to.includes('@')) return fail('a valid recipient (to) is required');
    if (typeof input.subject !== 'string' || typeof input.body !== 'string') {
      return fail('subject and body are required');
    }

    let token: string;
    try {
      token = await ctx.connectors.googleToken('gmail');
    } catch (err) {
      return fail(connMsg(err));
    }

    const raw = encodeMessage(input);
    let res: Response;
    try {
      res = await fetch(GMAIL_SEND_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw }),
      });
    } catch (err) {
      return fail(`gmail request failed: ${describe(err)}`);
    }
    if (!res.ok) return fail(`Gmail API ${res.status}`);
    const json = (await res.json()) as { id?: string };
    return {
      ok: true,
      summary: `gmail_send: sent to ${input.to}`,
      data: { messageId: json.id ?? null, to: input.to },
    };
  },
};

/** Build a base64url-encoded RFC 2822 message (Gmail `raw` field). */
function encodeMessage(input: GmailSendInput): string {
  const headers = [
    `To: ${input.to}`,
    `Subject: ${sanitizeHeader(input.subject)}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'MIME-Version: 1.0',
  ];
  const message = `${headers.join('\r\n')}\r\n\r\n${input.body}`;
  return Buffer.from(message, 'utf8').toString('base64url');
}

/** Strip CR/LF from a header value to prevent header injection. */
function sanitizeHeader(v: string): string {
  return v.replace(/[\r\n]+/g, ' ');
}

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
