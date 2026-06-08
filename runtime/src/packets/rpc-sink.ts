// RPC-backed FailureSink — slice-2 runtime side (append_packet, migration 0011).
// Mirrors trace/rpc-sink.ts. The FailureSink seam (packets/failure.ts) carries
// packet_type + from/to + payload but NOT workspace_id/ticket_id — one run targets
// one ticket, so those bind here at construction. A failure packet persists as a
// `packets` row (packet_type:'failure') via the SECURITY DEFINER append_packet RPC,
// AS the user under RLS. fire-and-forget behind the sync seam, with flush()/failures
// so a dropped packet write is never silent.
//
// Decoupling (ADR §4): no electron, no @supabase/supabase-js import.

import type { FailureSink } from './failure.ts';

/** Args for the `append_packet` RPC (migration 0011 parameter names). */
export interface AppendPacketParams {
  p_workspace_id: string;
  p_ticket_id: string;
  p_trace_event_id: number | null;
  p_packet_type: string;
  p_body_raw: string | null;
  p_body_parsed: Record<string, unknown>;
}

/** The RPC returns the inserted `packets.id` (uuid). */
export type AppendPacketResult = string;

/** Injectable RPC caller (db/client.ts supplies the supabase-backed implementation). */
export type AppendPacketRpc = (params: AppendPacketParams) => Promise<AppendPacketResult>;

export interface PacketWriteFailure {
  packet_type: string;
  error: unknown;
}

export interface RpcFailureSink extends FailureSink {
  flush(): Promise<void>;
  readonly failures: ReadonlyArray<PacketWriteFailure>;
}

/**
 * Build an RPC-backed FailureSink bound to one workspace+ticket. The failure
 * packet's from/to + payload are folded into `body_parsed`; `trace_event_id` and
 * `body_raw` are null (the structured packet lives in body_parsed). `flush()`
 * rejects if any write failed.
 */
export function rpcFailureSink(opts: {
  rpc: AppendPacketRpc;
  workspaceId: string;
  ticketId: string;
}): RpcFailureSink {
  const pending = new Set<Promise<unknown>>();
  const failures: PacketWriteFailure[] = [];

  return {
    failures,

    append(input) {
      const call = opts
        .rpc({
          p_workspace_id: opts.workspaceId,
          p_ticket_id: opts.ticketId,
          p_trace_event_id: null,
          p_packet_type: input.packet_type,
          p_body_raw: null,
          p_body_parsed: {
            from_agent: input.from_agent,
            to_agent: input.to_agent,
            ...input.payload,
          },
        })
        .catch((error: unknown) => {
          failures.push({ packet_type: input.packet_type, error });
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
          `packet persistence failed for ${failures.length} packet(s): ` +
            failures.map((f) => `${f.packet_type} (${describe(f.error)})`).join('; '),
        );
      }
    },
  };
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
