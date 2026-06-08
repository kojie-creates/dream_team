// RPC-backed TraceSink — the T3 runtime side of the trace seam (ADR-001 Decision 6).
//
// The loop emits one trace event per gated tool execution through the TraceEmitter
// seam (emit.ts); `sinkTraceEmitter` adapts any `TraceSink` into that emitter. This
// module provides the production `TraceSink`: it persists each row by calling the
// SECURITY DEFINER `append_trace_event` RPC (migration 0008), which allocates the
// per-ticket `seq` atomically server-side. The harness `InMemoryTraceSink` and this
// sink are interchangeable behind the seam — the loop never sees either directly.
//
// Two facts force this shape:
//   1. A `TraceEvent` carries from_agent/to_agent/event_type/payload but NOT
//      workspace_id/ticket_id — one run targets exactly one ticket, so those bind
//      here at construction (not per call).
//   2. `TraceEmitter.emit()` is synchronous (the loop keeps its own control tally and
//      fire-and-forgets persistence). The RPC is async. To honor the failure-packet
//      contract's "no silent failures", this sink does NOT swallow rejected writes: it
//      tracks every in-flight call and records failures, and exposes `flush()` so the
//      host (T6) can await durability and surface drops at run end.
//
// Decoupling (ADR §3): NO `electron`, NO `@supabase/supabase-js` import. The actual
// Supabase `.rpc()` call is injected as `AppendTraceEventRpc` and wired in T6, keeping
// the gate/loop/trace core free of host and DB-client dependencies.

import type { TraceSink } from './emit.ts';

/** Argument object for the `append_trace_event` RPC (migration 0008 parameter names). */
export interface AppendTraceEventParams {
  p_workspace_id: string;
  p_ticket_id: string;
  p_from_agent: string;
  p_to_agent: string;
  p_event_type: string;
  p_payload: Record<string, unknown>;
}

/** The RPC's `returns table (id bigint, seq bigint)` — the persisted row identity. */
export interface AppendTraceEventResult {
  id: number;
  seq: number;
}

/**
 * Injectable RPC caller. T6 supplies the concrete implementation, e.g.
 * `(p) => supabase.rpc('append_trace_event', p).then(({data,error}) => …)`. Keeping
 * it injected is the single decoupling point from `@supabase/supabase-js`.
 */
export type AppendTraceEventRpc = (
  params: AppendTraceEventParams,
) => Promise<AppendTraceEventResult>;

/** A persistence failure retained for `flush()` to surface (never silently dropped). */
export interface TraceWriteFailure {
  event_type: string;
  error: unknown;
}

export interface RpcTraceSinkOptions {
  rpc: AppendTraceEventRpc;
  /** The single workspace this run targets (bound, since TraceEvent omits it). */
  workspaceId: string;
  /** The single ticket this run targets (bound, since TraceEvent omits it). */
  ticketId: string;
}

/**
 * A `TraceSink` whose `append()` persists via the `append_trace_event` RPC, plus the
 * durability surface the sync seam cannot express: `flush()` and `failures`.
 */
export interface RpcTraceSink extends TraceSink {
  append(input: {
    from_agent: string;
    to_agent: string;
    event_type: string;
    payload: Record<string, unknown>;
  }): Promise<AppendTraceEventResult>;
  /** Await every in-flight write. Throws if any write failed (no silent drop). */
  flush(): Promise<void>;
  /** Failures recorded so far (also thrown, aggregated, by `flush`). */
  readonly failures: ReadonlyArray<TraceWriteFailure>;
}

/**
 * Build an RPC-backed `TraceSink` bound to one workspace+ticket. Each `append()`
 * starts a server-side atomic-seq insert; the returned promise resolves to `{id,seq}`.
 * The loop ignores that promise (emit() is void), so this sink retains it: `flush()`
 * awaits all and rejects with an aggregated error if any write failed.
 */
export function rpcTraceSink(opts: RpcTraceSinkOptions): RpcTraceSink {
  const pending = new Set<Promise<unknown>>();
  const failures: TraceWriteFailure[] = [];

  return {
    failures,

    append(input) {
      const call = opts
        .rpc({
          p_workspace_id: opts.workspaceId,
          p_ticket_id: opts.ticketId,
          p_from_agent: input.from_agent,
          p_to_agent: input.to_agent,
          p_event_type: input.event_type,
          p_payload: input.payload,
        })
        .catch((error: unknown) => {
          // Record, never swallow silently — flush() re-raises.
          failures.push({ event_type: input.event_type, error });
          throw error;
        });

      // Track for flush(); attach a no-op so an un-awaited rejection does not become
      // an unhandledRejection (the failure is already captured above).
      const tracked = call.finally(() => pending.delete(tracked));
      pending.add(tracked);
      tracked.catch(() => {});

      return call;
    },

    async flush() {
      // Drain repeatedly: a write could enqueue nothing further, but settle-order is
      // not guaranteed, so loop until the pending set is empty.
      while (pending.size > 0) {
        await Promise.allSettled([...pending]);
      }
      if (failures.length > 0) {
        throw new Error(
          `trace persistence failed for ${failures.length} event(s): ` +
            failures.map((f) => `${f.event_type} (${describe(f.error)})`).join('; '),
        );
      }
    },
  };
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
