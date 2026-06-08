// LIVE storage round-trip (migration 0012). SKIPPED unless DREAM_LIVE=1 with a
// real user session in the env. Unlike live-run.test.ts this uses a TAPE model
// (no Anthropic key/cost) — the point is the STORAGE path, not the LLM: a real
// startRun writes a file, the sink uploads the bytes to the private `artifacts`
// bucket AS the user, stamps storage_path, and we download the object back and
// assert the bytes match.
//
// Run (PowerShell), from runtime/ — with a real user JWT:
//   $env:DREAM_LIVE='1'
//   $env:SUPABASE_URL='https://xmxozhibakbzsucvtucv.supabase.co'
//   $env:SUPABASE_ANON_KEY='<anon/publishable>'
//   $env:SUPABASE_ACCESS_TOKEN='<user jwt>'   $env:TEST_USER_ID='<uid>'
//   pnpm exec vitest run test/integration/storage-live.test.ts
//
// Leaves a ticket + artifacts row + one Storage object (append-only under RLS) —
// that persistence IS the proof.

import { describe, it, expect } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { startRun } from '../../src/index.ts';
import { createUserSessionClient } from '../../src/db/client.ts';
import { writeFileTool } from '../../src/tools/write-file.ts';
import { roleGrant } from '../../src/gate/grants.ts';
import type { ApprovalSet } from '../../src/gate/types.ts';
import { tapeModelClient, toolUseTurn, endTurn } from '../harness/tape.ts';

const LIVE = process.env.DREAM_LIVE === '1';
const NO_APPROVALS: ApprovalSet = { standing: new Set(), perAction: new Set() };

function reqEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`storage-live: missing required env ${name}`);
  return v;
}

(LIVE ? describe : describe.skip)('LIVE storage round-trip — bytes uploaded + storage_path stamped', () => {
  it(
    'a real run uploads the file bytes to the artifacts bucket and stamps storage_path',
    async () => {
      const url = reqEnv('SUPABASE_URL');
      const anonKey = reqEnv('SUPABASE_ANON_KEY');
      const accessToken = reqEnv('SUPABASE_ACCESS_TOKEN');
      const refreshToken = process.env.SUPABASE_REFRESH_TOKEN ?? '';

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const authClient: any = createClient(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
      });
      const uid = process.env.TEST_USER_ID ?? (await authClient.auth.getUser(accessToken)).data.user!.id;

      // workspace the user belongs to
      let workspaceId = process.env.WORKSPACE_ID;
      if (!workspaceId) {
        const { data: mem, error } = await authClient
          .from('workspace_members').select('workspace_id').eq('user_id', uid).limit(1).single();
        expect(error, `membership lookup failed: ${error?.message}`).toBeNull();
        workspaceId = (mem as { workspace_id: string }).workspace_id;
      }

      // ticket AS the user
      const { data: ticket, error: ticketErr } = await authClient
        .from('tickets')
        .insert({ workspace_id: workspaceId, title: 'storage-live proof', created_by: uid })
        .select('id').single();
      expect(ticketErr, `ticket insert failed: ${ticketErr?.message}`).toBeNull();
      const ticketId = (ticket as { id: string }).id;

      const supabase = await createUserSessionClient({ url, anonKey }, { accessToken, refreshToken });
      const grant = roleGrant('code-developer')!;
      const content = `hello storage ${Date.now()}\n`;

      const root = await mkdtemp(join(tmpdir(), 'dream-storage-'));
      try {
        // Tape: one write_file tool call, then end. No real model.
        const model = tapeModelClient([
          toolUseTurn([{ id: 't1', name: 'write_file', input: { path: 'out/hello-storage.txt', content } }]),
          endTurn(),
        ]);

        const result = await startRun(
          {
            workspaceId: workspaceId!, ticketId, role: 'code-developer', grant,
            approvals: NO_APPROVALS, system: 'tape', messages: [{ role: 'user', content: 'write it' }],
            maxTokens: 256, workspaceRoot: root,
          },
          { supabase, modelClient: model, tools: [writeFileTool] },
        );

        expect(result.state).toBe('done');
        expect(await readFile(join(root, 'out', 'hello-storage.txt'), 'utf8')).toBe(content);

        // The artifacts row now carries a NON-NULL storage_path.
        const { data: arts, error: artErr } = await authClient
          .from('artifacts').select('id, storage_path, bytes').eq('ticket_id', ticketId);
        expect(artErr, `artifact read failed: ${artErr?.message}`).toBeNull();
        expect((arts ?? []).length).toBeGreaterThanOrEqual(1);
        const art = arts![0] as { storage_path: string | null; bytes: number };
        expect(art.storage_path, 'storage_path should be set after upload').toBeTruthy();
        expect(art.bytes).toBe(Buffer.byteLength(content, 'utf8'));

        // Download the object back from the private bucket and assert the bytes.
        const { data: blob, error: dlErr } = await authClient
          .storage.from('artifacts').download(art.storage_path!);
        expect(dlErr, `download failed: ${dlErr?.message}`).toBeNull();
        const got = Buffer.from(await blob!.arrayBuffer()).toString('utf8');
        expect(got).toBe(content);

        // eslint-disable-next-line no-console
        console.log(`storage-live OK: path=${art.storage_path} bytes=${art.bytes} ticket=${ticketId}`);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
    120_000,
  );
});
