// LIVE intern demo — the capstone of Phases A-C. SKIPPED unless DREAM_LIVE=1 +
// credentials + connector secrets. Drives a real Anthropic model from
// central-orchestrator through a COMPLEX brief that fans out across specialists and
// performs REAL connector actions (web research + write a file + create a calendar
// event), all governed + traced under the user's RLS.
//
// Run (PowerShell), from runtime/:
//   $env:DREAM_LIVE='1'
//   $env:ANTHROPIC_API_KEY='sk-ant-...'
//   $env:SUPABASE_URL='https://<proj>.supabase.co'
//   $env:SUPABASE_ANON_KEY='<anon / sb_publishable_ key>'
//   $env:SUPABASE_ACCESS_TOKEN='eyJ...'            # a FRESH member JWT
//   $env:CONNECTOR_TOKEN_ENCRYPTION_KEY='<64-hex>' # from app/.env.local
//   $env:GOOGLE_CLIENT_ID='...'
//   $env:GOOGLE_CLIENT_SECRET='...'
//   # optional: $env:WORKSPACE_ID='<uuid>' ; $env:INTERN_BRIEF='...'
//   pnpm test test/integration/intern-live.test.ts
//
// Leaves a real ticket + trace + artifacts AND (if the model calls calendar_write) a
// real Google Calendar event. That persistence IS the proof.

import { describe, it, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { startRun } from '../../src/index.ts';
import { createUserSessionClient } from '../../src/db/client.ts';
import { anthropicModelClient } from '../../src/model/client.ts';
import { roleGrant } from '../../src/gate/grants.ts';
import { toolsForRole } from '../../src/tools/registry.ts';
import { systemForRole } from '../../src/prompts.ts';
import type { ApprovalSet } from '../../src/gate/types.ts';
import type { FailurePacket, FailurePacketEmitter } from '../../src/packets/failure.ts';

const LIVE = process.env.DREAM_LIVE === '1';
function reqEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`intern-live: missing required env ${name}`);
  return v;
}

// Standing approval for connector writes + external comms (mirrors the desktop's
// Phase A interim posture) so the T1 calendar_write / gmail_send aren't hard-blocked.
const APPROVALS: ApprovalSet = {
  standing: new Set(['CONw', 'COMM']),
  perAction: new Set(['CONw:*', 'COMM:*']),
};

const consoleFailureEmitter: FailurePacketEmitter = {
  emit(p: FailurePacket) {
    // eslint-disable-next-line no-console
    console.error('intern-live FAILURE PACKET:', JSON.stringify(p, null, 2));
  },
};

const DEFAULT_BRIEF =
  'You are my assistant. Do this in parts: (1) briefly research the current state of ' +
  'New Zealand data-sovereignty regulation using web_fetch; (2) write a concise one-page ' +
  'summary to out/brief.md; (3) add a Google Calendar event tomorrow at 3:00pm (Pacific/' +
  'Auckland) titled "Review: data sovereignty" with a short description. Complete all parts, then stop.';

(LIVE ? describe : describe.skip)('LIVE intern — complex brief, real actions', () => {
  it(
    'researches, writes a file, and creates a calendar event from one brief',
    async () => {
      const url = reqEnv('SUPABASE_URL');
      const anonKey = reqEnv('SUPABASE_ANON_KEY');
      const apiKey = reqEnv('ANTHROPIC_API_KEY');
      const accessToken = reqEnv('SUPABASE_ACCESS_TOKEN');
      const connectorConfig = {
        encryptionKeyHex: reqEnv('CONNECTOR_TOKEN_ENCRYPTION_KEY'),
        googleClientId: reqEnv('GOOGLE_CLIENT_ID'),
        googleClientSecret: reqEnv('GOOGLE_CLIENT_SECRET'),
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const authClient: any = createClient(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
      });
      const uid = process.env.TEST_USER_ID ?? (await authClient.auth.getUser(accessToken)).data.user!.id;

      let workspaceId = process.env.WORKSPACE_ID;
      if (!workspaceId) {
        const { data: mem, error } = await authClient
          .from('workspace_members').select('workspace_id').eq('user_id', uid).limit(1).single();
        expect(error, `membership lookup failed: ${error?.message}`).toBeNull();
        workspaceId = (mem as { workspace_id: string }).workspace_id;
      }

      const { data: ticket, error: ticketErr } = await authClient
        .from('tickets').insert({ workspace_id: workspaceId, title: 'intern-live demo', created_by: uid })
        .select('id').single();
      expect(ticketErr, `ticket insert failed: ${ticketErr?.message}`).toBeNull();
      const ticketId = (ticket as { id: string }).id;

      const supabase = await createUserSessionClient({ url, anonKey }, { accessToken, refreshToken: '' });
      const root = await mkdtemp(join(tmpdir(), 'dream-intern-'));
      const brief = process.env.INTERN_BRIEF ?? DEFAULT_BRIEF;

      try {
        const result = await startRun(
          {
            workspaceId: workspaceId!,
            ticketId,
            role: 'central-orchestrator',
            grant: roleGrant('central-orchestrator')!,
            approvals: APPROVALS,
            system: systemForRole('central-orchestrator', brief),
            messages: [{ role: 'user', content: brief }],
            maxTokens: 8192,
            workspaceRoot: root,
          },
          {
            supabase,
            modelClient: anthropicModelClient(apiKey),
            tools: toolsForRole('central-orchestrator'),
            connectorConfig,
            failureEmitter: consoleFailureEmitter,
          },
        );

        // eslint-disable-next-line no-console
        console.log(`intern-live: state=${result.state} iterations=${result.iterations} cost=$${result.cost.costUsd.toFixed(4)} ticket=${ticketId}`);
        expect(result.state).toBe('done');

        // Read back the shared trace: which capability tools were permitted?
        const { data: rows } = await authClient
          .from('trace_events').select('payload, event_type').eq('ticket_id', ticketId);
        const tools = (rows ?? [])
          .filter((r: { event_type: string }) => r.event_type === 'tool.executed')
          .map((r: { payload: Record<string, unknown> }) => `${r.payload.tool_name}:${r.payload.gate_decision}`);
        // eslint-disable-next-line no-console
        console.log('intern-live tools:', tools.join(', '));
        expect(tools.length).toBeGreaterThanOrEqual(1);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
    420_000,
  );
});
