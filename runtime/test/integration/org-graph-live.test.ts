// LIVE org-graph proof (the capstone). SKIPPED unless DREAM_LIVE=1 + credentials.
//
// Every prior org-graph test drove spawns with a tape. This drives a REAL Anthropic
// model through the full chain: central-orchestrator → (spawns) a coordinator →
// (spawns) a specialist → the leaf calls write_file. It proves the governed runtime
// self-dispatches for real — the model chooses to delegate via the spawn tool, the
// Option A delegation confers the child role's grant, and a code-developer two
// levels down actually writes a file, all under one RLS-persisted trace.
//
// Run (PowerShell), from runtime/ — same env as live-run.test.ts:
//   $env:DREAM_LIVE='1'
//   $env:ANTHROPIC_API_KEY='sk-ant-...'
//   $env:SUPABASE_URL='https://<proj>.supabase.co'
//   $env:SUPABASE_ANON_KEY='<anon or sb_publishable_ key>'
//   $env:SUPABASE_ACCESS_TOKEN='eyJ...'        # a real member's user JWT
//   # (or TEST_EMAIL/TEST_PASSWORD if password auth is enabled)
//   # optional: $env:WORKSPACE_ID='<uuid>'
//   pnpm test test/integration/org-graph-live.test.ts
//
// A successful run leaves a real ticket + trace_events + artifacts rows (append-only
// under RLS) — that persistence IS the proof the chain executed as the user.

import { describe, it, expect } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
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
  if (!v) throw new Error(`org-graph-live: missing required env ${name}`);
  return v;
}

const NO_APPROVALS: ApprovalSet = { standing: new Set(), perAction: new Set() };

const consoleFailureEmitter: FailurePacketEmitter = {
  emit(packet: FailurePacket) {
    // eslint-disable-next-line no-console
    console.error('org-graph-live FAILURE PACKET:', JSON.stringify(packet, null, 2));
  },
};

(LIVE ? describe : describe.skip)('LIVE org graph — real model self-dispatches the chain', () => {
  it(
    'orchestrator → coordinator → specialist writes a file for real, under one RLS trace',
    async () => {
      const url = reqEnv('SUPABASE_URL');
      const anonKey = reqEnv('SUPABASE_ANON_KEY');
      const apiKey = reqEnv('ANTHROPIC_API_KEY');

      // 1 — real user session (pasted access token wins; else email/password).
      let accessToken: string;
      let refreshToken: string;
      let uid: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let authClient: any;
      if (process.env.SUPABASE_ACCESS_TOKEN) {
        accessToken = reqEnv('SUPABASE_ACCESS_TOKEN');
        refreshToken = process.env.SUPABASE_REFRESH_TOKEN ?? '';
        authClient = createClient(url, anonKey, {
          auth: { persistSession: false, autoRefreshToken: false },
          global: { headers: { Authorization: `Bearer ${accessToken}` } },
        });
        if (process.env.TEST_USER_ID) {
          uid = reqEnv('TEST_USER_ID');
        } else {
          const { data: u, error } = await authClient.auth.getUser(accessToken);
          expect(error, `getUser failed: ${error?.message}`).toBeNull();
          uid = u.user!.id;
        }
      } else {
        authClient = createClient(url, anonKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const email = reqEnv('TEST_EMAIL');
        const password = reqEnv('TEST_PASSWORD');
        const { data: signIn, error: signInErr } =
          await authClient.auth.signInWithPassword({ email, password });
        expect(signInErr, `sign-in failed: ${signInErr?.message}`).toBeNull();
        accessToken = signIn.session!.access_token;
        refreshToken = signIn.session!.refresh_token;
        uid = signIn.user!.id;
      }
      expect(accessToken).toBeTruthy();

      // 2 — resolve a workspace the user belongs to.
      let workspaceId = process.env.WORKSPACE_ID;
      if (!workspaceId) {
        const { data: mem, error } = await authClient
          .from('workspace_members')
          .select('workspace_id')
          .eq('user_id', uid)
          .limit(1)
          .single();
        expect(error, `membership lookup failed: ${error?.message}`).toBeNull();
        workspaceId = (mem as { workspace_id: string }).workspace_id;
      }

      // 3 — create a ticket AS the user (RLS).
      const { data: ticket, error: ticketErr } = await authClient
        .from('tickets')
        .insert({ workspace_id: workspaceId, title: 'org-graph-live proof', created_by: uid })
        .select('id')
        .single();
      expect(ticketErr, `ticket insert failed (RLS?): ${ticketErr?.message}`).toBeNull();
      const ticketId = (ticket as { id: string }).id;

      // 4 — the runtime's user-session client.
      const supabase = await createUserSessionClient(
        { url, anonKey },
        { accessToken, refreshToken },
      );

      // 5 — temp workspace for confinement.
      const root = await mkdtemp(join(tmpdir(), 'dream-orglive-'));
      const grant = roleGrant('central-orchestrator');
      if (!grant) throw new Error('central-orchestrator grant missing');

      const brief =
        'Build a small text file as a deliverable. Create the file out/hello.txt ' +
        'containing exactly this single line:\nhello from the org graph\n';

      try {
        // 6 — start at the ORCHESTRATOR with only route+plan tools. The model must
        //     spawn down the chart to a specialist that holds write_file.
        const result = await startRun(
          {
            workspaceId: workspaceId!,
            ticketId,
            role: 'central-orchestrator',
            grant,
            approvals: NO_APPROVALS,
            system: systemForRole('central-orchestrator', brief),
            messages: [{ role: 'user', content: brief }],
            maxTokens: 1024,
            workspaceRoot: root,
          },
          {
            supabase,
            modelClient: anthropicModelClient(apiKey),
            tools: toolsForRole('central-orchestrator'),
            failureEmitter: consoleFailureEmitter,
          },
        );

        // 7 — the chain ended cleanly.
        expect(result.state).toBe('done');

        // 8 — the LEAF specialist actually wrote the file, two levels down.
        const written = await readFile(join(root, 'out', 'hello.txt'), 'utf8');
        expect(written).toContain('hello from the org graph');

        // 9 — the whole chain shares one RLS-persisted trace. Read it back under the
        //     user's policy: at least one spawn and one write_file, both PERMITTED.
        const { data: rows, error: traceErr } = await authClient
          .from('trace_events')
          .select('seq, event_type, payload')
          .eq('ticket_id', ticketId)
          .order('seq', { ascending: true });
        expect(traceErr, `trace read failed: ${traceErr?.message}`).toBeNull();
        const executed = (rows ?? []).filter(
          (r: { event_type: string }) => r.event_type === 'tool.executed',
        ) as Array<{ payload: Record<string, unknown> }>;

        const spawns = executed.filter((r) => r.payload.tool_name === 'spawn');
        const writes = executed.filter((r) => r.payload.tool_name === 'write_file');
        expect(spawns.length, 'expected at least one spawn in the chain').toBeGreaterThanOrEqual(1);
        expect(writes.length, 'expected the leaf to write a file').toBeGreaterThanOrEqual(1);
        expect(spawns.every((r) => r.payload.gate_decision === 'permit')).toBe(true);
        expect(writes[0]!.payload.capability).toBe('W');
        expect(writes[0]!.payload.gate_decision).toBe('permit');

        // 10 — the leaf write is recorded as an artifacts row (readable under RLS).
        const { data: arts, error: artErr } = await authClient
          .from('artifacts')
          .select('id, kind')
          .eq('ticket_id', ticketId);
        expect(artErr, `artifact read failed: ${artErr?.message}`).toBeNull();
        expect((arts ?? []).length).toBeGreaterThanOrEqual(1);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
    120_000,
  );
});
