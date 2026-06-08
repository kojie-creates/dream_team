// RPC-backed ArtifactSink — slice-2 runtime side (append_artifact, migration 0011).
// Mirrors trace/rpc-sink.ts: an injectable RPC caller (the real supabase .rpc is
// wired in db/client.ts), fire-and-forget append() behind the sink seam, and a
// flush()/failures surface so a dropped artifact write is never silent. The
// ArtifactSink input already carries workspace_id + ticket_id, so nothing is bound
// at construction (unlike the trace/failure sinks).
//
// Decoupling (ADR §4): no electron, no @supabase/supabase-js import.

import type { ArtifactKind, ArtifactSink } from './record.ts';

/** Args for the `append_artifact` RPC (migration 0011 parameter names). */
export interface AppendArtifactParams {
  p_workspace_id: string;
  p_ticket_id: string | null;
  p_kind: ArtifactKind;
  p_storage_path: string | null;
  p_mime_type: string | null;
  p_bytes: number;
}

/** The RPC returns the inserted `artifacts.id` (uuid). */
export type AppendArtifactResult = string;

/** Injectable RPC caller (db/client.ts supplies the supabase-backed implementation). */
export type AppendArtifactRpc = (params: AppendArtifactParams) => Promise<AppendArtifactResult>;

export interface ArtifactWriteFailure {
  kind: ArtifactKind;
  error: unknown;
}

export interface RpcArtifactSink extends ArtifactSink {
  flush(): Promise<void>;
  readonly failures: ReadonlyArray<ArtifactWriteFailure>;
}

/** Build an RPC-backed ArtifactSink. `flush()` rejects if any write failed. */
export function rpcArtifactSink(opts: { rpc: AppendArtifactRpc }): RpcArtifactSink {
  const pending = new Set<Promise<unknown>>();
  const failures: ArtifactWriteFailure[] = [];

  return {
    failures,

    append(input) {
      const call = opts
        .rpc({
          p_workspace_id: input.workspace_id,
          p_ticket_id: input.ticket_id,
          p_kind: input.kind,
          p_storage_path: input.storage_path,
          p_mime_type: input.mime_type,
          p_bytes: input.bytes,
        })
        .catch((error: unknown) => {
          failures.push({ kind: input.kind, error });
          throw error;
        });
      const tracked = call.finally(() => pending.delete(tracked));
      pending.add(tracked);
      tracked.catch(() => {});
      return call;
    },

    async flush() {
      while (pending.size > 0) {
        await Promise.allSettled([...pending]);
      }
      if (failures.length > 0) {
        throw new Error(
          `artifact persistence failed for ${failures.length} record(s): ` +
            failures.map((f) => `${f.kind} (${describe(f.error)})`).join('; '),
        );
      }
    },
  };
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
