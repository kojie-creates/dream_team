// LIVE integration proof (slice "prove it runs"). SKIPPED by default — runs only
// when DREAM_LIVE=1 and credentials are in the environment. It exercises the REAL
// production path end to end against the live Supabase project and the real
// Anthropic API:
//
//   signInWithPassword (real user) → createUserSessionClient (the adapter's path)
//   → create a ticket AS the user (RLS) → startRun with anthropicModelClient(real key)
//   → the governed loop drives a real model to call write_file → assert the file
//   landed on disk AND a tool.executed trace row persisted under RLS, readable back
//   by the same user.
//
// This is the first time the loop touches a real model + a real RLS write — every
// prior test used tapes/fakes. It proves the two unproven assumptions (live model
// loop, live user-session RLS persistence) at the cost of one CLI run.
//
// Run (PowerShell), from runtime/:
//   $env:DREAM_LIVE='1'
//   $env:ANTHROPIC_API_KEY='sk-ant-...'
//   $env:SUPABASE_URL='https://xmxozhibakbzsucvtucv.supabase.co'
//   $env:SUPABASE_ANON_KEY='<anon or sb_publishable_ key>'
//   # AUTH — either email/password (if password auth is enabled):
//   $env:TEST_EMAIL='you@example.com'      # a real Supabase user who is a workspace member
//   $env:TEST_PASSWORD='...'
//   # ...OR paste a pre-obtained session (works regardless of auth method; e.g. from
//   #    the web app's localStorage or `supabase` CLI): SUPABASE_ACCESS_TOKEN wins.
//   $env:SUPABASE_ACCESS_TOKEN='eyJ...'    # user JWT
//   $env:SUPABASE_REFRESH_TOKEN='...'      # optional
//   # optional: $env:WORKSPACE_ID='<uuid>' (else the user's first membership is used)
//   pnpm test test/integration/live-run.test.ts
//
// NOTE: a successful run leaves a real ticket + trace_events rows in the DB. Both
// tables are append-only for members under RLS (no client delete policy), so this
// evidence persists by design — it IS the proof the write happened as the user.

import { describe, it, expect } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { startRun } from '../../src/index.ts';
import { createUserSessionClient } from '../../src/db/client.ts';
import { anthropicModelClient } from '../../src/model/client.ts';
import { writeFileTool } from '../../src/tools/write-file.ts';
import { roleGrant } from '../../src/gate/grants.ts';
import type { ApprovalSet } from '../../src/gate/types.ts';
import type { FailurePacket, FailurePacketEmitter } from '../../src/packets/failure.ts';

const LIVE = process.env.DREAM_LIVE === '1';

/** Env-or-throw: a missing credential under DREAM_LIVE=1 is a setup error, not a skip. */
function reqEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`live-run: missing required env ${name}`);
  return v;
}

const NO_APPROVALS: ApprovalSet = { standing: new Set(), perAction: new Set() };

// A failure emitter that surfaces a halt packet loudly (the run should NOT halt).
const consoleFailureEmitter: FailurePacketEmitter = {
  emit(packet: FailurePacket) {
    // eslint-disable-next-line no-console
    console.error('live-run FAILURE PACKET:', JSON.stringify(packet, null, 2));
  },
};

(LIVE ? describe : describe.skip)('LIVE integration — real model + real RLS write', () => {
  it(
    'runs a real brief end to end and persists a tool.executed trace row under RLS',
    async () => {
      const url = reqEnv('SUPABASE_URL');
      const anonKey = reqEnv('SUPABASE_ANON_KEY');
      const apiKey = reqEnv('ANTHROPIC_API_KEY');

      // 1 — obtain a real user session: a pasted access token wins; else email/password.
      let accessToken: string;
      let refreshToken: string;
      let uid: string;
      // untyped schema → supabase-js builder generics resolve to `never`; `any` here
      // keeps the test readable (runtime behavior is unchanged).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let authClient: any;
      if (process.env.SUPABASE_ACCESS_TOKEN) {
        accessToken = reqEnv('SUPABASE_ACCESS_TOKEN');
        refreshToken = process.env.SUPABASE_REFRESH_TOKEN ?? '';
        // Run table ops AS the user via the bearer header — no GoTrue session / refresh
        // token needed (a copied access token rarely comes with a refresh token).
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

      // 3 — create a ticket AS the user (RLS: created_by = auth.uid() + member).
      const { data: ticket, error: ticketErr } = await authClient
        .from('tickets')
        .insert({ workspace_id: workspaceId, title: 'live-run proof', created_by: uid })
        .select('id')
        .single();
      expect(ticketErr, `ticket insert failed (RLS?): ${ticketErr?.message}`).toBeNull();
      const ticketId = (ticket as { id: string }).id;

      // 4 — the runtime's user-session client (the adapter's production path).
      const supabase = await createUserSessionClient(
        { url, anonKey },
        { accessToken, refreshToken },
      );

      // 5 — a real temp workspace on disk for confinement.
      const root = await mkdtemp(join(tmpdir(), 'dream-live-'));
      const grant = roleGrant('code-developer');
      if (!grant) throw new Error('code-developer grant missing');

      try {
        // 6 — run a real brief: the model must call write_file, then stop.
        const result = await startRun(
          {
            workspaceId: workspaceId!,
            ticketId,
            role: 'code-developer',
            grant,
            approvals: NO_APPROVALS,
            system:
              'You are the code-developer specialist. Use the write_file tool to create the ' +
              'requested file inside the workspace, then stop. Do not ask questions.',
            messages: [
              {
                role: 'user',
                content:
                  'Create a file at out/hello.txt containing exactly this line:\n' +
                  'hello from dream_team\n',
              },
            ],
            maxTokens: 1024,
            workspaceRoot: root,
          },
          {
            supabase,
            modelClient: anthropicModelClient(apiKey),
            tools: [writeFileTool],
            failureEmitter: consoleFailureEmitter,
          },
        );

        // 7 — the loop ended cleanly (no halt).
        expect(result.state).toBe('done');

        // 8 — the file actually landed in-workspace.
        const written = await readFile(join(root, 'out', 'hello.txt'), 'utf8');
        expect(written).toContain('hello from dream_team');

        // 9 — at least one tool.executed trace row persisted, READABLE BACK under the
        //     user's RLS member-select policy, with the run's ticket + permit decision.
        const { data: rows, error: traceErr } = await authClient
          .from('trace_events')
          .select('seq, event_type, payload')
          .eq('ticket_id', ticketId)
          .order('seq', { ascending: true });
        expect(traceErr, `trace read failed: ${traceErr?.message}`).toBeNull();
        const toolRows = (rows ?? []).filter(
          (r: { event_type: string }) => r.event_type === 'tool.executed',
        );
        expect(toolRows.length).toBeGreaterThanOrEqual(1);
        const payload = (toolRows[0] as { payload: Record<string, unknown> }).payload;
        expect(payload.capability).toBe('W');
        expect(payload.gate_decision).toBe('permit');

        // 10 — the written file is recorded as an artifacts row via append_artifact,
        //      readable back under the user's RLS (slice-2 persistence).
        const { data: arts, error: artErr } = await authClient
          .from('artifacts')
          .select('kind, bytes')
          .eq('ticket_id', ticketId);
        expect(artErr, `artifact read failed: ${artErr?.message}`).toBeNull();
        expect((arts ?? []).length).toBeGreaterThanOrEqual(1);
        expect((arts![0] as { kind: string }).kind).toBe('file');
        expect((arts![0] as { bytes: number }).bytes).toBeGreaterThan(0);

        // eslint-disable-next-line no-console
        console.log(
          `live-run OK: state=${result.state} cost=$${result.cost.costUsd.toFixed(4)} ` +
            `iterations=${result.iterations} trace_rows=${(rows ?? []).length} ticket=${ticketId}`,
        );
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
    120_000,
  );
});
