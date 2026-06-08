// TraceEmitter seam — the loop's view of "record a trace event" (ADR-001 §3,
// Decisions 4 + 6). The loop calls `emit()` for every tool execution; it must
// stay DECOUPLED from where the trace row actually lands.
//
// Two implementations satisfy this seam:
//   - the in-memory `InMemoryTraceSink` (test/harness/trace.ts), adapted here for
//     T5 — the real persistence is the SECURITY DEFINER `append_trace_event` RPC
//     (Decision 6), which is task T3 and NOT built here.
//   - the future Supabase-RPC emitter (T3) — left as a seam, not implemented.
//
// The payload shape is fixed by ADR Decision 4 (`tool.executed`). We build it
// here in one place so the loop stays focused on control flow, and so the T3 RPC
// emitter and the in-memory sink produce byte-identical payloads.
//
// Decoupling: no `electron`, no app imports, no I/O in this module beyond
// delegating to whatever sink is injected.

import type { Capability, GateDecision, Tier } from '../gate/types.ts';
import type { FailureType } from '../packets/failure.ts';

/** verdict for the trace-emitter contract (ADR Decision 4): pass | block | error. */
export type TraceVerdict = 'pass' | 'block' | 'error';

/** Witness Tetrad audit fields (logged now, Ed25519-signed later — ADR Decision 4). */
export interface WitnessFields {
  input_hash: string;
  rule: string;
  decision: string;
}

/**
 * The `tool.executed` trace payload (ADR Decision 4 — exact field set). Mirrors
 * `trace_events.payload jsonb`. `from_agent`/`to_agent` live on the row, not the
 * payload (Decision 4: `from_agent` = role, `to_agent` = 'runtime').
 */
export interface ToolExecutedPayload {
  verdict: TraceVerdict; // trace-emitter contract field
  cause: string | null; // failure-type when verdict != pass
  tool_name: string;
  capability: Capability; // brief §6.2 — REQUIRED
  tier: Tier; // effective tier — brief §6.2 — REQUIRED
  gate_decision: GateDecision['verdict']; // §6.2 REQUIRED
  resolved_path: string | null;
  observation_summary: string;
  iteration: number; // loop-termination visibility
  witness: WitnessFields;
}

/**
 * The `run.halted` trace payload (ADR Decision 10): the trace event emitted at an
 * enforced hard-stop (iteration cap, loop detection, budget overrun). It carries
 * `verdict:'error'` so it is the trace-emitter contract's "first causal break"
 * (first verdict:block/error), and `cause` = the failure-packet failure_type that
 * was emitted alongside it. Kept distinct from `tool.executed` because no tool
 * ran — the halt is a loop-control event, not a tool execution.
 */
export interface RunHaltedPayload {
  verdict: 'error'; // trace-emitter contract: first causal break
  cause: FailureType; // the failure_type emitted in the FAILURE PACKET
  detail: string; // contract detail string (mirrors the packet's detail)
  iteration: number; // counter value at halt (loop-termination visibility)
  cost_usd: number; // accumulated run cost at halt (never null — §4.7)
}

/**
 * One trace event as the loop hands it to the emitter. Discriminated on
 * `event_type`: `tool.executed` for a gated tool call (Decision 4), `run.halted`
 * for an enforced hard-stop (Decision 10). The seam carries `from_agent`/
 * `to_agent` so the adapter can write them onto the row (Decision 4 mapping).
 */
export type TraceEvent =
  | {
      event_type: 'tool.executed';
      from_agent: string; // the specialist role, e.g. 'code-developer'
      to_agent: string; // 'runtime'
      payload: ToolExecutedPayload;
    }
  | {
      event_type: 'run.halted';
      from_agent: string;
      to_agent: string;
      payload: RunHaltedPayload;
    };

/**
 * The injectable trace seam (ADR §3). The loop depends ONLY on this interface,
 * never on the DB or the in-memory sink directly. `emit()` returns the events it
 * recorded as a defensive copy is NOT this seam's job — the loop keeps its own
 * tally; this method just records.
 */
export interface TraceEmitter {
  emit(event: TraceEvent): void;
}

/**
 * The minimal shape the loop needs from a trace sink: append a row whose columns
 * mirror `trace_events`. Both the harness `InMemoryTraceSink` and the future T3
 * RPC client satisfy this (the sink's `append()` matches exactly).
 */
export interface TraceSink {
  append(input: {
    from_agent: string;
    to_agent: string;
    event_type: string;
    payload: Record<string, unknown>;
  }): unknown;
}

/**
 * Adapt any `TraceSink` (the harness `InMemoryTraceSink` for T5; the T3 RPC
 * client later) into a `TraceEmitter`. This is the single decoupling point: the
 * loop never sees the sink, only the emitter. The real Supabase-RPC emitter is
 * T3 — it will implement `TraceEmitter` directly (or wrap an RPC-backed
 * `TraceSink`), so the loop is unchanged when it lands.
 */
export function sinkTraceEmitter(sink: TraceSink): TraceEmitter {
  return {
    emit(event: TraceEvent): void {
      sink.append({
        from_agent: event.from_agent,
        to_agent: event.to_agent,
        event_type: event.event_type,
        // ToolExecutedPayload is a fixed-key interface (no index signature); it is
        // structurally a jsonb object, so widen to the sink's Record at this seam.
        payload: event.payload as unknown as Record<string, unknown>,
      });
    },
  };
}
