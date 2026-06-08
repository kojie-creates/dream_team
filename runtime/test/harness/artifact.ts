// In-memory artifact sink for the vitest harness (T9).
//
// Mirrors InMemoryFailureSink (failure.ts) / InMemoryTraceSink (trace.ts): a
// CLEARLY-MARKED in-memory stand-in for the real `artifacts` table write
// (migration 0005) + Storage bytes upload, which is a LATER task (ADR Decision 7
// / §4.4). The T9 post-run step emits an ArtifactRecord through the
// ArtifactEmitter seam; this sink lets T9 tests assert the recorded row shape
// (kind, bytes, storage_path, workspace_id, ticket_id) without the DB path.
// Append-only — recorded rows are frozen.

import type { ArtifactKind } from '../../src/artifacts/record.ts';

/** One persisted artifact row. Mirrors the `artifacts` columns the runtime writes. */
export interface ArtifactRow {
  workspace_id: string;
  ticket_id: string | null;
  kind: ArtifactKind;
  storage_path: string | null;
  mime_type: string | null;
  bytes: number;
}

/** In-memory, append-only artifact sink. T9 stand-in for the `artifacts` write. */
export class InMemoryArtifactSink {
  private readonly rows: ArtifactRow[] = [];

  /** Append an artifact row. Returns the persisted row (frozen). */
  append(input: ArtifactRow): ArtifactRow {
    const row: ArtifactRow = Object.freeze({ ...input });
    this.rows.push(row);
    return row;
  }

  /** All rows in append order. Defensive copy. */
  all(): ArtifactRow[] {
    return [...this.rows];
  }

  /** Number of recorded artifacts. */
  count(): number {
    return this.rows.length;
  }
}
