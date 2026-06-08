// FailurePacketEmitter seam — the loop's view of "record a failure packet"
// (ADR-001 Decision 10, §3; failure-packet-contract.md). When the loop HALTS on
// an enforced hard-stop (iteration cap, loop detection, budget overrun) it must
// emit a structured FAILURE PACKET — empty output is a contract violation. This
// module mirrors the TraceEmitter pattern (trace/emit.ts) exactly: a fixed packet
// shape, an injectable emitter interface, and a `sink`-backed adapter, so the
// in-memory test sink and the future Supabase-RPC emitter produce byte-identical
// packets.
//
// Real persistence is the `packets` table (`packet_type:'failure'`, Decision 10 /
// §4.4) — a LATER task. This module ships only the SEAM + an in-memory sink for
// tests; it does NOT write the DB row. No `electron`, no app imports (ADR §4).

import type { TraceEvent } from '../trace/emit.ts';

/**
 * The closed 7-type failure taxonomy (failure-packet-contract.md). These are the
 * ONLY valid values — a new type requires a governance amendment. The loop's
 * hard-stops use exactly two of them: `timeout` (iteration cap + loop detection)
 * and `scope_exceeded` (budget overrun) — Decision 10.
 */
export type FailureType =
  | 'input_missing'
  | 'input_invalid'
  | 'dependency_unavailable'
  | 'execution_error'
  | 'quality_gate_fail'
  | 'scope_exceeded'
  | 'timeout';

/**
 * A FAILURE PACKET (failure-packet-contract.md — exact labeled-field set). The
 * contract's labeled fields map 1:1:
 *   From → from_agent, To → to_agent, Work item → work_item,
 *   Failure type → failure_type, Detail → detail,
 *   State at failure → state_at_failure, Recovery suggestion → recovery_suggestion.
 * `trace` carries the full trace attached at halt (contract: "The full trace is
 * attached to the failure packet"; Decision 10 "attach the full trace").
 */
export interface FailurePacket {
  from_agent: string;
  to_agent: string;
  work_item: string;
  failure_type: FailureType;
  detail: string;
  state_at_failure: string;
  recovery_suggestion: string;
  /** Full trace attached at the moment of halt (loop-termination contract step 3). */
  trace: TraceEvent[];
}

/**
 * The injectable failure-packet seam (ADR §3). The loop depends ONLY on this
 * interface, never on the DB or the in-memory sink directly. Mirrors
 * `TraceEmitter.emit`. The future Supabase emitter (writing `packet_type:'failure'`
 * to the `packets` table) implements this same interface — the loop is unchanged
 * when it lands.
 */
export interface FailurePacketEmitter {
  emit(packet: FailurePacket): void;
}

/**
 * The minimal shape the loop needs from a packet sink: append a failure packet
 * row. Both the test in-memory sink and the future RPC client satisfy this.
 * `packet_type` is fixed to `'failure'` here (the table's existing check list,
 * §4.4) so callers cannot mis-tag a failure packet.
 */
export interface FailureSink {
  append(input: {
    packet_type: 'failure';
    from_agent: string;
    to_agent: string;
    payload: Record<string, unknown>;
  }): unknown;
}

/**
 * Adapt any `FailureSink` (the test in-memory sink; the future RPC client) into a
 * `FailurePacketEmitter`. The single decoupling point: the loop never sees the
 * sink, only the emitter. Mirrors `sinkTraceEmitter` in trace/emit.ts.
 */
export function sinkFailureEmitter(sink: FailureSink): FailurePacketEmitter {
  return {
    emit(packet: FailurePacket): void {
      sink.append({
        packet_type: 'failure',
        from_agent: packet.from_agent,
        to_agent: packet.to_agent,
        payload: {
          work_item: packet.work_item,
          failure_type: packet.failure_type,
          detail: packet.detail,
          state_at_failure: packet.state_at_failure,
          recovery_suggestion: packet.recovery_suggestion,
          trace: packet.trace,
        },
      });
    },
  };
}
