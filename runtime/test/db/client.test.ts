// T6 — db/client.ts: the user-session Supabase access layer (ADR-001 Decision 7).
// Proves: the client is built with the anon key + the user's bearer JWT (never a
// service-role key); append_trace_event maps params/row and surfaces RPC errors;
// is_workspace_member returns the server's boolean. No network — a fake client and a
// fake createClient are injected.

import { describe, it, expect } from 'vitest';
import {
  createUserSessionClient,
  appendTraceEventRpc,
  appendArtifactRpc,
  appendPacketRpc,
  setArtifactStoragePathRpc,
  supabaseArtifactStorage,
  isWorkspaceMember,
  getConnectorTokenRpc,
} from '../../src/db/client.ts';
import type { CreateClientFn, SupabaseRpcClient } from '../../src/db/client.ts';

function fakeSupabase(opts: { member?: boolean; rpcError?: string } = {}) {
  const calls: Array<{ fn: string; params: Record<string, unknown> }> = [];
  let n = 0;
  const client: SupabaseRpcClient = {
    async rpc(fn, params) {
      calls.push({ fn, params });
      if (opts.rpcError) return { data: null, error: { message: opts.rpcError } };
      if (fn === 'is_workspace_member') return { data: opts.member ?? true, error: null };
      if (fn === 'append_trace_event') {
        n += 1;
        return { data: [{ id: 100 + n, seq: n }], error: null };
      }
      if (fn === 'append_artifact') return { data: 'artifact-uuid', error: null };
      if (fn === 'append_packet') return { data: 'packet-uuid', error: null };
      if (fn === 'set_artifact_storage_path') return { data: null, error: null };
      return { data: null, error: null };
    },
  };
  return { client, calls };
}

describe('getConnectorTokenRpc', () => {
  function client(result: { data: unknown; error: { message: string } | null }): SupabaseRpcClient {
    return { async rpc() { return result; } };
  }

  it('maps the first returned row', async () => {
    const row = { connector_id: 'c1', status: 'connected', access_token_encrypted: 'v1:..', refresh_token_encrypted: null, expires_at: null, token_type: 'Bearer' };
    const fetch = getConnectorTokenRpc(client({ data: [row], error: null }));
    expect(await fetch('ws', 'google_calendar')).toEqual(row);
  });

  it('returns null when no row (not connected)', async () => {
    const fetch = getConnectorTokenRpc(client({ data: null, error: null }));
    expect(await fetch('ws', 'gmail')).toBeNull();
  });

  it('throws on an RPC error', async () => {
    const fetch = getConnectorTokenRpc(client({ data: null, error: { message: 'not a member' } }));
    await expect(fetch('ws', 'gmail')).rejects.toThrow(/get_connector_token RPC failed/);
  });
});

describe('createUserSessionClient', () => {
  it('uses the anon key + the user JWT as bearer — no service-role credential', async () => {
    let captured: { url: string; key: string; options: any } | undefined;
    const fakeCreate: CreateClientFn = (url, key, options) => {
      captured = { url, key, options };
      return {} as SupabaseRpcClient;
    };

    await createUserSessionClient(
      { url: 'https://proj.supabase.co', anonKey: 'anon_publishable_key' },
      { accessToken: 'user.jwt.token', refreshToken: 'refresh.token' },
      { createClient: fakeCreate },
    );

    expect(captured!.url).toBe('https://proj.supabase.co');
    expect(captured!.key).toBe('anon_publishable_key'); // anon, not service-role
    expect(captured!.options.global.headers.Authorization).toBe('Bearer user.jwt.token');
    expect(captured!.options.auth.persistSession).toBe(false);
    expect(captured!.options.auth.autoRefreshToken).toBe(false);
  });
});

describe('appendTraceEventRpc', () => {
  it('calls append_trace_event with the params and returns the { id, seq } row', async () => {
    const { client, calls } = fakeSupabase();
    const rpc = appendTraceEventRpc(client);

    const res = await rpc({
      p_workspace_id: 'ws-1',
      p_ticket_id: 'tk-1',
      p_from_agent: 'code-developer',
      p_to_agent: 'runtime',
      p_event_type: 'tool.executed',
      p_payload: { capability: 'W', tier: 'T3', gate_decision: 'permit' },
    });

    expect(res).toEqual({ id: 101, seq: 1 });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.fn).toBe('append_trace_event');
    expect(calls[0]!.params.p_workspace_id).toBe('ws-1');
    expect(calls[0]!.params.p_ticket_id).toBe('tk-1');
  });

  it('throws when the RPC returns an error (no silent success)', async () => {
    const { client } = fakeSupabase({ rpcError: 'permission denied' });
    const rpc = appendTraceEventRpc(client);
    await expect(
      rpc({
        p_workspace_id: 'ws', p_ticket_id: 'tk', p_from_agent: 'r',
        p_to_agent: 'runtime', p_event_type: 'x', p_payload: {},
      }),
    ).rejects.toThrow(/append_trace_event RPC failed: permission denied/);
  });
});

describe('appendArtifactRpc', () => {
  it('calls append_artifact with the params and returns the inserted uuid', async () => {
    const { client, calls } = fakeSupabase();
    const rpc = appendArtifactRpc(client);
    const id = await rpc({
      p_workspace_id: 'ws', p_ticket_id: 'tk', p_kind: 'file',
      p_storage_path: null, p_mime_type: 'text/plain', p_bytes: 20,
    });
    expect(id).toBe('artifact-uuid');
    expect(calls[0]!.fn).toBe('append_artifact');
    expect(calls[0]!.params.p_kind).toBe('file');
    expect(calls[0]!.params.p_bytes).toBe(20);
  });

  it('throws on RPC error and on a missing uuid', async () => {
    const err = fakeSupabase({ rpcError: 'denied' });
    await expect(
      appendArtifactRpc(err.client)({
        p_workspace_id: 'w', p_ticket_id: null, p_kind: 'file',
        p_storage_path: null, p_mime_type: null, p_bytes: 1,
      }),
    ).rejects.toThrow(/append_artifact RPC failed: denied/);
  });
});

describe('appendPacketRpc', () => {
  it('calls append_packet with the params and returns the inserted uuid', async () => {
    const { client, calls } = fakeSupabase();
    const id = await appendPacketRpc(client)({
      p_workspace_id: 'ws', p_ticket_id: 'tk', p_trace_event_id: null,
      p_packet_type: 'failure', p_body_raw: null, p_body_parsed: { failure_type: 'timeout' },
    });
    expect(id).toBe('packet-uuid');
    expect(calls[0]!.fn).toBe('append_packet');
    expect(calls[0]!.params.p_packet_type).toBe('failure');
  });

  it('throws on RPC error', async () => {
    const err = fakeSupabase({ rpcError: 'boom' });
    await expect(
      appendPacketRpc(err.client)({
        p_workspace_id: 'w', p_ticket_id: 't', p_trace_event_id: null,
        p_packet_type: 'failure', p_body_raw: null, p_body_parsed: {},
      }),
    ).rejects.toThrow(/append_packet RPC failed: boom/);
  });
});

describe('setArtifactStoragePathRpc', () => {
  it('calls set_artifact_storage_path with the id + path', async () => {
    const { client, calls } = fakeSupabase();
    await setArtifactStoragePathRpc(client)('artifact-uuid', 'ws/tk/artifact-uuid/hello.txt');
    expect(calls[0]!.fn).toBe('set_artifact_storage_path');
    expect(calls[0]!.params).toEqual({
      p_artifact_id: 'artifact-uuid',
      p_storage_path: 'ws/tk/artifact-uuid/hello.txt',
    });
  });

  it('throws on RPC error', async () => {
    const { client } = fakeSupabase({ rpcError: 'denied' });
    await expect(
      setArtifactStoragePathRpc(client)('a', 'p'),
    ).rejects.toThrow(/set_artifact_storage_path RPC failed: denied/);
  });
});

describe('supabaseArtifactStorage', () => {
  it('returns undefined when the client has no .storage (rpc-only fake → no upload)', () => {
    const { client } = fakeSupabase();
    expect(supabaseArtifactStorage(client)).toBeUndefined();
  });

  it('uploads to the artifacts bucket (upsert:false) and surfaces the error field', async () => {
    const uploads: Array<{ path: string; opts: unknown }> = [];
    const client: SupabaseRpcClient = {
      async rpc() { return { data: null, error: null }; },
      storage: {
        from(bucket: string) {
          expect(bucket).toBe('artifacts');
          return {
            async upload(path, _body, opts) {
              uploads.push({ path, opts });
              return { data: { path }, error: null };
            },
          };
        },
      },
    };
    const storage = supabaseArtifactStorage(client)!;
    const res = await storage.upload('ws/tk/a/hello.txt', new Uint8Array([1, 2, 3]), {
      contentType: 'text/plain',
    });
    expect(res.error).toBeNull();
    expect(uploads).toHaveLength(1);
    expect(uploads[0]!.path).toBe('ws/tk/a/hello.txt');
    expect(uploads[0]!.opts).toEqual({ contentType: 'text/plain', upsert: false });
  });
});

describe('isWorkspaceMember', () => {
  it('returns true/false from the server boolean', async () => {
    const yes = fakeSupabase({ member: true });
    const no = fakeSupabase({ member: false });
    expect(await isWorkspaceMember(yes.client, 'ws')).toBe(true);
    expect(await isWorkspaceMember(no.client, 'ws')).toBe(false);
    expect(yes.calls[0]!.params).toEqual({ p_workspace_id: 'ws' });
  });

  it('throws when the membership RPC errors', async () => {
    const { client } = fakeSupabase({ rpcError: 'boom' });
    await expect(isWorkspaceMember(client, 'ws')).rejects.toThrow(/is_workspace_member RPC failed: boom/);
  });
});
