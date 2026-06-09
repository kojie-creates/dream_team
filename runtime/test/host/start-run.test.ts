// T6 — startRun (index.ts) + the Electron adapter (host/electron-adapter.ts).
//
// Proves the slice's RLS-safe dispatch end to end with fakes (no Electron, no
// network, no real SDK):
//   1. startRun gates on membership BEFORE any side effect — a non-member throws
//      WorkspaceMembershipError and the model is never called, nothing is written,
//      no trace RPC fires.
//   2. startRun happy path — a member run drives the REAL loop + REAL write_file +
//      REAL gate, writes the file, and persists the tool.executed trace via the
//      append_trace_event RPC AS the user (capability/tier/gate_decision in payload).
//   3. The adapter decrypts secrets via safeStorage, builds the user-session client
//      + model client, and returns a structured reply (ok / forbidden) over IPC —
//      with only the anon key in the Supabase config (no service-role key).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { startRun, WorkspaceMembershipError } from '../../src/index.ts';
import { registerRunStart } from '../../src/host/electron-adapter.ts';
import type {
  AdapterConfig,
  IpcMainLike,
  RunStartReply,
  RunStartRequest,
  SafeStorageLike,
} from '../../src/host/electron-adapter.ts';
import type { SupabaseRpcClient, SupabaseConfig, UserSession } from '../../src/db/client.ts';
import type { ModelClient } from '../../src/model/client.ts';
import { writeFileTool } from '../../src/tools/write-file.ts';
import { roleGrant } from '../../src/gate/grants.ts';
import type { ApprovalSet } from '../../src/gate/types.ts';
import { InMemoryFailureSink } from '../harness/failure.ts';
import { sinkFailureEmitter } from '../../src/packets/failure.ts';
import { tapeModelClient, toolUseTurn, endTurn } from '../harness/tape.ts';
import { makeTempWorkspace, type TempWorkspace } from '../harness/index.ts';

let ws: TempWorkspace;
beforeEach(async () => { ws = await makeTempWorkspace(); });
afterEach(async () => { await ws.cleanup(); });

const NO_APPROVALS: ApprovalSet = { standing: new Set(), perAction: new Set() };

function devGrant() {
  const g = roleGrant('code-developer');
  if (!g) throw new Error('test setup: code-developer grant not found');
  return g;
}

/** Fake user-session Supabase client recording every rpc call. */
function fakeSupabase(opts: { member?: boolean } = {}) {
  const calls: Array<{ fn: string; params: Record<string, unknown> }> = [];
  let n = 0;
  const client: SupabaseRpcClient = {
    async rpc(fn, params) {
      calls.push({ fn, params });
      if (fn === 'is_workspace_member') return { data: opts.member ?? true, error: null };
      if (fn === 'append_trace_event') { n += 1; return { data: [{ id: n, seq: n }], error: null }; }
      if (fn === 'append_artifact') { n += 1; return { data: `artifact-${n}`, error: null }; }
      if (fn === 'append_packet') { n += 1; return { data: `packet-${n}`, error: null }; }
      return { data: null, error: null };
    },
  };
  return { client, calls };
}

const happyTape = () =>
  tapeModelClient([
    toolUseTurn([
      { id: 'toolu_1', name: 'write_file', input: { path: 'out/hello.ts', content: 'export const x = 1;\n' } },
    ]),
    endTurn(),
  ]);

function runInput(extra?: Partial<Parameters<typeof startRun>[0]>) {
  return {
    workspaceId: 'ws-uuid',
    ticketId: 'tk-uuid',
    role: 'code-developer',
    grant: devGrant(),
    approvals: NO_APPROVALS,
    system: 'You are the code-developer specialist.',
    messages: [{ role: 'user' as const, content: 'Write out/hello.ts' }],
    maxTokens: 1024,
    workspaceRoot: ws.root,
    ...extra,
  };
}

function deps(supabase: SupabaseRpcClient, modelClient: ModelClient) {
  return {
    supabase,
    modelClient,
    tools: [writeFileTool],
    failureEmitter: sinkFailureEmitter(new InMemoryFailureSink()),
  };
}

describe('startRun — membership gate (RLS-safe dispatch)', () => {
  it('refuses a non-member BEFORE any side effect: throws, model never called, no trace RPC', async () => {
    const { client, calls } = fakeSupabase({ member: false });
    let modelCalled = false;
    const spyModel: ModelClient = {
      async createMessage() { modelCalled = true; return endTurn(); },
    };

    await expect(startRun(runInput(), deps(client, spyModel))).rejects.toBeInstanceOf(
      WorkspaceMembershipError,
    );

    expect(modelCalled).toBe(false); // loop never started
    expect(calls.map((c) => c.fn)).toEqual(['is_workspace_member']); // only the gate ran
  });

  it('member run: writes the file, ends done, persists tool.executed via the RPC as the user', async () => {
    const { client, calls } = fakeSupabase({ member: true });

    const result = await startRun(runInput(), deps(client, happyTape()));

    expect(result.state).toBe('done');

    const written = await readFile(join(ws.root, 'out', 'hello.ts'), 'utf8');
    expect(written).toBe('export const x = 1;\n');

    // Membership gate first, then exactly one append_trace_event for the one tool call.
    expect(calls[0]!.fn).toBe('is_workspace_member');
    const appends = calls.filter((c) => c.fn === 'append_trace_event');
    expect(appends).toHaveLength(1);
    const p = appends[0]!.params;
    expect(p.p_workspace_id).toBe('ws-uuid');
    expect(p.p_ticket_id).toBe('tk-uuid');
    expect(p.p_event_type).toBe('tool.executed');
    const payload = p.p_payload as Record<string, unknown>;
    expect(payload.capability).toBe('W');
    expect(payload.tier).toBe('T3');
    expect(payload.gate_decision).toBe('permit');

    // Post-run: the written file is recorded as an artifact via append_artifact
    // (liveness-gated), AS the user under RLS.
    const artifacts = calls.filter((c) => c.fn === 'append_artifact');
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]!.params.p_workspace_id).toBe('ws-uuid');
    expect(artifacts[0]!.params.p_ticket_id).toBe('tk-uuid');
    expect(artifacts[0]!.params.p_kind).toBe('file');
    expect(artifacts[0]!.params.p_bytes).toBe(20); // 'export const x = 1;\n'
  });

  it('halted run: persists a FAILURE PACKET via append_packet (RPC sink, no override)', async () => {
    const { client, calls } = fakeSupabase({ member: true });
    // One turn whose usage alone exceeds the $20 hard-stop ($25 @ $25/1M out) →
    // the loop halts with scope_exceeded before processing the turn.
    const tape = tapeModelClient([
      { content: [], stop_reason: 'end_turn', usage: { input_tokens: 0, output_tokens: 1_000_000 } },
    ]);
    // NOTE: no failureEmitter override → startRun uses the append_packet RPC sink.
    const result = await startRun(runInput(), {
      supabase: client,
      modelClient: tape,
      tools: [writeFileTool],
    });

    expect(result.state).toBe('terminated_budget');

    const packets = calls.filter((c) => c.fn === 'append_packet');
    expect(packets).toHaveLength(1);
    expect(packets[0]!.params.p_packet_type).toBe('failure');
    const body = packets[0]!.params.p_body_parsed as Record<string, unknown>;
    expect(body.failure_type).toBe('scope_exceeded');
    expect(body.from_agent).toBe('code-developer');
    // A halted run records NO success artifact.
    expect(calls.filter((c) => c.fn === 'append_artifact')).toHaveLength(0);
  });
});

// --- Adapter (IPC seam) ---

function fakeIpc() {
  const handlers = new Map<string, (event: unknown, ...args: unknown[]) => Promise<unknown> | unknown>();
  const ipcMain: IpcMainLike = { handle: (ch, l) => handlers.set(ch, l) };
  return {
    ipcMain,
    invoke: (ch: string, req: RunStartRequest) =>
      handlers.get(ch)!({}, req) as Promise<RunStartReply>,
  };
}

const fakeSafeStorage: SafeStorageLike = {
  isEncryptionAvailable: () => true,
  // The test stores plaintext in the "encrypted" buffer; decrypt = toString.
  decryptString: (buf: Buffer) => buf.toString('utf8'),
};

function adapterConfig(
  supabase: SupabaseRpcClient,
  modelClient: ModelClient,
  session: UserSession = { accessToken: 'user.jwt', refreshToken: 'r' },
): AdapterConfig {
  const supaCfg: SupabaseConfig = { url: 'https://proj.supabase.co', anonKey: 'anon_key' };
  return {
    supabase: supaCfg,
    loadEncryptedAnthropicKey: () => Buffer.from('sk-ant-test'),
    loadEncryptedSession: () => Buffer.from(JSON.stringify(session)),
    grantFor: () => devGrant(),
    approvalsFor: () => NO_APPROVALS,
    toolsFor: () => [writeFileTool],
    systemFor: () => 'You are the code-developer specialist.',
    failureEmitter: sinkFailureEmitter(new InMemoryFailureSink()),
    makeSupabaseClient: async () => supabase, // injected — no network/SDK
    makeModelClient: () => modelClient,
  };
}

const req: RunStartRequest = {
  workspaceId: 'ws-uuid',
  ticketId: 'tk-uuid',
  role: 'code-developer',
  messages: [{ role: 'user', content: 'Write out/hello.ts' }],
  maxTokens: 1024,
  workspaceRoot: '', // set per-test to ws.root
};

describe('registerRunStart — IPC adapter', () => {
  it('decrypts secrets, dispatches a member run, returns ok', async () => {
    const { client } = fakeSupabase({ member: true });
    const { ipcMain, invoke } = fakeIpc();
    const cfg = adapterConfig(client, happyTape());
    registerRunStart(ipcMain, fakeSafeStorage, cfg);

    const reply = await invoke('run:start', { ...req, workspaceRoot: ws.root });

    expect(reply.ok).toBe(true);
    if (reply.ok) {
      expect(reply.state).toBe('done');
      expect(typeof reply.costUsd).toBe('number');
    }
    // The Supabase config the adapter holds carries ONLY url + anon key.
    expect(Object.keys(cfg.supabase).sort()).toEqual(['anonKey', 'url']);
  });

  it('returns forbidden (never starts the loop) for a non-member', async () => {
    const { client } = fakeSupabase({ member: false });
    let modelCalled = false;
    const spyModel: ModelClient = { async createMessage() { modelCalled = true; return endTurn(); } };
    const { ipcMain, invoke } = fakeIpc();
    registerRunStart(ipcMain, fakeSafeStorage, adapterConfig(client, spyModel));

    const reply = await invoke('run:start', { ...req, workspaceRoot: ws.root });

    expect(reply.ok).toBe(false);
    if (!reply.ok) expect(reply.error).toBe('forbidden');
    expect(modelCalled).toBe(false);
  });

  it('returns run_failed (not throw) when OS secret storage is unavailable', async () => {
    const { client } = fakeSupabase({ member: true });
    const noStorage: SafeStorageLike = { isEncryptionAvailable: () => false, decryptString: () => '' };
    const { ipcMain, invoke } = fakeIpc();
    registerRunStart(ipcMain, noStorage, adapterConfig(client, happyTape()));

    const reply = await invoke('run:start', { ...req, workspaceRoot: ws.root });
    expect(reply.ok).toBe(false);
    if (!reply.ok) expect(reply.error).toBe('run_failed');
  });
});
