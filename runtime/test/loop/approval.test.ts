// T8 (negative slice) — proof that the GATE, not the tool, decides.
//
// Reconciliation note (ADR-001 §5 T8): the ADR's T8 wording ("escape outside
// workspace → blocked_hard") conflates two separate things — *location
// confinement* (the tool's open-once job, already proven in T4 / write-file's
// symlink-swap test) and the *gate's permit/block decision*. T8's real intent is
// to prove the GATE decides end-to-end. The cleanest, highest-value form of that
// is the §8.4 T1 human-approval FLIP: run the SAME tape, SAME tool, SAME grant,
// SAME workspace through the REAL loop twice, changing ONLY the approval set.
//
//   Case 1 — no approval (standing empty, perAction empty):
//     gate → blocked_hard; the tool's execute() did NOT run (no marker file on
//     disk); the model receives a structured block tool_result (is_error:true,
//     retryable:false, "requires human approval"); a tool.executed trace event
//     with verdict 'block'; count(tool.executed) == count(tool calls).
//
//   Case 2 — approved (standing grant for W + a per-action approval whose key
//     matches approvalKey('W', resolvedPath) for the SAME resolved path the loop
//     computes): the SAME tape now permits, the tool ran (marker file present
//     with the exact content), and the loop completed on end_turn.
//
// The ONLY variable that differs between the two cases is the approval set. That
// is the proof: nothing about the tool changed, so the GATE made the decision.
//
// Why this exercises a new path: §8.4's human-approval (T1 standing + per-action)
// branch in gate() has unit coverage in gate.test.ts, but nothing has driven it
// through the full loop until now — Case 2 forces the loop to thread its
// `approvals` into the GateContext and the gate to permit a T1 action.
//
// Mechanics: the fixture tool is T1 (actionTier:'T1') with capability 'W'. The
// code-developer grant has W=T3, so effective tier = stricter(T1, T3) = T1 — the
// gate's hard-approval branch. The tool writes IN-WORKSPACE (this is NOT about
// confinement): the marker file's presence/absence is the on-disk proof of
// whether execute() ran.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { runLoop } from '../../src/loop/run-loop.ts';
import type { LoopMessage, RunLoopOptions } from '../../src/loop/run-loop.ts';
import { writeFileTool } from '../../src/tools/write-file.ts';
import type { ToolDef, ToolExecContext, ToolObservation } from '../../src/tools/types.ts';
import { roleGrant } from '../../src/gate/grants.ts';
import { approvalKey } from '../../src/gate/types.ts';
import type { ApprovalSet, Capability } from '../../src/gate/types.ts';
import { resolveWorkspace } from '../../src/gate/workspace.ts';
import { softwareConfinement } from '../../src/confine/provider.ts';
import { InMemoryTraceSink } from '../harness/trace.ts';
import { sinkTraceEmitter } from '../../src/trace/emit.ts';
import { InMemoryFailureSink } from '../harness/failure.ts';
import { sinkFailureEmitter } from '../../src/packets/failure.ts';
import { tapeModelClient, toolUseTurn, endTurn } from '../harness/tape.ts';
import { makeTempWorkspace, type TempWorkspace } from '../harness/index.ts';

let ws: TempWorkspace;

beforeEach(async () => {
  ws = await makeTempWorkspace();
});

afterEach(async () => {
  await ws.cleanup();
});

// ── The fixed, shared inputs — IDENTICAL across both cases (everything except the
//    approval set). Proving they are the same is the whole point of T8. ──

/** In-workspace target the fixture tool writes (this is in-bounds — not a confinement test). */
const MARKER_REL = 'approved/marker.txt';
const MARKER_CONTENT = 'gate-permitted-write\n';

/** code-developer grant from the real matrix; throws if the role is missing. */
function devGrant() {
  const grant = roleGrant('code-developer');
  if (!grant) throw new Error('test setup: code-developer grant not found');
  return grant;
}

/**
 * The fixture tool: a T1 action carrying capability W. effective tier =
 * stricter(T1, code-developer's W=T3) = T1 → the gate's human-approval branch.
 * Its execute() flips `ran` and writes a real marker file IN-WORKSPACE through
 * the real write_file mechanism, so the marker's presence on disk is hard proof
 * the gate permitted (and its absence is hard proof the gate blocked).
 */
function makeT1WriteTool(state: { ran: boolean }, workspaceRoot: string): ToolDef<{ path: string; content: string }> {
  return {
    name: 'approve_write',
    capability: 'W' as Capability,
    actionTier: 'T1', // stricter(T1, W=T3) = T1 → hard-gated approval branch
    pathArg: 'path',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string' }, content: { type: 'string' } },
      required: ['path', 'content'],
      additionalProperties: false,
    },
    async execute(input: { path: string; content: string }, _ctx: ToolExecContext): Promise<ToolObservation> {
      state.ran = true;
      // Reuse the real write_file confinement so a permitted write leaves real,
      // verifiable evidence on disk (and a leak would, too).
      return writeFileTool.execute(
        { path: input.path, content: input.content },
        { boundary: { workspaceRoot, readAllowlist: [] } },
      );
    },
  };
}

/** Build run options sharing EVERYTHING except `approvals` (the single variable under test). */
function optionsWith(
  approvals: ApprovalSet,
  tool: ToolDef<{ path: string; content: string }>,
): { sink: InMemoryTraceSink; opts: RunLoopOptions } {
  const sink = new InMemoryTraceSink();
  // SAME tape in both cases: model requests the SAME T1 write at the SAME path.
  const tape = tapeModelClient([
    toolUseTurn([
      { id: 'toolu_t1', name: 'approve_write', input: { path: MARKER_REL, content: MARKER_CONTENT } },
    ]),
    endTurn(),
  ]);
  const seed: LoopMessage[] = [{ role: 'user', content: `Write ${MARKER_REL}` }];
  return {
    sink,
    opts: {
      modelClient: tape,
      emitter: sinkTraceEmitter(sink),
      failureEmitter: sinkFailureEmitter(new InMemoryFailureSink()),
      confinement: softwareConfinement(ws.root),
      role: 'code-developer',
      grant: devGrant(), // SAME grant (W=T3) in both cases
      approvals, // ← THE ONLY DIFFERENCE between Case 1 and Case 2
      tools: [tool],
      system: 'You are the code-developer specialist.',
      messages: seed,
      maxTokens: 1024,
    },
  };
}

describe('T8 — the GATE decides: T1 human-approval flip through the full loop', () => {
  it('Case 1 — no approval: blocked_hard, NO side effect, structured block to the model', async () => {
    const state = { ran: false };
    const tool = makeT1WriteTool(state, ws.root);
    // Empty approval set: no standing grant, no per-action approval (safe-by-default, §8.1).
    const noApprovals: ApprovalSet = { standing: new Set(), perAction: new Set() };
    const { sink, opts } = optionsWith(noApprovals, tool);

    const result = await runLoop(opts);

    // The loop still ran to completion (the block is fed back, then end_turn).
    expect(result.state).toBe('done');

    // The tool's execute() NEVER ran...
    expect(state.ran).toBe(false);
    // ...and NOTHING landed at the marker path (disk check — hard proof of non-execution).
    await expect(stat(join(ws.root, 'approved', 'marker.txt'))).rejects.toThrow();

    // Exactly one tool.executed event, with a BLOCK verdict and the gate's hard decision.
    const events = sink.byEventType('tool.executed');
    expect(events).toHaveLength(1);
    const payload = events[0]!.payload;
    expect(payload['verdict']).toBe('block');
    expect(payload['gate_decision']).toBe('blocked_hard');
    expect(payload['capability']).toBe('W');
    expect(payload['tier']).toBe('T1'); // effective tier = stricter(T1, T3)

    // count(tool.executed) == count(tool calls).
    expect(result.traceEvents.filter((e) => e.event_type === 'tool.executed')).toHaveLength(1);

    // The model received a STRUCTURED block tool_result: is_error, not retryable,
    // referencing human approval (Decision 5 blocked_hard shape). content is a JSON
    // STRING (Anthropic requires string/array, not an object) carrying the fields.
    const userTurn = result.messages.find((m) => m.role === 'user' && Array.isArray(m.content))!;
    const results = userTurn.content as Array<{
      type: string;
      tool_use_id: string;
      is_error?: boolean;
      content: string;
    }>;
    expect(results).toHaveLength(1);
    expect(results[0]!.tool_use_id).toBe('toolu_t1');
    expect(results[0]!.is_error).toBe(true);
    const parsed = JSON.parse(results[0]!.content);
    expect(parsed.blocked).toBe(true);
    expect(parsed.retryable).toBe(false);
    expect(parsed.reason).toMatch(/human approval/i);
  });

  it('Case 2 — approved: SAME tape now PERMITS, the tool ran, the marker file is on disk', async () => {
    const state = { ran: false };
    const tool = makeT1WriteTool(state, ws.root);

    // The per-action approval key MUST match what the gate computes. The loop
    // builds the action from resolveWorkspace(requested, boundary).absPath, then
    // gate() looks up approvalKey(capability, resolvedPath). Compute the IDENTICAL
    // key here by resolving against the SAME boundary the loop uses.
    const boundary = { workspaceRoot: softwareConfinement(ws.root).workspaceRoot(), readAllowlist: [] };
    const resolution = resolveWorkspace(MARKER_REL, boundary);
    if (!resolution.ok) throw new Error(`test setup: marker path did not resolve in-bounds: ${resolution.detail}`);
    const key = approvalKey('W', resolution.absPath);

    // Standing grant for W (operator turned the capability ON, §8.1) AND the
    // matching per-action approval (§8.4 "Allow Once"/"Allow for session").
    const approved: ApprovalSet = {
      standing: new Set<Capability>(['W']),
      perAction: new Set<string>([key]),
    };
    const { sink, opts } = optionsWith(approved, tool);

    const result = await runLoop(opts);

    // The loop completed cleanly on end_turn.
    expect(result.state).toBe('done');

    // The tool's execute() ran...
    expect(state.ran).toBe(true);
    // ...and the marker file is on disk with the EXACT content (proof of the permitted write).
    const written = await readFile(join(ws.root, 'approved', 'marker.txt'), 'utf8');
    expect(written).toBe(MARKER_CONTENT);

    // Exactly one tool.executed event, now a PERMIT/pass at T1.
    const events = sink.byEventType('tool.executed');
    expect(events).toHaveLength(1);
    const payload = events[0]!.payload;
    expect(payload['gate_decision']).toBe('permit');
    expect(payload['verdict']).toBe('pass');
    expect(payload['capability']).toBe('W');
    expect(payload['tier']).toBe('T1');

    // count(tool.executed) == count(tool calls).
    expect(result.traceEvents.filter((e) => e.event_type === 'tool.executed')).toHaveLength(1);
  });

  it('THE PROOF: the only difference between block and permit is the approval set', async () => {
    // Run BOTH cases here with provably-identical inputs except `approvals`, and
    // assert opposite outcomes. Same tape, same tool def, same grant, same role,
    // same workspace, same seed message — constructed from the SAME builders.

    // Shared, identical ingredients (asserted equal where cheap to compare).
    const grantA = devGrant();
    const grantB = devGrant();
    expect(grantB).toEqual(grantA); // same grant

    // Case 1 inputs: empty approvals.
    const stateBlocked = { ran: false };
    const toolBlocked = makeT1WriteTool(stateBlocked, ws.root);
    const noApprovals: ApprovalSet = { standing: new Set(), perAction: new Set() };
    const blocked = optionsWith(noApprovals, toolBlocked);

    // Case 2 inputs: standing W + matching per-action approval (only diff).
    const boundary = { workspaceRoot: softwareConfinement(ws.root).workspaceRoot(), readAllowlist: [] };
    const resolution = resolveWorkspace(MARKER_REL, boundary);
    if (!resolution.ok) throw new Error('test setup: marker path did not resolve in-bounds');
    const approved: ApprovalSet = {
      standing: new Set<Capability>(['W']),
      perAction: new Set<string>([approvalKey('W', resolution.absPath)]),
    };
    const statePermitted = { ran: false };
    const toolPermitted = makeT1WriteTool(statePermitted, ws.root);
    const permitted = optionsWith(approved, toolPermitted);

    // Assert the inputs are identical EXCEPT approvals (the controlled variable).
    expect(permitted.opts.role).toBe(blocked.opts.role);
    expect(permitted.opts.system).toBe(blocked.opts.system);
    expect(permitted.opts.messages).toEqual(blocked.opts.messages);
    expect(permitted.opts.tools[0]!.name).toBe(blocked.opts.tools[0]!.name);
    expect(permitted.opts.tools[0]!.capability).toBe(blocked.opts.tools[0]!.capability);
    expect(permitted.opts.tools[0]!.actionTier).toBe(blocked.opts.tools[0]!.actionTier);
    expect(permitted.opts.confinement.workspaceRoot()).toBe(blocked.opts.confinement.workspaceRoot());
    expect(permitted.opts.grant).toEqual(blocked.opts.grant);
    // The one thing that differs:
    expect(permitted.opts.approvals).not.toEqual(blocked.opts.approvals);

    const blockedResult = await runLoop(blocked.opts);
    const permittedResult = await runLoop(permitted.opts);

    // Opposite gate decisions from the SAME everything-but-approvals.
    const blockedDecision = blocked.sink.byEventType('tool.executed')[0]!.payload['gate_decision'];
    const permittedDecision = permitted.sink.byEventType('tool.executed')[0]!.payload['gate_decision'];
    expect(blockedDecision).toBe('blocked_hard');
    expect(permittedDecision).toBe('permit');

    // Opposite side effects, opposite execution.
    expect(stateBlocked.ran).toBe(false);
    expect(statePermitted.ran).toBe(true);
    await expect(stat(join(ws.root, 'approved', 'marker.txt'))).resolves.toBeDefined();

    // Both loops completed cleanly (the block is recoverable in-loop, not a crash).
    expect(blockedResult.state).toBe('done');
    expect(permittedResult.state).toBe('done');
  });
});
