// Artifact recording + liveness check — success-criterion #1 (ADR-001 §6 #1,
// task T9; PROJECT_BRIEF_executable_core_v2 §6.1).
//
// Success criterion #1 demands a "working" artifact: a DEFINED liveness check,
// NOT "file exists". An artifact is only recorded once a real post-condition on
// the written file passes — the file exists AND is non-empty AND its content
// satisfies a caller-declared predicate (equals / contains / parses). A liveness
// check that always passes is worthless, so the predicate is a PARAMETER: the
// caller declares "done" per artifact, and a wrong/empty file fails the gate.
//
// This module mirrors the TraceEmitter / FailurePacketEmitter pattern
// (trace/emit.ts, packets/failure.ts) exactly: a fixed record shape mirroring the
// `artifacts` table columns (migration 0005), an injectable ArtifactEmitter
// interface, and a `sink`-backed adapter — so the in-memory test sink and the
// future Supabase emitter produce byte-identical records.
//
// SCOPE (T9): the record SHAPE + the liveness GATE + the in-memory seam. Real
// persistence (the `artifacts` table row + Storage bytes upload) is a LATER task
// (ADR Decision 7 / §4.4): `storage_path` is null for now. No `electron`, no app
// imports (ADR §4). Cross-platform Node `fs` only.

import { stat, readFile } from 'node:fs/promises';
import type { WorkspaceBoundary } from '../gate/workspace.ts';

/**
 * The `kind` of a produced artifact. Mirrors the `artifacts.kind` check list in
 * migration 0005 EXACTLY (`'markdown' | 'file' | 'bundle' | 'json'`) — do not
 * invent a parallel taxonomy (ADR §4: reuse existing row shapes). Slice-1
 * write_file produces 'file' (or 'markdown' for a .md target).
 */
export type ArtifactKind = 'markdown' | 'file' | 'bundle' | 'json';

/**
 * An artifact record. Mirrors the `artifacts` table columns the runtime writes
 * (migration 0005 — same field NAMES). `storage_path` is null until the Storage
 * upload task lands (ADR §4.4: bucket integration deferred). `bytes` is the REAL
 * byte length of the written content (not a placeholder). `id` / `created_at`
 * are DB-assigned on the real write; the in-memory sink stands in for now.
 */
export interface ArtifactRecord {
  /** `artifacts.workspace_id` — the run's workspace (RLS scope). */
  workspace_id: string;
  /** `artifacts.ticket_id` — the work item this artifact belongs to (nullable in the table). */
  ticket_id: string | null;
  /** `artifacts.kind` — one of the migration-0005 check values. */
  kind: ArtifactKind;
  /** `artifacts.storage_path` — null until the Storage upload task (ADR §4.4). */
  storage_path: string | null;
  /** `artifacts.mime_type` — optional content type; null when unknown. */
  mime_type: string | null;
  /** `artifacts.bytes` — REAL byte length of the written content (>= 0). */
  bytes: number;
  /**
   * Absolute on-disk path of the written file. NOT a table column — carried so an
   * upload-capable sink can read the bytes to upload to Storage (migration 0012).
   * Dropped at the sink seam for sinks that do not upload.
   */
  abs_path: string;
  /**
   * The role that produced the artifact. The `artifacts` table has no
   * `created_by` column (it is RLS-scoped via `workspace_id`), so this is carried
   * for the trace/audit lineage, not the table row, and is dropped at the sink
   * seam. Named to match the `briefs`/`tickets` `created_by` convention.
   */
  created_by: string;
}

/**
 * The injectable artifact seam (ADR §3). The loop / post-run step depends ONLY on
 * this interface, never on the DB or the in-memory sink directly. Mirrors
 * `TraceEmitter.emit` / `FailurePacketEmitter.emit`. The future Supabase emitter
 * (inserting an `artifacts` row + uploading bytes to Storage) implements this same
 * interface — callers are unchanged when it lands.
 */
export interface ArtifactEmitter {
  emit(record: ArtifactRecord): void;
}

/**
 * The minimal shape the recorder needs from an artifact sink: append a row whose
 * columns mirror `artifacts`. Both the test in-memory sink and the future
 * Supabase client satisfy this. `created_by` is dropped here — it is not a column
 * on the `artifacts` table (the row is workspace-scoped, not creator-stamped).
 */
export interface ArtifactSink {
  append(input: {
    workspace_id: string;
    ticket_id: string | null;
    kind: ArtifactKind;
    storage_path: string | null;
    mime_type: string | null;
    bytes: number;
    /** Abs path of the written file, for an upload-capable sink. Optional. */
    abs_path?: string;
  }): unknown;
}

/**
 * Adapt any `ArtifactSink` (the test in-memory sink; the future Supabase client)
 * into an `ArtifactEmitter`. The single decoupling point: the caller never sees
 * the sink, only the emitter. Mirrors `sinkTraceEmitter` / `sinkFailureEmitter`.
 */
export function sinkArtifactEmitter(sink: ArtifactSink): ArtifactEmitter {
  return {
    emit(record: ArtifactRecord): void {
      sink.append({
        workspace_id: record.workspace_id,
        ticket_id: record.ticket_id,
        kind: record.kind,
        storage_path: record.storage_path,
        mime_type: record.mime_type,
        bytes: record.bytes,
        abs_path: record.abs_path,
      });
    },
  };
}

// --- Liveness check (success-criterion #1: a "working" artifact, not "exists") ---

/**
 * A caller-declared post-condition on an artifact's UTF-8 content. The caller
 * passes a predicate so it declares what "done" means for THIS artifact — content
 * equals a known string, contains a marker, parses as JSON, etc. Returning
 * `false` (or throwing) means the artifact is NOT live. This parameter is what
 * makes the liveness check non-vacuous: there is no default-pass.
 */
export type ContentPredicate = (content: string) => boolean;

/** Predicate: content equals `expected` exactly (the common write_file case). */
export function contentEquals(expected: string): ContentPredicate {
  return (content) => content === expected;
}

/** Predicate: content contains `needle` (a marker / signature). */
export function contentContains(needle: string): ContentPredicate {
  return (content) => content.includes(needle);
}

/** Predicate: content parses as JSON (e.g. for a kind:'json' artifact). */
export function contentParsesJson(): ContentPredicate {
  return (content) => {
    try {
      JSON.parse(content);
      return true;
    } catch {
      return false;
    }
  };
}

/** What the caller declares about a single written artifact to be checked. */
export interface ArtifactSpec {
  /** Absolute path to the written file (the realpath'd, in-workspace target). */
  absPath: string;
  /** The post-condition the content must satisfy (caller-declared "done"). */
  predicate: ContentPredicate;
  /** The artifact kind to record on a LIVE result (migration-0005 value). */
  kind: ArtifactKind;
  /** Optional content type recorded on a LIVE result. */
  mimeType?: string | null;
}

/**
 * The outcome of a liveness check. `live:true` carries the REAL byte length so the
 * recorder can stamp `artifacts.bytes` without re-reading. `live:false` carries a
 * `reason` discriminating WHY the artifact is not working — `missing` (no file),
 * `empty` (zero bytes — distinguishes liveness from mere existence), or
 * `predicate_unmet` (file has content but it is not what the caller declared).
 */
export type LivenessResult =
  | { live: true; bytes: number }
  | {
      live: false;
      reason: 'missing' | 'empty' | 'predicate_unmet';
      detail: string;
    };

/**
 * Run the liveness check for one artifact (success-criterion #1). Verifies a REAL
 * post-condition, NOT mere existence, in order:
 *   (a) the file EXISTS and is a regular file,
 *   (b) it is NON-EMPTY (zero bytes is NOT live — this is what separates a
 *       liveness check from a "file exists" check),
 *   (c) its content satisfies the caller-declared predicate.
 * Returns a discriminated result; never throws (a predicate that throws is treated
 * as `predicate_unmet`, never a pass — fail-closed).
 */
export async function checkLiveness(spec: ArtifactSpec): Promise<LivenessResult> {
  // (a) Exists and is a regular file.
  let info;
  try {
    info = await stat(spec.absPath);
  } catch (err) {
    return { live: false, reason: 'missing', detail: `stat failed: ${describe(err)}` };
  }
  if (!info.isFile()) {
    return { live: false, reason: 'missing', detail: `${spec.absPath} is not a regular file` };
  }

  // (b) Non-empty. A file that exists but is empty is NOT a working artifact.
  if (info.size === 0) {
    return { live: false, reason: 'empty', detail: `${spec.absPath} is zero bytes` };
  }

  // (c) Content satisfies the caller-declared predicate. A throwing predicate is
  // fail-closed (predicate_unmet), never a silent pass.
  let content: string;
  try {
    content = await readFile(spec.absPath, 'utf8');
  } catch (err) {
    return { live: false, reason: 'missing', detail: `read failed: ${describe(err)}` };
  }
  let satisfied: boolean;
  try {
    satisfied = spec.predicate(content);
  } catch (err) {
    return { live: false, reason: 'predicate_unmet', detail: `predicate threw: ${describe(err)}` };
  }
  if (!satisfied) {
    return {
      live: false,
      reason: 'predicate_unmet',
      detail: `content of ${spec.absPath} did not satisfy the declared post-condition`,
    };
  }

  // The byte length is read from the post-(b) stat so it is the REAL on-disk size
  // (utf8 bytes), recorded as `artifacts.bytes`.
  return { live: true, bytes: info.size };
}

/** Identity for the run's artifact rows (workspace + ticket + producing role). */
export interface RecordContext {
  workspaceId: string;
  ticketId: string | null;
  role: string;
}

/**
 * The post-run T9 step: run the liveness check for `spec`, and ONLY on a LIVE
 * result emit an `ArtifactRecord`. On a NON-live result NO success artifact is
 * recorded — the failing result is returned to the caller to surface (a failure
 * path / a recorded non-live result), per the task: "On liveness FAIL, it must
 * NOT record a success artifact." Returns the liveness result either way so the
 * caller can branch.
 *
 * This is the success-criterion-#1 "working artifact" gate. It is deliberately a
 * small post-run helper the loop/test drives — it does NOT reshape the loop
 * (Decision 3 is untouched).
 */
export async function recordArtifactIfLive(
  spec: ArtifactSpec,
  ctx: RecordContext,
  emitter: ArtifactEmitter,
): Promise<LivenessResult> {
  const result = await checkLiveness(spec);
  if (!result.live) {
    // Fail-closed: not live → record NO success artifact. The caller surfaces it.
    return result;
  }
  emitter.emit({
    workspace_id: ctx.workspaceId,
    ticket_id: ctx.ticketId,
    kind: spec.kind,
    storage_path: null, // recorded null; an upload-capable sink stamps it after upload (0012).
    mime_type: spec.mimeType ?? null,
    bytes: result.bytes, // REAL byte length from the liveness stat.
    abs_path: spec.absPath, // for the sink's Storage upload.
    created_by: ctx.role,
  });
  return result;
}

function describe(err: unknown): string {
  if (err instanceof Error && typeof (err as NodeJS.ErrnoException).code === 'string') {
    return `${(err as NodeJS.ErrnoException).code}: ${err.message}`;
  }
  return err instanceof Error ? err.message : String(err);
}

// Re-export for callers that want the boundary type alongside the recorder.
export type { WorkspaceBoundary };
