// T3 — runtime RPC trace sink. Proves the production TraceSink maps a trace event
// onto the `append_trace_event` RPC params (migration 0008), binds workspace+ticket
// at construction, wires through `sinkTraceEmitter`, and — because the emit() seam is
// sync fire-and-forget — does NOT silently drop a failed write: failures are recorded
// and `flush()` re-raises them.
//
// The RPC itself is faked here (the real `@supabase/supabase-js` call is T6). The DB
// behavior (atomic seq, guards, unique backstop) is verified separately against the
// remote project, not through this unit.

import { describe, it, expect } from 'vitest';
import { sinkTraceEmitter } from '../../src/trace/emit.ts';
import type { TraceEvent } from '../../src/trace/emit.ts';
import { rpcTraceSink } from '../../src/trace/rpc-sink.ts';
import type {
  AppendTraceEventParams,
  AppendTraceEventResult,
} from '../../src/trace/rpc-sink.ts';

const WS = 'd9032046-55bb-4532-a90f-c3a28fe3fa73';
const TICKET = '11111111-2222-3333-4444-555555555555';

/** A fake RPC that records calls and allocates a server-like monotonic seq. */
function fakeRpc() {
  const calls: AppendTraceEventParams[] = [];
  let seq = 0;
  const rpc = async (p: AppendTraceEventParams): Promise<AppendTraceEventResult> => {
    calls.push(p);
    seq += 1;
    return { id: 1000 + seq, seq };
  };
  return { rpc, calls };
}

const toolExecutedEvent: TraceEvent = {
  event_type: 'tool.executed',
  from_agent: 'code-developer',
  to_agent: 'runtime',
  payload: {
    verdict: 'pass',
    cause: null,
    tool_name: 'write_file',
    capability: 'W',
    tier: 'T3',
    gate_decision: 'permit',
    resolved_path: '/ws/out.md',
    observation_summary: 'wrote 10 bytes',
    iteration: 1,
    witness: { input_hash: 'h', rule: 'r', decision: 'permit' },
  },
};

describe('rpcTraceSink', () => {
  it('maps append() onto RPC params, binding workspace+ticket at construction', async () => {
    const { rpc, calls } = fakeRpc();
    const sink = rpcTraceSink({ rpc, workspaceId: WS, ticketId: TICKET });

    const res = await sink.append({
      from_agent: 'code-developer',
      to_agent: 'runtime',
      event_type: 'tool.executed',
      payload: { capability: 'W', tier: 'T3', gate_decision: 'permit' },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({
      p_workspace_id: WS,
      p_ticket_id: TICKET,
      p_from_agent: 'code-developer',
      p_to_agent: 'runtime',
      p_event_type: 'tool.executed',
      p_payload: { capability: 'W', tier: 'T3', gate_decision: 'permit' },
    });
    expect(res).toEqual({ id: 1001, seq: 1 });
  });

  it('wires through sinkTraceEmitter (the loop-facing seam)', async () => {
    const { rpc, calls } = fakeRpc();
    const sink = rpcTraceSink({ rpc, workspaceId: WS, ticketId: TICKET });
    const emitter = sinkTraceEmitter(sink);

    emitter.emit(toolExecutedEvent);
    await sink.flush();

    expect(calls).toHaveLength(1);
    expect(calls[0]!.p_workspace_id).toBe(WS);
    expect(calls[0]!.p_ticket_id).toBe(TICKET);
    expect(calls[0]!.p_event_type).toBe('tool.executed');
    // payload carried verbatim — capability/tier/gate_decision present (G3 criterion).
    expect(calls[0]!.p_payload.capability).toBe('W');
    expect(calls[0]!.p_payload.tier).toBe('T3');
    expect(calls[0]!.p_payload.gate_decision).toBe('permit');
  });

  it('flush() resolves and reports no failures when every write succeeds', async () => {
    const { rpc } = fakeRpc();
    const sink = rpcTraceSink({ rpc, workspaceId: WS, ticketId: TICKET });
    const emitter = sinkTraceEmitter(sink);

    emitter.emit(toolExecutedEvent);
    emitter.emit(toolExecutedEvent);
    await expect(sink.flush()).resolves.toBeUndefined();
    expect(sink.failures).toHaveLength(0);
  });

  it('does NOT silently drop a failed write: failure recorded and flush() re-raises', async () => {
    let n = 0;
    const rpc = async (_p: AppendTraceEventParams): Promise<AppendTraceEventResult> => {
      n += 1;
      if (n === 2) throw new Error('db unavailable');
      return { id: n, seq: n };
    };
    const sink = rpcTraceSink({ rpc, workspaceId: WS, ticketId: TICKET });
    const emitter = sinkTraceEmitter(sink);

    // Three emits; the second write rejects. emit() is sync/void — the loop never sees it.
    emitter.emit(toolExecutedEvent);
    emitter.emit(toolExecutedEvent);
    emitter.emit(toolExecutedEvent);

    await expect(sink.flush()).rejects.toThrow(/trace persistence failed for 1 event/);
    expect(sink.failures).toHaveLength(1);
    expect(sink.failures[0]!.event_type).toBe('tool.executed');
    expect(errMsg(sink.failures[0]!.error)).toContain('db unavailable');
  });
});

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
