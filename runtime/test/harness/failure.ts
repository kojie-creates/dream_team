// In-memory failure-packet sink for the vitest harness (T7).
//
// Mirrors InMemoryTraceSink (trace.ts): a CLEARLY-MARKED in-memory stand-in for
// the real `packets` table (`packet_type:'failure'`, ADR Decision 10 / §4.4),
// which is a LATER task. The loop emits FAILURE PACKETs through the
// FailurePacketEmitter seam; this sink lets T7 tests assert the packet shape
// without the DB path. Append-only — recorded rows are frozen.

/** One persisted failure-packet row. Mirrors the `packets` columns the runtime writes. */
export interface FailureRow {
  packet_type: 'failure';
  from_agent: string;
  to_agent: string;
  payload: Record<string, unknown>;
}

/** In-memory, append-only failure sink. T7 stand-in for the `packets` write. */
export class InMemoryFailureSink {
  private readonly rows: FailureRow[] = [];

  /** Append a failure-packet row. Returns the persisted row (frozen). */
  append(input: FailureRow): FailureRow {
    const row: FailureRow = Object.freeze({ ...input });
    this.rows.push(row);
    return row;
  }

  /** All rows in append order. Defensive copy. */
  all(): FailureRow[] {
    return [...this.rows];
  }

  /** Number of recorded failure packets. */
  count(): number {
    return this.rows.length;
  }
}
