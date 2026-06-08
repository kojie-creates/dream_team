// Artifact bytes upload to Supabase Storage (migration 0012). Ordering A:
// append_artifact recorded the row (storage_path null) and returned its id; this
// module uploads the file BYTES to the private `artifacts` bucket under the user
// JWT (member-scoped Storage RLS) and then stamps storage_path via the
// set_artifact_storage_path RPC. If upload/link fails the row simply keeps a null
// storage_path (harmless, retryable) — the failure is surfaced, never swallowed.
//
// Decoupling (ADR §4): no electron, no @supabase/supabase-js import. The Storage
// surface + the set-path RPC are injected; Node fs is used only to read the bytes.

import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import type { ArtifactKind } from './record.ts';

/** 10 MiB — matches the bucket file_size_limit in migration 0012. */
export const MAX_ARTIFACT_BYTES = 10 * 1024 * 1024;

/** Minimal Storage upload surface (the real supabase `.storage.from(bucket)`). */
export interface ArtifactStorage {
  upload(
    objectPath: string,
    body: Uint8Array,
    opts: { contentType: string },
  ): Promise<{ error: { message: string } | null }>;
}

/** Stamp storage_path on the recorded row (set_artifact_storage_path RPC). */
export type SetStoragePathRpc = (artifactId: string, storagePath: string) => Promise<void>;

/** What the sink hands the uploader once it has the inserted artifact id. */
export interface ArtifactUploadArgs {
  artifactId: string;
  workspaceId: string;
  ticketId: string | null;
  absPath: string;
  bytes: number;
  mimeType: string | null;
  kind: ArtifactKind;
}

/** The upload step the artifact sink invokes after append_artifact returns an id. */
export type ArtifactUploadFn = (args: ArtifactUploadArgs) => Promise<void>;

/**
 * Object key: {workspace}/{ticket|_no_ticket}/{artifact}/{filename}. The leading
 * segment is the workspace id — the Storage RLS pivot (migration 0012). The
 * artifact id segment makes the key 1:1 with the row and collision-free. The
 * filename is the basename only (the workspace-confined realpath guarantees it is
 * in-bounds; we additionally sanitize to a safe charset).
 */
export function buildArtifactObjectPath(
  workspaceId: string,
  ticketId: string | null,
  artifactId: string,
  absPath: string,
): string {
  const file = basename(absPath).replace(/[^A-Za-z0-9._-]/g, '_') || 'artifact';
  return `${workspaceId}/${ticketId ?? '_no_ticket'}/${artifactId}/${file}`;
}

/** Content type for the upload + row: explicit mime wins, else infer from kind. */
export function contentTypeFor(kind: ArtifactKind, mimeType: string | null): string {
  if (mimeType) return mimeType;
  if (kind === 'markdown') return 'text/markdown';
  if (kind === 'json') return 'application/json';
  return 'application/octet-stream';
}

/**
 * Build the upload step from the injected Storage surface + set-path RPC. Reads
 * the bytes, enforces the size cap BEFORE upload (a clean failure, not a rejected
 * Storage call), uploads, then stamps storage_path. Any failure throws — the sink
 * records it so flush() surfaces it (no silent drop).
 */
export function makeArtifactUploadFn(deps: {
  storage: ArtifactStorage;
  setStoragePath: SetStoragePathRpc;
  /** Injectable byte reader (tests); defaults to fs.readFile. */
  readBytes?: (absPath: string) => Promise<Uint8Array>;
  maxBytes?: number;
}): ArtifactUploadFn {
  const read = deps.readBytes ?? ((p: string) => readFile(p));
  const maxBytes = deps.maxBytes ?? MAX_ARTIFACT_BYTES;

  return async (args: ArtifactUploadArgs): Promise<void> => {
    if (args.bytes > maxBytes) {
      throw new Error(
        `artifact ${args.absPath} is ${args.bytes} bytes, over the ${maxBytes}-byte limit — not uploaded`,
      );
    }
    const objectPath = buildArtifactObjectPath(
      args.workspaceId,
      args.ticketId,
      args.artifactId,
      args.absPath,
    );
    const body = await read(args.absPath);
    const { error } = await deps.storage.upload(objectPath, body, {
      contentType: contentTypeFor(args.kind, args.mimeType),
    });
    if (error) {
      throw new Error(`storage upload failed for ${objectPath}: ${error.message}`);
    }
    await deps.setStoragePath(args.artifactId, objectPath);
  };
}
