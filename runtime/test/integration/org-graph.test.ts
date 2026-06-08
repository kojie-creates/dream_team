// Live org graph (Option A delegation) — the capstone. Proves the CLAUDE.md chain
// runs for real through startRun: central-orchestrator → build-coordinator →
// code-developer, where the leaf specialist WRITES A REAL FILE. The load-bearing
// claim: a code-developer spawned two levels down a chain of THIN coordinators
// (no W/SH in their §4 grant) still holds W:'T3' and writes — because a dispatcher
// confers the child role's own ceiling (role-grant via the routing chart), not an
// intersection. Tape-driven: no live model, no network.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { startRun } from '../../src/index.ts';
import type { SupabaseRpcClient } from '../../src/db/client.ts';
import { roleGrant } from '../../src/gate/grants.ts';
import { toolsForRole } from '../../src/tools/registry.ts';
import type { ApprovalSet } from '../../src/gate/types.ts';
import { InMemoryFailureSink } from '../harness/failure.ts';
import { sinkFailureEmitter } from '../../src/packets/failure.ts';
import { tapeModelClient, toolUseTurn, endTurn } from '../harness/tape.ts';
import { makeTempWorkspace, type TempWorkspace } from '../harness/index.ts';

let ws: TempWorkspace;
beforeEach(async () => { ws = await makeTempWorkspace(); });
afterEach(async () => { await ws.cleanup(); });

const NO_APPROVALS: ApprovalSet = { standing: new Set(), perAction: new Set() };

function fakeSupabase() {
  const calls: Array<{ fn: string; params: Record<string, unknown> }> = [];
  let n = 0;
  const client: SupabaseRpcClient = {
    async rpc(fn, params) {
      calls.push({ fn, params });
      if (fn === 'is_workspace_member') return { data: true, error: null };
      if (fn === 'append_trace_event') { n += 1; return { data: [{ id: n, seq: n }], error: null }; }
      if (fn === 'append_artifact') { n += 1; return { data: `artifact-${n}`, error: null }; }
      if (fn === 'append_packet') { n += 1; return { data: `packet-${n}`, error: null }; }
      return { data: null, error: null };
    },
  };
  return { client, calls };
}

// createMessage is consumed depth-first across the nested loops (all share one
// tape): orchestrator emits spawn → its child runs to completion → control returns.
const orgTape = () =>
  tapeModelClient([
    // 1. orchestrator dispatches the build coordinator
    toolUseTurn([{ id: 's1', name: 'spawn', input: { role: 'build-coordinator', brief: 'build out/hello.ts' } }]),
    // 2. build coordinator dispatches the code-developer
    toolUseTurn([{ id: 's2', name: 'spawn', input: { role: 'code-developer', brief: 'write out/hello.ts' } }]),
    // 3. code-developer writes the file (it holds W — the whole point)
    toolUseTurn([{ id: 'w1', name: 'write_file', input: { path: 'out/hello.ts', content: 'export const x = 1;\n' } }]),
    endTurn(), // 4. code-developer done
    endTurn(), // 5. build-coordinator done
    endTurn(), // 6. orchestrator done
  ]);

describe('live org graph — orchestrator → coordinator → specialist writes for real', () => {
  it('a code-developer two levels below thin coordinators still holds W and writes the file', async () => {
    const { client, calls } = fakeSupabase();

    const result = await startRun(
      {
        workspaceId: 'ws-uuid',
        ticketId: 'tk-uuid',
        role: 'central-orchestrator',
        grant: roleGrant('central-orchestrator')!,
        approvals: NO_APPROVALS,
        system: 'You are the central-orchestrator. Route this work down the org chart.',
        messages: [{ role: 'user', content: 'Build out/hello.ts' }],
        maxTokens: 1024,
        workspaceRoot: ws.root,
      },
      {
        supabase: client,
        modelClient: orgTape(),
        // Entry surface is the orchestrator's projection: route + plan only.
        tools: toolsForRole('central-orchestrator'),
        failureEmitter: sinkFailureEmitter(new InMemoryFailureSink()),
      },
    );

    expect(result.state).toBe('done');

    // The leaf specialist actually wrote the file on disk.
    const written = await readFile(join(ws.root, 'out', 'hello.ts'), 'utf8');
    expect(written).toBe('export const x = 1;\n');

    // The child's write — two levels down — is recorded as an artifact row. Its
    // trace never bubbles into the orchestrator's result, so before per-child
    // recording this write produced ZERO artifacts. Now runChild records it from
    // the child's own trace: exactly one append_artifact, 20 bytes, kind 'file'.
    const artifacts = calls.filter((c) => c.fn === 'append_artifact');
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]!.params.p_bytes).toBe(20); // 'export const x = 1;\n'
    expect(artifacts[0]!.params.p_kind).toBe('file');

    // The whole chain shares ONE trace sink (the RPC emitter), so every tool across
    // all three nested loops persists via append_trace_event. The child loops'
    // events do NOT bubble into the parent's returned traceEvents — the shared sink
    // is the single source of truth. Two spawns + one write were gated + PERMITTED.
    const traces = calls
      .filter((c) => c.fn === 'append_trace_event')
      .map((c) => c.params.p_payload as Record<string, unknown>)
      .filter((p) => p.event === undefined); // tool.executed payloads carry tool_name
    const spawns = traces.filter((p) => p.tool_name === 'spawn');
    const writes = traces.filter((p) => p.tool_name === 'write_file');
    expect(spawns).toHaveLength(2);
    expect(writes).toHaveLength(1);

    // The write was performed under capability W/T3 with a permit — proof the
    // two-levels-down child held W despite both coordinator ancestors lacking it.
    const w = writes[0]!;
    expect(w.capability).toBe('W');
    expect(w.tier).toBe('T3');
    expect(w.gate_decision).toBe('permit');
  });
});
