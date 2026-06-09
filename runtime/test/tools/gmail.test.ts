// gmail_send (COMM/T1) — sends via the Gmail API with a base64url RFC2822 message.
// Fail-closed without connectors; surfaces connector errors as execution_error.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { gmailSendTool } from '../../src/tools/gmail.ts';
import { ConnectorError } from '../../src/connectors/google.ts';
import type { ToolExecContext } from '../../src/tools/types.ts';

const boundary = { workspaceRoot: '/ws', readAllowlist: [] };
afterEach(() => vi.unstubAllGlobals());

function ctxWith(googleToken: () => Promise<string>): ToolExecContext {
  return { boundary, connectors: { googleToken } } as ToolExecContext;
}

describe('gmail_send', () => {
  it('is COMM / T1', () => {
    expect(gmailSendTool.capability).toBe('COMM');
    expect(gmailSendTool.actionTier).toBe('T1');
  });

  it('POSTs to messages/send with a base64url message carrying To + Subject', async () => {
    const calls: Array<{ url: string; body: string }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: { body: string }) => {
      calls.push({ url, body: init.body });
      return { status: 200, ok: true, json: async () => ({ id: 'm1' }) };
    }));

    const obs = await gmailSendTool.execute(
      { to: 'kojie@example.com', subject: 'Hello', body: 'hi there' },
      ctxWith(async () => 'tok'),
    );
    expect(obs.ok).toBe(true);
    expect((obs.data as { messageId: string }).messageId).toBe('m1');

    expect(calls[0]!.url).toContain('/gmail/v1/users/me/messages/send');
    const raw = (JSON.parse(calls[0]!.body) as { raw: string }).raw;
    const decoded = Buffer.from(raw, 'base64url').toString('utf8');
    expect(decoded).toContain('To: kojie@example.com');
    expect(decoded).toContain('Subject: Hello');
    expect(decoded).toContain('hi there');
  });

  it('refuses when connectors are absent', async () => {
    const obs = await gmailSendTool.execute(
      { to: 'a@b.com', subject: 's', body: 'b' },
      { boundary } as ToolExecContext,
    );
    expect(obs.ok).toBe(false);
    expect(obs.summary).toMatch(/not available/);
  });

  it('surfaces not_connected as execution_error', async () => {
    const obs = await gmailSendTool.execute(
      { to: 'a@b.com', subject: 's', body: 'b' },
      ctxWith(async () => {
        throw new ConnectorError('not_connected', 'gmail is not connected for this workspace.');
      }),
    );
    expect(obs.ok).toBe(false);
    expect(obs.summary).toMatch(/not_connected/);
  });

  it('rejects a malformed recipient', async () => {
    const obs = await gmailSendTool.execute(
      { to: 'not-an-email', subject: 's', body: 'b' },
      ctxWith(async () => 'tok'),
    );
    expect(obs.ok).toBe(false);
  });
});
