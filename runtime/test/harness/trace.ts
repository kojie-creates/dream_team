// In-memory trace sink + assertion helpers for the T0 vitest harness.
//
// ADR-001 §3/§4: do NOT invent a parallel telemetry schema. A trace row mirrors
// the existing `trace_events` table columns the runtime uses: seq, from_agent,
// to_agent, event_type, payload (jsonb). Real persistence is the SECURITY
// DEFINER `append_trace_event` RPC (Decision 6, task T3) — for T0 this is an
// in-memory stand-in, CLEARLY MARKED, so loop logic can be asserted before the
// DB path exists. The append-only + monotonic-seq invariants (trace-emitter
// contract) are enforced here so tests catch violations early.

/** One trace row. Mirrors `trace_events` columns the runtime writes. */
export interface TraceRow {
  seq: number;
  from_agent: string;
  to_agent: string;
  event_type: string;
  payload: Record<string, unknown>;
}

/** Fields a caller supplies; `seq` is allocated by the sink (mirrors the RPC). */
export type TraceRowInput = Omit<TraceRow, 'seq'>;

/**
 * In-memory, append-only trace sink. T0 stand-in for the `append_trace_event`
 * RPC (T3). Allocates a monotonic per-instance seq starting at 1 and enforces
 * append-only (no mutation of recorded rows) per the trace-emitter contract.
 */
export class InMemoryTraceSink {
  private readonly rows: TraceRow[] = [];
  private nextSeq = 1;

  /** Append a row, allocating the next monotonic seq. Returns the persisted row (frozen). */
  append(input: TraceRowInput): TraceRow {
    const row: TraceRow = Object.freeze({ seq: this.nextSeq++, ...input });
    this.rows.push(row);
    return row;
  }

  /** All rows in append order. Returns a defensive copy. */
  all(): TraceRow[] {
    return [...this.rows];
  }

  /** Rows matching an event_type, in append order. */
  byEventType(eventType: string): TraceRow[] {
    return this.rows.filter((r) => r.event_type === eventType);
  }

  /** Number of recorded rows. */
  count(): number {
    return this.rows.length;
  }
}

// --- Assertion helpers (return boolean / throw; usable from any test runner) ---

/**
 * Assert seq values are strictly monotonic increasing by 1 from 1 (trace-emitter
 * contract: monotonic, append-only). Throws on violation.
 */
export function assertSeqMonotonic(rows: readonly TraceRow[]): void {
  for (let i = 0; i < rows.length; i++) {
    const expected = i + 1;
    const actual = rows[i]!.seq;
    if (actual !== expected) {
      throw new Error(`trace seq not monotonic: row[${i}] seq=${actual}, expected ${expected}`);
    }
  }
}

/**
 * Find the single trace row of a given event_type, asserting exactly one exists.
 * Throws if zero or more than one match. Useful for "exactly one X event" checks.
 */
export function findSingleEvent(rows: readonly TraceRow[], eventType: string): TraceRow {
  const matches = rows.filter((r) => r.event_type === eventType);
  if (matches.length !== 1) {
    throw new Error(`expected exactly one '${eventType}' event, found ${matches.length}`);
  }
  return matches[0]!;
}

/**
 * Assert a row's payload contains each given key with a deep-equal value.
 * Throws on the first mismatch. Only the listed fields are checked (subset match).
 */
export function assertPayloadFields(row: TraceRow, expected: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(expected)) {
    const actual = row.payload[key];
    if (JSON.stringify(actual) !== JSON.stringify(value)) {
      throw new Error(
        `trace payload field '${key}' mismatch: got ${JSON.stringify(actual)}, expected ${JSON.stringify(value)}`,
      );
    }
  }
}
