// run:prepare — the pre-run step the renderer cannot do itself. Using the stored
// user session, it resolves the user's workspace, creates a ticket AS the user
// (RLS), and makes a fresh on-disk workspace dir for confinement. Returns the
// { workspaceId, ticketId, workspaceRoot } the renderer hands to run:start.
//
// This runs in main (the trusted process) with the keystore session — consistent
// with Decision 7 (the user JWT is the only DB identity; no service-role key).

import { app, ipcMain } from 'electron';
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.ts';
import { loadSecretString } from './keystore.ts';

/** Decode the `sub` (user id) from a JWT without a network round-trip. */
function decodeSub(jwt: string): string {
  const part = jwt.split('.')[1];
  if (!part) throw new Error('malformed session token');
  const payload = JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as { sub?: string };
  if (!payload.sub) throw new Error('session token has no subject');
  return payload.sub;
}

/** Build a Supabase client authenticated AS the user from the stored session. */
function buildUserClient() {
  const raw = loadSecretString('supabase_session');
  if (!raw) throw new Error('Not signed in — sign in first.');
  const { accessToken } = JSON.parse(raw) as { accessToken: string };
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  return { client, uid: decodeSub(accessToken) };
}

export interface RunPrepResult {
  workspaceId: string;
  ticketId: string;
  workspaceRoot: string;
}

export function registerRunPrep(): void {
  ipcMain.handle('run:prepare', async (_e, arg: { title: string }): Promise<RunPrepResult> => {
    const { client, uid } = buildUserClient();

    // Resolve the user's workspace (first membership).
    const mem = await client
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', uid)
      .limit(1)
      .single();
    if (mem.error) throw new Error(`workspace lookup failed: ${mem.error.message}`);
    const workspaceId = (mem.data as { workspace_id: string }).workspace_id;

    // Create a ticket AS the user (RLS: created_by = auth.uid() + member).
    const tk = await client
      .from('tickets')
      .insert({ workspace_id: workspaceId, title: arg.title?.slice(0, 200) || 'desktop run', created_by: uid })
      .select('id')
      .single();
    if (tk.error) throw new Error(`ticket create failed: ${tk.error.message}`);
    const ticketId = (tk.data as { id: string }).id;

    // Fresh confinement workspace on disk, keyed by ticket.
    const workspaceRoot = join(app.getPath('userData'), 'workspaces', ticketId);
    await mkdir(workspaceRoot, { recursive: true });

    return { workspaceId, ticketId, workspaceRoot };
  });
}
