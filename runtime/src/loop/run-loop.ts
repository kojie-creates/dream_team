// run-loop.ts — the manual tool-use loop (ADR-001 Decision 3, T5).
//
// Hand-rolled tool-use loop on the @anthropic-ai/sdk Messages shape (via the
// injectable ModelClient seam). The loop OWNS every iteration boundary: it calls
// the model, records usage + cost, appends the assistant turn verbatim, and — for
// each tool_use block — resolves the path, calls the GATE (Decision 3 step 4b,
// THE tool boundary), emits a `tool.executed` trace event (Decision 4), and only
// on `permit` executes the tool (Decision 2a: bare `if verdict==='permit'`, no
// nonce — the tool owns its own open-once TOCTOU). Blocks are synthesized into a
// structured `tool_result` (Decision 5) and fed back so the model can adapt.
//
// SCOPE (T5): one tool (write_file), the in-process gate, the manual loop, the
// trace emit. T7 ADDS the enforced hard-stops at the two pre-marked seams:
//   - iteration cap (before every createMessage, Decision 10): halt at
//     iteration_count >= MAX_ORCHESTRATION_ITERATIONS (15) with a `timeout` packet.
//   - budget (after usage is accumulated, Decision 10): soft-warn at $5, hard-stop
//     at $20/run with a `scope_exceeded` packet.
//   - loop detection (loop-termination contract): two consecutive no-progress
//     iterations (identical from/to, no state change) → `timeout` packet.
// Each halt emits a FAILURE PACKET (failure-packet contract) AND a `run.halted`
// trace event with verdict:'error' marking the first causal break (trace-emitter
// contract). The iteration counter is NEVER reset or suppressed (loop-termination
// contract invariant).
//
// Decoupling: no `electron`, no app imports (ADR §4). The loop calls the gate;
// tools never do. Fail-closed: a non-permit verdict cannot reach the side effect,
// and a gate exception denies (ADR §4.2 — though gate() is pure/total).

import { gate } from '../gate/gate.ts';
import type {
  ApprovalSet,
  Capability,
  GateAction,
  GateContext,
  GateDecision,
  RoleGrant,
  Tier,
} from '../gate/types.ts';
import { resolveWorkspace } from '../gate/workspace.ts';
import type { WorkspaceBoundary } from '../gate/workspace.ts';
import type { ConfinementProvider } from '../confine/provider.ts';
import type { ToolDef, ToolObservation } from '../tools/types.ts';
import type {
  ContentBlock,
  CreateMessageResponse,
  ModelClient,
  ModelUsage,
} from '../model/client.ts';
import type {
  TraceEmitter,
  TraceEvent,
  TraceVerdict,
  WitnessFields,
} from '../trace/emit.ts';
import type {
  FailurePacket,
  FailurePacketEmitter,
  FailureType,
} from '../packets/failure.ts';

/** Model id for the slice (ADR Decision 3). */
const MODEL_ID = 'claude-opus-4-8';

/** to_agent for every tool.executed / run.halted trace event (ADR Decision 4). */
const RUNTIME_AGENT = 'runtime';

/**
 * Hard iteration limit (loop-termination-contract.md). NEVER reset, NEVER
 * suppressed. Before every createMessage, if iteration_count >= this, the loop
 * halts with a `timeout` failure packet (ADR Decision 10).
 */
const MAX_ORCHESTRATION_ITERATIONS = 15;

/** Detail string for the iteration-cap halt (loop-termination-contract.md §"Maximum Iterations"). */
const ITERATION_LIMIT_DETAIL = 'orchestration iteration limit reached';

/** Detail string for the loop-detection halt (loop-termination-contract.md §"Detection Rule"). */
const LOOP_DETECTED_DETAIL = 'loop detected — no state change between iterations';

/**
 * Budget thresholds per run (ADR Decision 10 / GOVERNANCE_SPEC §8.2). Soft-warn
 * is recorded, not halted; hard-stop halts with a `scope_exceeded` packet.
 */
const SOFT_WARN_USD = 5;
const HARD_STOP_USD = 20;

/**
 * Per-1M-token pricing (ADR Decision 10 / §4.7). An UNKNOWN model must NOT
 * silently price to 0 — `priceUsd()` throws so a misconfigured run is a config
 * error, not a free run. T7 wires the enforced budget hard-stop; T5 only records.
 */
const MODEL_PRICING: Readonly<Record<string, { inPerM: number; outPerM: number }>> = {
  'claude-opus-4-8': { inPerM: 5, outPerM: 25 },
};

/** A single tool_use block as the model emits it (ModelClient ContentBlock subset). */
type ToolUseBlock = Extract<ContentBlock, { type: 'tool_use' }>;

/**
 * A tool in the run's registry. The loop holds a heterogeneous set of tools with
 * different input types, so the registry erases the input generic: ToolDef's
 * `execute(input: I)` is invariant, so a concrete `ToolDef<WriteFileInput>` is not
 * assignable to `ToolDef<Record<string,unknown>>`. `unknown` is the correct erased
 * form — the loop only ever passes the model's parsed `input` straight through.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyToolDef = ToolDef<any>;

/** A tool_result content block fed back to the model as the next user turn. */
interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: unknown;
  is_error?: boolean;
}

/** A message in the loop's history (assistant turns + user tool_result turns). */
export interface LoopMessage {
  role: 'assistant' | 'user';
  content: unknown;
}

/** Accumulated token + cost totals for the run (ADR Decision 10; T7 enforces, T5 records). */
export interface RunCost {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  costUsd: number;
}

/**
 * Terminal state of a run. `done` = clean end_turn (T5). T7 adds the enforced
 * halts: `terminated_iteration_cap` + `terminated_loop_detected` (timeout) and
 * `terminated_budget` (scope_exceeded). Every non-`done` state carries a
 * FAILURE PACKET on the result (ADR Decision 10).
 */
export type RunState =
  | 'done'
  | 'terminated_iteration_cap'
  | 'terminated_loop_detected'
  | 'terminated_budget';

/** What the loop returns (ADR Decision 3 last bullet). */
export interface RunResult {
  state: RunState;
  messages: LoopMessage[];
  iterations: number;
  cost: RunCost;
  traceEvents: TraceEvent[];
  /** The FAILURE PACKET emitted on a halt (Decision 10); undefined on a clean `done`. */
  failure?: FailurePacket;
}

/** Everything a run needs (the grant is passed AS A PARAMETER — ADR Decision 9). */
export interface RunLoopOptions {
  modelClient: ModelClient;
  emitter: TraceEmitter;
  /** Where halt FAILURE PACKETs are emitted (Decision 10; failure-packet contract). */
  failureEmitter: FailurePacketEmitter;
  confinement: ConfinementProvider;
  /** The specialist role driving the run (e.g. 'code-developer') — from_agent + gate role. */
  role: string;
  /** The role's capability grant (ADR Decision 9: parameter, never a global). */
  grant: RoleGrant;
  /** Standing grants + per-action approvals for T1 actions (ADR Decision 2). */
  approvals: ApprovalSet;
  /** The tools surfaced to the model, keyed for lookup by name. */
  tools: AnyToolDef[];
  /** The system prompt for the run. */
  system: string;
  /** The seed user message(s) that start the conversation. */
  messages: LoopMessage[];
  /** Max output tokens per createMessage call. */
  maxTokens: number;
}

/**
 * Run the manual tool-use loop for one specialist (ADR Decision 3). Terminates on
 * `end_turn`; in tests the finite tape errors on exhaustion if the loop over-runs.
 */
export async function runLoop(opts: RunLoopOptions): Promise<RunResult> {
  const boundary: WorkspaceBoundary = {
    workspaceRoot: opts.confinement.workspaceRoot(),
    readAllowlist: [],
  };
  const toolsByName = new Map<string, AnyToolDef>(
    opts.tools.map((t) => [t.name, t]),
  );
  // Tools surfaced to the model from each ToolDef's static inputSchema (Decision 3).
  const toolSpecs = opts.tools.map((t) => ({
    name: t.name,
    input_schema: t.inputSchema,
  }));

  const messages: LoopMessage[] = [...opts.messages];
  const traceEvents: TraceEvent[] = [];
  const cost: RunCost = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
    costUsd: 0,
  };
  let iteration = 0;
  let softWarned = false;
  // Signature of the previous iteration's tool activity (from/to + tool calls +
  // observations), for the loop-detection rule (two consecutive identical → halt).
  let prevSignature: string | null = null;

  for (;;) {
    // ── T7 SEAM (pre-createMessage): iteration-cap check (ADR Decision 10:
    //    "before every messages.create"; loop-termination contract). The counter
    //    is NEVER reset — at >= 15 we stop immediately with a `timeout` packet. ──
    if (iteration >= MAX_ORCHESTRATION_ITERATIONS) {
      return halt(opts, {
        state: 'terminated_iteration_cap',
        failureType: 'timeout',
        detail: ITERATION_LIMIT_DETAIL,
        messages,
        iteration,
        cost,
        traceEvents,
      });
    }

    const response = await opts.modelClient.createMessage({
      model: MODEL_ID,
      max_tokens: opts.maxTokens,
      system: opts.system,
      messages,
      tools: toolSpecs,
    });

    // Step 2: record usage + accumulate cost (ADR Decision 3 step 2, Decision 10).
    accumulateCost(cost, response.usage, MODEL_ID);

    // ── T7 SEAM (post-usage): budget hard-stop (ADR Decision 10). Soft-warn at
    //    $5 (record once, do NOT halt); hard-stop at $20/run with a
    //    `scope_exceeded` packet. cost is non-null and = token×price (§4.7). ──
    if (!softWarned && cost.costUsd >= SOFT_WARN_USD) {
      softWarned = true;
      // Soft warning: recorded, not a halt (Decision 10). No SPEND tool exists in
      // slice 1, so this is the only non-fatal budget signal.
      console.warn(
        `runLoop: budget soft-warn — run cost $${cost.costUsd.toFixed(4)} >= $${SOFT_WARN_USD}`,
      );
    }
    if (cost.costUsd >= HARD_STOP_USD) {
      return halt(opts, {
        state: 'terminated_budget',
        failureType: 'scope_exceeded',
        detail: `run token budget exceeded: $${cost.costUsd.toFixed(4)} >= $${HARD_STOP_USD} hard stop`,
        messages,
        iteration,
        cost,
        traceEvents,
      });
    }

    // Step 3: append response.content VERBATIM as the assistant turn — preserves
    // tool_use blocks for the message-history contract (ADR Decision 3 step 3).
    messages.push({ role: 'assistant', content: response.content });

    // Step 4: branch on stop_reason.
    if (response.stop_reason === 'end_turn') {
      return { state: 'done', messages, iterations: iteration, cost, traceEvents };
    }

    if (response.stop_reason === 'tool_use') {
      const toolUses = response.content.filter(
        (b): b is ToolUseBlock => b.type === 'tool_use',
      );
      const toolResults: ToolResultBlock[] = [];
      // Index into traceEvents BEFORE this iteration's tool.executed events are
      // appended, so the loop-detection signature spans exactly this iteration.
      const traceEventsBefore = traceEvents.length;

      for (const block of toolUses) {
        const { observation, decision, resolvedPath } = await handleToolUse(
          block,
          { boundary, toolsByName, ctx: gateContext(opts, boundary), confine: opts.confinement },
        );

        // Step 4c: emit exactly one tool.executed event per tool call (Decision 4;
        // invariant count(tool.executed)==count(tool calls)).
        const event = buildTraceEvent({
          role: opts.role,
          block,
          decision,
          resolvedPath,
          observation,
          iteration,
          toolDef: toolsByName.get(block.name),
        });
        opts.emitter.emit(event);
        traceEvents.push(event);

        // Step 4e: one tool_result per tool_use id, is_error where apt. The
        // Anthropic API requires tool_result.content to be a STRING (or a
        // content-block array) — an object is rejected (400). Emit a compact JSON
        // string carrying the model-readable summary plus any structured fields
        // (blocked/retryable/reason for a block; path/bytes for a write) so the
        // model still has what it needs to adapt (Decision 5).
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: toolResultContent(observation),
          ...(observation.is_error ? { is_error: true } : {}),
        });
      }

      // Append the tool_result blocks as a SINGLE user turn (message-history
      // contract: one user message carrying all results) and loop.
      messages.push({ role: 'user', content: toolResults });

      // Loop-detection (loop-termination contract): two CONSECUTIVE iterations
      // with identical from/to and no state change → the model re-requested the
      // identical tool call(s) yielding the identical result(s), no progress.
      // The signature folds the per-iteration tool.executed events (from/to +
      // tool_name + input + gate_decision + observation) — identical signatures on
      // consecutive turns means nothing changed.
      const signature = iterationSignature(traceEvents.slice(traceEventsBefore));
      if (prevSignature !== null && signature === prevSignature) {
        return halt(opts, {
          state: 'terminated_loop_detected',
          failureType: 'timeout',
          detail: LOOP_DETECTED_DETAIL,
          messages,
          iteration,
          cost,
          traceEvents,
        });
      }
      prevSignature = signature;

      iteration += 1;
      continue;
    }

    // Decision 3 leaves pause_turn / max_tokens out of slice 1. T5 tapes never
    // produce them; if one appears it is a fixture/contract violation — fail loud
    // rather than silently spin (the cap that would catch a real one is T7).
    throw new Error(
      `runLoop: unhandled stop_reason '${response.stop_reason}' (slice-1 tapes use end_turn/tool_use only)`,
    );
  }
}

/**
 * Build the `tool_result` content string fed back to the model (ADR Decision 5).
 * Anthropic requires a string (or content-block array), not an object — so this
 * serializes the observation's `summary` plus any structured `data` fields into one
 * compact JSON string. For a block that carries `retryable`/`reason`/`missing`; for
 * a write, `path`/`bytes`. `summary` is always present (the interface's documented
 * model-readable field).
 */
function toolResultContent(obs: ToolObservation): string {
  const extra =
    obs.data && typeof obs.data === 'object' ? (obs.data as Record<string, unknown>) : {};
  return JSON.stringify({ summary: obs.summary, ...extra });
}

/** Build the gate context for a run (role + grant + approvals + boundary). */
function gateContext(opts: RunLoopOptions, boundary: WorkspaceBoundary): GateContext {
  return { role: opts.role, grant: opts.grant, approvals: opts.approvals, boundary };
}

interface HaltArgs {
  state: Exclude<RunState, 'done'>;
  failureType: FailureType;
  detail: string;
  messages: LoopMessage[];
  iteration: number;
  cost: RunCost;
  traceEvents: TraceEvent[];
}

/**
 * Emit the enforced-halt telemetry and return the terminated RunResult (ADR
 * Decision 10): a `run.halted` trace event with verdict:'error' marking the FIRST
 * causal break (trace-emitter contract) AND a FAILURE PACKET carrying the full
 * trace (failure-packet + loop-termination contracts). Order matters: the trace
 * event is appended to `traceEvents` FIRST so it is included in the trace the
 * packet attaches. The iteration counter is reported as-is — never reset.
 */
function halt(opts: RunLoopOptions, args: HaltArgs): RunResult {
  const haltEvent: TraceEvent = {
    event_type: 'run.halted',
    from_agent: opts.role,
    to_agent: RUNTIME_AGENT,
    payload: {
      verdict: 'error',
      cause: args.failureType,
      detail: args.detail,
      iteration: args.iteration,
      cost_usd: args.cost.costUsd,
    },
  };
  opts.emitter.emit(haltEvent);
  args.traceEvents.push(haltEvent);

  const packet: FailurePacket = {
    from_agent: opts.role,
    to_agent: 'build-coordinator',
    work_item: opts.system,
    failure_type: args.failureType,
    detail: args.detail,
    state_at_failure: `iteration ${args.iteration}, cost $${args.cost.costUsd.toFixed(4)}, ${args.traceEvents.length} trace event(s)`,
    recovery_suggestion: 'stop — enforced hard-stop reached; do not retry without a changed plan',
    trace: [...args.traceEvents],
  };
  opts.failureEmitter.emit(packet);

  return {
    state: args.state,
    messages: args.messages,
    iterations: args.iteration,
    cost: args.cost,
    traceEvents: args.traceEvents,
    failure: packet,
  };
}

/**
 * Fold one iteration's tool.executed events into a stable string signature for
 * the loop-detection rule (loop-termination contract). Captures from/to, the
 * tool name + input hash, the gate decision, and the observation summary — i.e.
 * "same request, same result, no state change". Resolved path is included so a
 * write to a different path counts as progress.
 */
function iterationSignature(events: readonly TraceEvent[]): string {
  return events
    .filter((e): e is Extract<TraceEvent, { event_type: 'tool.executed' }> =>
      e.event_type === 'tool.executed',
    )
    .map((e) => {
      const p = e.payload;
      return [
        e.from_agent,
        e.to_agent,
        p.tool_name,
        p.witness.input_hash,
        p.resolved_path ?? '',
        p.gate_decision,
        p.observation_summary,
      ].join('|');
    })
    .join('\n');
}

interface HandleDeps {
  boundary: WorkspaceBoundary;
  toolsByName: Map<string, AnyToolDef>;
  ctx: GateContext;
  confine: ConfinementProvider;
}

/**
 * Resolve → gate → (permit?) execute : block, for one tool_use block (ADR
 * Decision 3 step 4 a–d). Returns the observation, the gate decision, and the
 * resolved path so the caller can emit the trace event and build the tool_result.
 */
async function handleToolUse(
  block: ToolUseBlock,
  deps: HandleDeps,
): Promise<{ observation: ToolObservation; decision: GateDecision; resolvedPath: string | null }> {
  const toolDef = deps.toolsByName.get(block.name);
  const input = (block.input ?? {}) as Record<string, unknown>;

  // Unknown tool name from the model: fail closed with a structured block-style
  // observation (treated as out-of-scope) — never execute (ADR §4 fail-closed).
  if (!toolDef) {
    const decision: GateDecision = {
      verdict: 'blocked_scope',
      reason: `unknown tool '${block.name}'`,
    };
    return {
      observation: blockedObservation(decision),
      decision,
      resolvedPath: null,
    };
  }

  // Step 4a: resolveWorkspace() on the path arg (Decision 2). A path-bearing tool
  // whose arg does not resolve in-bounds → resolvedPath null; the gate's T2 policy
  // and the tool's own open-once rule both fail closed on a null/escaping path.
  let resolvedPath: string | null = null;
  if (toolDef.pathArg !== undefined) {
    const requested = input[toolDef.pathArg as string];
    if (typeof requested === 'string') {
      const resolution = resolveWorkspace(requested, deps.boundary);
      resolvedPath = resolution.ok ? resolution.absPath : null;
    }
  }

  const action: GateAction = {
    capability: toolDef.capability,
    resolvedPath,
    actionTier: toolDef.actionTier,
  };

  // Step 4b: THE TOOL BOUNDARY — synchronous gate call, before any side effect.
  // Fail-closed: a gate exception denies (ADR §4.2). gate() is pure/total, so this
  // catch is belt-and-suspenders, not an expected path.
  let decision: GateDecision;
  try {
    decision = gate(action, deps.ctx);
  } catch (err) {
    decision = {
      verdict: 'blocked_hard',
      effectiveTier: 'T1',
      reason: `gate raised, denying (dependency_unavailable): ${describe(err)}`,
    };
    return { observation: blockedObservation(decision), decision, resolvedPath };
  }

  // Step 4d: bare `if verdict==='permit'` (Decision 2a — no nonce; the tool owns
  // its own open-once TOCTOU). The SAME resolvedPath flows into execute with no
  // intervening await or re-resolution (Decision 2a.1 "executed == gated").
  if (decision.verdict === 'permit') {
    const observation = await toolDef.execute(input, {
      boundary: deps.boundary,
      confine: deps.confine,
    });
    return { observation, decision, resolvedPath };
  }

  // Non-permit: synthesize the structured block (Decision 5) — never execute.
  return { observation: blockedObservation(decision), decision, resolvedPath };
}

/**
 * Synthesize the model-readable structured block from a non-permit GateDecision
 * (ADR Decision 5). `blocked_with_path` carries `missing` + retryable:true;
 * `blocked_hard` carries retryable:false; `blocked_scope` is non-retryable
 * (out-of-grant — the model cannot widen its own grant in-loop).
 */
function blockedObservation(decision: GateDecision): ToolObservation {
  switch (decision.verdict) {
    case 'blocked_with_path':
      return {
        ok: false,
        is_error: true,
        summary: `blocked_with_path: ${decision.missing}`,
        data: {
          blocked: true,
          tier: decision.effectiveTier,
          reason: 'grant present but policy unmet',
          missing: decision.missing,
          retryable: true,
        },
      };
    case 'blocked_hard':
      return {
        ok: false,
        is_error: true,
        summary: `blocked_hard: ${decision.reason}`,
        data: {
          blocked: true,
          tier: decision.effectiveTier,
          reason: decision.reason,
          retryable: false,
        },
      };
    case 'blocked_scope':
      return {
        ok: false,
        is_error: true,
        summary: `blocked_scope: ${decision.reason}`,
        data: { blocked: true, reason: decision.reason, retryable: false },
      };
    case 'permit':
      // Unreachable: callers only synthesize on non-permit. Kept exhaustive.
      throw new Error('blockedObservation called with a permit decision');
  }
}

interface BuildTraceArgs {
  role: string;
  block: ToolUseBlock;
  decision: GateDecision;
  resolvedPath: string | null;
  observation: ToolObservation;
  iteration: number;
  toolDef: AnyToolDef | undefined;
}

/** Build the `tool.executed` trace event payload (ADR Decision 4 — exact fields). */
function buildTraceEvent(args: BuildTraceArgs): TraceEvent {
  const { decision, observation } = args;
  const permitted = decision.verdict === 'permit';
  // verdict: pass on a permitted+successful run; error when a permitted tool
  // failed at reality (execution_error); block on any non-permit gate decision.
  let verdict: TraceVerdict;
  let cause: string | null;
  if (!permitted) {
    verdict = 'block';
    cause = mapBlockCause(decision.verdict);
  } else if (observation.is_error) {
    verdict = 'error';
    cause = 'execution_error';
  } else {
    verdict = 'pass';
    cause = null;
  }

  const capability: Capability =
    args.toolDef?.capability ?? ('W' as Capability); // unknown-tool path: best-effort
  const tier: Tier = effectiveTierOf(decision);

  const witness: WitnessFields = {
    input_hash: hashInput(args.block.input),
    rule: `${tier}:${capability}:${decision.verdict}`,
    decision: decision.verdict,
  };

  return {
    event_type: 'tool.executed',
    from_agent: args.role,
    to_agent: RUNTIME_AGENT,
    payload: {
      verdict,
      cause,
      tool_name: args.block.name,
      capability,
      tier,
      gate_decision: decision.verdict,
      resolved_path: args.resolvedPath,
      observation_summary: observation.summary,
      iteration: args.iteration,
      witness,
    },
  };
}

/** Map a non-permit gate verdict to a failure-packet taxonomy cause (Decision 4). */
function mapBlockCause(verdict: Exclude<GateDecision['verdict'], 'permit'>): string {
  switch (verdict) {
    case 'blocked_with_path':
      return 'quality_gate_fail';
    case 'blocked_hard':
      return 'quality_gate_fail';
    case 'blocked_scope':
      return 'scope_exceeded';
  }
}

/** Effective tier carried on a decision (blocked_scope has none → fall back to T1). */
function effectiveTierOf(decision: GateDecision): Tier {
  return 'effectiveTier' in decision ? decision.effectiveTier : 'T1';
}

/**
 * Accumulate token usage + cost for the run (ADR Decision 10). Throws on an
 * unknown model so cost is never silently zero (§4.7).
 */
function accumulateCost(cost: RunCost, usage: ModelUsage, model: string): void {
  const price = priceUsd(model);
  cost.inputTokens += usage.input_tokens;
  cost.outputTokens += usage.output_tokens;
  cost.cacheReadInputTokens += usage.cache_read_input_tokens ?? 0;
  cost.cacheCreationInputTokens += usage.cache_creation_input_tokens ?? 0;
  cost.costUsd +=
    (usage.input_tokens / 1_000_000) * price.inPerM +
    (usage.output_tokens / 1_000_000) * price.outPerM;
}

/** Look up per-1M pricing; an unknown model is a config error (ADR §4.7). */
function priceUsd(model: string): { inPerM: number; outPerM: number } {
  const price = MODEL_PRICING[model];
  if (price === undefined) {
    throw new Error(
      `runLoop: no pricing for model '${model}' — refusing to price as $0 (ADR §4.7)`,
    );
  }
  return price;
}

/**
 * Deterministic, dependency-free hash of the tool input for the witness field
 * (logged now, Ed25519-signed later — ADR Decision 4). FNV-1a over the JSON
 * serialization; not cryptographic, just a stable audit fingerprint for T5.
 */
function hashInput(input: unknown): string {
  const json = JSON.stringify(input ?? null);
  let h = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) {
    h ^= json.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export { MODEL_ID, MODEL_PRICING };
export type { CreateMessageResponse };
