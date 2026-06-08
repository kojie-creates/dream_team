// index.ts — the runtime entry the Electron adapter dispatches (ADR-001 §3,
// Decision 1). `startRun` is the production composition root: it gates on workspace
// membership, wires the REAL trace path (append_trace_event RPC) to the loop, runs
// the governed loop, and flushes trace durability. It is PURE OF `electron` — the
// adapter (host/electron-adapter.ts) is the only electron-aware seam.
//
// Credential posture (Decision 7): the only DB identity is the injected user-session
// Supabase client; there is no service-role key anywhere in this module's reach.

import { realpath } from 'node:fs/promises';
import { runLoop } from './loop/run-loop.ts';
import type { LoopMessage, RunResult } from './loop/run-loop.ts';
import type { ApprovalSet, RoleGrant } from './gate/types.ts';
import type { ToolDef } from './tools/types.ts';
import type { ConfinementProvider } from './confine/provider.ts';
import { softwareConfinement } from './confine/provider.ts';
import type { ModelClient } from './model/client.ts';
import type { FailurePacketEmitter } from './packets/failure.ts';
import { sinkFailureEmitter } from './packets/failure.ts';
import { sinkTraceEmitter } from './trace/emit.ts';
import { rpcTraceSink } from './trace/rpc-sink.ts';
import { rpcFailureSink } from './packets/rpc-sink.ts';
import { rpcArtifactSink } from './artifacts/rpc-sink.ts';
import {
  sinkArtifactEmitter,
  recordArtifactIfLive,
  type ArtifactKind,
} from './artifacts/record.ts';
import {
  appendTraceEventRpc,
  appendArtifactRpc,
  appendPacketRpc,
  setArtifactStoragePathRpc,
  supabaseArtifactStorage,
  isWorkspaceMember,
} from './db/client.ts';
import { makeArtifactUploadFn } from './artifacts/upload.ts';
import type { SupabaseRpcClient } from './db/client.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyToolDef = ToolDef<any>;

/**
 * Thrown when the authenticated user is NOT a member of the target workspace. The
 * run is refused BEFORE any side effect (Decision 7 §2). The adapter maps this to a
 * `forbidden` IPC response.
 */
export class WorkspaceMembershipError extends Error {
  constructor(public readonly workspaceId: string) {
    super(`not a member of workspace ${workspaceId}`);
    this.name = 'WorkspaceMembershipError';
  }
}

/** What one run needs that is request-specific (from the IPC trigger). */
export interface StartRunInput {
  workspaceId: string;
  ticketId: string;
  /** Specialist role driving the run (from_agent + gate role). */
  role: string;
  grant: RoleGrant;
  approvals: ApprovalSet;
  system: string;
  messages: LoopMessage[];
  maxTokens: number;
  /** Workspace path on disk; realpath'd here once before confinement (Decision 8 seam). */
  workspaceRoot: string;
}

/** Injected collaborators (built by the adapter from safeStorage secrets / config). */
export interface StartRunDeps {
  /** User-session Supabase client (Decision 7) — the runtime's ONLY DB identity. */
  supabase: SupabaseRpcClient;
  /** Model client built from the BYOK key (anthropicModelClient) or a tape in tests. */
  modelClient: ModelClient;
  /** The tools surfaced to the model. Production slice-1: [writeFileTool]. */
  tools: AnyToolDef[];
  /**
   * Override for halt FAILURE PACKET persistence (failure-packet contract). When
   * omitted, startRun builds the RPC-backed sink (append_packet) from `supabase`, so
   * a halt persists a `packets` row AS the user under RLS. Tests inject a fake.
   */
  failureEmitter?: FailurePacketEmitter;
  /** Confinement override (tests); defaults to software confinement over the realpath'd root. */
  confinement?: ConfinementProvider;
}

/**
 * Dispatch one governed run. Order is load-bearing:
 *   1. membership gate (RLS truth via is_workspace_member) BEFORE any side effect;
 *   2. wire the real append_trace_event RPC sink → emitter;
 *   3. run the loop;
 *   4. flush trace durability — a dropped trace write throws (no silent drop).
 */
export async function startRun(input: StartRunInput, deps: StartRunDeps): Promise<RunResult> {
  // 1 — pre-dispatch membership gate.
  const member = await isWorkspaceMember(deps.supabase, input.workspaceId);
  if (!member) {
    throw new WorkspaceMembershipError(input.workspaceId);
  }

  // 2 — real persistence paths, all AS the user via SECURITY DEFINER RPCs. Bind this
  // run's workspace+ticket where the seam does not carry them (trace, failure).
  const traceSink = rpcTraceSink({
    rpc: appendTraceEventRpc(deps.supabase),
    workspaceId: input.workspaceId,
    ticketId: input.ticketId,
  });
  const emitter = sinkTraceEmitter(traceSink);

  // Failure packets (append_packet). Caller override wins; else the RPC sink — held
  // so we can flush it. `null` when overridden (the caller owns that emitter's flush).
  const failureSink = deps.failureEmitter
    ? null
    : rpcFailureSink({
        rpc: appendPacketRpc(deps.supabase),
        workspaceId: input.workspaceId,
        ticketId: input.ticketId,
      });
  const failureEmitter: FailurePacketEmitter =
    deps.failureEmitter ?? sinkFailureEmitter(failureSink!);

  // Artifacts (append_artifact). The sink input carries workspace/ticket per row.
  // When the real client exposes Storage (production), the sink also uploads the
  // file bytes and stamps storage_path (migration 0012); the rpc-only test fake
  // has no .storage, so the upload step is skipped and the row is recorded as before.
  const artifactStorage = supabaseArtifactStorage(deps.supabase);
  const artifactSink = rpcArtifactSink({
    rpc: appendArtifactRpc(deps.supabase),
    upload: artifactStorage
      ? makeArtifactUploadFn({
          storage: artifactStorage,
          setStoragePath: setArtifactStoragePathRpc(deps.supabase),
        })
      : undefined,
  });
  const artifactEmitter = sinkArtifactEmitter(artifactSink);

  // Confinement root is realpath'd ONCE here (the app→confinement seam); the
  // software provider closes over the canonical value (it does not touch disk).
  const confinement =
    deps.confinement ?? softwareConfinement(await realpath(input.workspaceRoot));

  // 3 — the governed loop.
  const result = await runLoop({
    modelClient: deps.modelClient,
    emitter,
    failureEmitter,
    confinement,
    role: input.role,
    grant: input.grant,
    approvals: input.approvals,
    tools: deps.tools,
    system: input.system,
    messages: input.messages,
    maxTokens: input.maxTokens,
  });

  // 4 — post-run: record each permitted write as an `artifacts` row, gated by the
  // T9 liveness check (exists + non-empty). Only on a clean `done` — a halted run
  // recorded its FAILURE PACKET, not success artifacts.
  if (result.state === 'done') {
    for (const ev of result.traceEvents) {
      if (ev.event_type !== 'tool.executed') continue;
      const p = ev.payload;
      if (p.verdict === 'pass' && p.tool_name === 'write_file' && p.resolved_path) {
        await recordArtifactIfLive(
          { absPath: p.resolved_path, predicate: () => true, kind: kindForPath(p.resolved_path) },
          { workspaceId: input.workspaceId, ticketId: input.ticketId, role: input.role },
          artifactEmitter,
        );
      }
    }
  }

  // 5 — surface any persistence failure (the seams fire-and-forget). A dropped
  // trace/artifact/packet write throws here rather than passing silently.
  await traceSink.flush();
  await artifactSink.flush();
  if (failureSink) await failureSink.flush();

  return result;
}

/** Infer the artifacts.kind (migration-0005 check value) from a file extension. */
function kindForPath(absPath: string): ArtifactKind {
  const lower = absPath.toLowerCase();
  if (lower.endsWith('.md')) return 'markdown';
  if (lower.endsWith('.json')) return 'json';
  return 'file';
}
