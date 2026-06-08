// db/client.ts — the runtime's Supabase access, built from the logged-in USER
// session (ADR-001 Decision 7). NO service-role key ever lives here: the runtime's
// only DB identity is the user's JWT, so every read/write/RPC runs under the
// existing auth.uid() RLS. Privileged appends go through SECURITY DEFINER RPCs
// (append_trace_event, migration 0008), never an elevated credential.
//
// Decoupling (ADR §4): no `electron`. `@supabase/supabase-js` is imported lazily
// and the `createClient` factory is injectable, so unit tests pass a fake client
// and never touch the network or the real SDK.

import type {
  AppendTraceEventParams,
  AppendTraceEventResult,
  AppendTraceEventRpc,
} from '../trace/rpc-sink.ts';
import type { AppendArtifactParams, AppendArtifactRpc } from '../artifacts/rpc-sink.ts';
import type { AppendPacketParams, AppendPacketRpc } from '../packets/rpc-sink.ts';

/** Project endpoint + PUBLISHABLE (anon) key. The service-role key is NEVER here. */
export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

/** The logged-in user's Supabase session (persisted via safeStorage; Decision 7 §1). */
export interface UserSession {
  accessToken: string;
  refreshToken: string;
}

/**
 * The minimal Supabase surface the runtime uses: just `rpc`. Both the real
 * supabase-js client and a test fake satisfy this, so nothing downstream depends
 * on the concrete SDK type.
 */
export interface SupabaseRpcClient {
  rpc(
    fn: string,
    params: Record<string, unknown>,
  ): Promise<{ data: unknown; error: { message: string } | null }>;
}

/** Injectable `createClient` (default = `@supabase/supabase-js`). */
export type CreateClientFn = (
  url: string,
  key: string,
  options: unknown,
) => SupabaseRpcClient;

/**
 * Build a Supabase client authenticated AS the user (Decision 7 §1-2). The user
 * JWT is sent as the Authorization bearer on every request, so PostgREST resolves
 * `auth.uid()` to the user and RLS scopes all rows — with only the anon (publishable)
 * key as the apikey. autoRefresh/persist are off: main owns the session lifecycle.
 */
export async function createUserSessionClient(
  config: SupabaseConfig,
  session: UserSession,
  deps?: { createClient?: CreateClientFn },
): Promise<SupabaseRpcClient> {
  const createClient =
    deps?.createClient ??
    ((await import('@supabase/supabase-js')).createClient as unknown as CreateClientFn);

  return createClient(config.url, config.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${session.accessToken}` } },
  });
}

/**
 * Wrap a user-session client into the `AppendTraceEventRpc` the RpcTraceSink needs
 * (Decision 6). Calls the `append_trace_event` SECURITY DEFINER RPC and maps the
 * `returns table (id bigint, seq bigint)` row. A Postgres error (e.g. the RPC's
 * own auth.uid()/membership guard firing) becomes a thrown error — surfaced by the
 * sink's `flush()` per the no-silent-drop rule.
 */
export function appendTraceEventRpc(client: SupabaseRpcClient): AppendTraceEventRpc {
  return async (params: AppendTraceEventParams): Promise<AppendTraceEventResult> => {
    const { data, error } = await client.rpc(
      'append_trace_event',
      params as unknown as Record<string, unknown>,
    );
    if (error) {
      throw new Error(`append_trace_event RPC failed: ${error.message}`);
    }
    const row = (Array.isArray(data) ? data[0] : data) as
      | { id?: unknown; seq?: unknown }
      | undefined;
    if (!row || typeof row.id !== 'number' || typeof row.seq !== 'number') {
      throw new Error('append_trace_event returned no { id, seq } row');
    }
    return { id: row.id, seq: row.seq };
  };
}

/**
 * Wrap a user-session client into the `AppendArtifactRpc` the RpcArtifactSink needs
 * (migration 0011). Calls `append_artifact` (which returns the inserted uuid) AS the
 * user; the RPC's own auth/member/ticket guards apply. A Postgres error throws.
 */
export function appendArtifactRpc(client: SupabaseRpcClient): AppendArtifactRpc {
  return async (params: AppendArtifactParams): Promise<string> => {
    const { data, error } = await client.rpc(
      'append_artifact',
      params as unknown as Record<string, unknown>,
    );
    if (error) {
      throw new Error(`append_artifact RPC failed: ${error.message}`);
    }
    const id = Array.isArray(data) ? data[0] : data;
    if (typeof id !== 'string') {
      throw new Error('append_artifact returned no uuid');
    }
    return id;
  };
}

/**
 * Wrap a user-session client into the `AppendPacketRpc` the RpcFailureSink needs
 * (migration 0011). Calls `append_packet` (returns the inserted uuid) AS the user.
 */
export function appendPacketRpc(client: SupabaseRpcClient): AppendPacketRpc {
  return async (params: AppendPacketParams): Promise<string> => {
    const { data, error } = await client.rpc(
      'append_packet',
      params as unknown as Record<string, unknown>,
    );
    if (error) {
      throw new Error(`append_packet RPC failed: ${error.message}`);
    }
    const id = Array.isArray(data) ? data[0] : data;
    if (typeof id !== 'string') {
      throw new Error('append_packet returned no uuid');
    }
    return id;
  };
}

/**
 * Is the authenticated user a member of `workspaceId`? Calls the `is_workspace_member`
 * helper (migration 0002) AS the user, so the answer is the server's RLS truth, not a
 * client-side guess. Used as the pre-dispatch gate in `startRun` (Decision 7 §2): a
 * non-member never reaches the loop, and even if it did, `append_trace_event`'s own
 * guard rejects the write.
 */
export async function isWorkspaceMember(
  client: SupabaseRpcClient,
  workspaceId: string,
): Promise<boolean> {
  const { data, error } = await client.rpc('is_workspace_member', {
    p_workspace_id: workspaceId,
  });
  if (error) {
    throw new Error(`is_workspace_member RPC failed: ${error.message}`);
  }
  return data === true;
}
