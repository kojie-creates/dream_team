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
import type { RunChildFn } from './tools/spawn.ts';
import { toolsForRole } from './tools/registry.ts';
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

  // Record every permitted write in a loop's trace as an `artifacts` row, gated by
  // the T9 liveness check (exists + non-empty). Called once per loop result in the
  // spawn tree — a child's writes live in the CHILD's traceEvents (they do not
  // bubble into the parent's), so the parent loop alone would miss them. `role` is
  // the role that performed the writes (the child's role for a child result).
  const recordWrites = async (events: RunResult['traceEvents'], role: string): Promise<void> => {
    for (const ev of events) {
      if (ev.event_type !== 'tool.executed') continue;
      const p = ev.payload;
      if (p.verdict === 'pass' && p.tool_name === 'write_file' && p.resolved_path) {
        await recordArtifactIfLive(
          { absPath: p.resolved_path, predicate: () => true, kind: kindForPath(p.resolved_path) },
          { workspaceId: input.workspaceId, ticketId: input.ticketId, role },
          artifactEmitter,
        );
      }
    }
  };

  // Confinement root is realpath'd ONCE here (the app→confinement seam); the
  // software provider closes over the canonical value (it does not touch disk).
  const confinement =
    deps.confinement ?? softwareConfinement(await realpath(input.workspaceRoot));

  // Sub-agent dispatch (§8.5): the recursive child runner re-enters runLoop with
  // the child role/grant + incremented depth/orchestration counts, sharing this
  // run's trace/failure sinks + confinement (the whole chain is one trace). The
  // spawn tool (when present in deps.tools and the role holds SPAWN) calls it; the
  // grant it passes is already parent∩requested, so a child cannot escalate.
  // One spend accumulator for the whole tree (Decision 10): the top run and every
  // child share it, so the $20 hard-stop bounds total spend, not per-loop spend.
  const treeSpend = { spentUsd: 0 };

  const runChild: RunChildFn = async (childInput) => {
    const childResult = await runLoop({
      modelClient: deps.modelClient,
      emitter,
      failureEmitter,
      confinement,
      treeSpend,
      role: childInput.role,
      grant: childInput.grant,
      approvals: input.approvals,
      // The child's surface is its OWN role's projection (registry), NOT the
      // parent's tools — a code-developer child gets write_file even though its
      // coordinator parent never holds it. Governance-faithful per-role surface.
      tools: toolsForRole(childInput.role),
      system: `You are the ${childInput.role} specialist. ${childInput.brief} Complete it, then stop.`,
      messages: [{ role: 'user', content: childInput.brief }],
      maxTokens: input.maxTokens,
      spawn: { depth: childInput.depth, orchCount: childInput.orchCount, runChild },
    });
    // Record the child's own writes as artifact rows (its trace does not bubble up).
    // Only on a clean child `done` — a halted child recorded its FAILURE PACKET.
    if (childResult.state === 'done') {
      await recordWrites(childResult.traceEvents, childInput.role);
    }
    return {
      role: childInput.role,
      state: childResult.state,
      iterations: childResult.iterations,
      costUsd: childResult.cost.costUsd,
    };
  };

  // 3 — the governed loop.
  const result = await runLoop({
    modelClient: deps.modelClient,
    emitter,
    failureEmitter,
    confinement,
    treeSpend,
    role: input.role,
    grant: input.grant,
    approvals: input.approvals,
    tools: deps.tools,
    system: input.system,
    messages: input.messages,
    maxTokens: input.maxTokens,
    spawn: { depth: 0, orchCount: 0, runChild },
  });

  // 4 — post-run: record the TOP run's permitted writes as `artifacts` rows. Child
  // writes were already recorded inside runChild from each child's own trace. Only
  // on a clean `done` — a halted run recorded its FAILURE PACKET, not artifacts.
  if (result.state === 'done') {
    await recordWrites(result.traceEvents, input.role);
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
