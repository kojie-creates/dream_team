// End-to-end FAILURE-PACKET-THROUGH-THE-LOOP proof (fake harness, no live key).
//
// The failure-packet path is DB+unit proven, and terminate.test.ts proves the
// RunResult.failure object returned by a halt. What was NEVER asserted in one
// test is the EMIT path: that a real halt driven THROUGH runLoop emits exactly
// one structured FAILURE PACKET *into the packet sink* (loop → FailurePacketEmitter
// → sinkFailureEmitter → FailureSink.append), with the right Failure type and the
// full trace folded into the persisted payload.
//
// This file closes that gap using ONLY the existing fake tape harness + the
// in-memory failure sink (no Anthropic key, no network). It asserts on
// failureSink.all() — the row the loop actually persisted — not just RunResult:
//   - iteration cap   → exactly one `timeout` packet in the sink, payload carries trace
//   - budget overrun  → exactly one `scope_exceeded` packet in the sink, payload carries trace
//
// Mirrors terminate.test.ts wiring (same harness helpers, same grants/tools).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runLoop } from '../../src/loop/run-loop.ts';
import type { LoopMessage, RunLoopOptions } from '../../src/loop/run-loop.ts';
import { writeFileTool } from '../../src/tools/write-file.ts';
import { roleGrant } from '../../src/gate/grants.ts';
import type { ApprovalSet } from '../../src/gate/types.ts';
import { softwareConfinement } from '../../src/confine/provider.ts';
import { InMemoryTraceSink } from '../harness/trace.ts';
import { sinkTraceEmitter } from '../../src/trace/emit.ts';
import { InMemoryFailureSink, type FailureRow } from '../harness/failure.ts';
import { sinkFailureEmitter } from '../../src/packets/failure.ts';
import { tapeModelClient, toolUseTurn, endTurn, type Tape } from '../harness/tape.ts';
import type { ModelUsage } from '../../src/model/client.ts';
import type { TraceEvent } from '../../src/trace/emit.ts';
import { makeTempWorkspace, type TempWorkspace } from '../harness/index.ts';

let ws: TempWorkspace;

beforeEach(async () => {
  ws = await makeTempWorkspace();
});

afterEach(async () => {
  await ws.cleanup();
});

const NO_APPROVALS: ApprovalSet = { standing: new Set(), perAction: new Set() };

function devGrant() {
  const grant = roleGrant('code-developer');
  if (!grant) throw new Error('test setup: code-developer grant not found');
  return grant;
}

function build(tape: ReturnType<typeof tapeModelClient>) {
  const sink = new InMemoryTraceSink();
  const failureSink = new InMemoryFailureSink();
  const opts: RunLoopOptions = {
    modelClient: tape,
    emitter: sinkTraceEmitter(sink),
    failureEmitter: sinkFailureEmitter(failureSink),
    confinement: softwareConfinement(ws.root),
    role: 'code-developer',
    grant: devGrant(),
    approvals: NO_APPROVALS,
    tools: [writeFileTool],
    system: 'You are the code-developer specialist.',
    messages: [{ role: 'user', content: 'go' } as LoopMessage],
    maxTokens: 1024,
  };
  return { sink, failureSink, opts };
}

/** A tool_use turn writing a UNIQUE path each call → a distinct iteration signature. */
function uniqueWriteTurn(n: number, usage?: ModelUsage) {
  return toolUseTurn(
    [{ id: `toolu_${n}`, name: 'write_file', input: { path: `out/f${n}.ts`, content: `// ${n}\n` } }],
    usage,
  );
}

/** The packet payload the sink persisted, narrowed to the fields under test. */
function payloadOf(row: FailureRow) {
  return row.payload as {
    work_item: string;
    failure_type: string;
    detail: string;
    state_at_failure: string;
    recovery_suggestion: string;
    trace: TraceEvent[];
  };
}

describe('failure packet emitted to the sink — iteration cap (timeout)', () => {
  it('a real cap halt emits exactly one timeout packet INTO the sink, carrying the full trace', async () => {
    // 20 progress-making turns (unique path each) so loop-detection never fires;
    // the iteration cap (15) halts the run. The tape never emits end_turn.
    const tape: Tape = Array.from({ length: 20 }, (_, i) => uniqueWriteTurn(i));
    const { failureSink, opts } = build(tapeModelClient(tape));

    const result = await runLoop(opts);

    // The loop really halted on the cap (sanity — not a clean done).
    expect(result.state).toBe('terminated_iteration_cap');

    // EXACTLY ONE packet reached the sink via the emitter seam.
    expect(failureSink.count()).toBe(1);
    const row = failureSink.all()[0]!;

    // The persisted row is tagged as a failure packet, routed from→to as the loop sets.
    expect(row.packet_type).toBe('failure');
    expect(row.from_agent).toBe('code-developer');
    expect(row.to_agent).toBe('build-coordinator');

    // The serialized payload carries the right Failure TYPE + contract detail.
    const payload = payloadOf(row);
    expect(payload.failure_type).toBe('timeout');
    expect(payload.detail).toBe('orchestration iteration limit reached');

    // The packet CARRIES THE TRACE: same events the run produced, ending on the
    // run.halted break (full trace attached — failure-packet + loop-termination
    // contracts). 15 tool.executed (one per completed iteration) + 1 run.halted.
    expect(payload.trace).toHaveLength(result.traceEvents.length);
    expect(payload.trace.filter((e) => e.event_type === 'tool.executed')).toHaveLength(15);
    const halted = payload.trace.filter((e) => e.event_type === 'run.halted');
    expect(halted).toHaveLength(1);
    expect(halted[0]!.payload.verdict).toBe('error');
    expect((halted[0]!.payload as { cause: string }).cause).toBe('timeout');
    expect(payload.trace.at(-1)!.event_type).toBe('run.halted');

    // The sink row matches the packet the loop also returned (emit path == return path).
    expect(payload.failure_type).toBe(result.failure!.failure_type);
    expect(payload.trace).toHaveLength(result.failure!.trace.length);
  });
});

describe('failure packet emitted to the sink — budget overrun (scope_exceeded)', () => {
  it('a real budget halt emits exactly one scope_exceeded packet INTO the sink, carrying the trace', async () => {
    // claude-opus-4-8 output price is $25 / 1M tokens. 1,000,000 output tokens on
    // the first turn = $25.00 cumulative → past the $20 hard stop. The budget check
    // runs AFTER usage is accumulated, on the first turn.
    const heavy: ModelUsage = { input_tokens: 0, output_tokens: 1_000_000 };
    const tape: Tape = [uniqueWriteTurn(0, heavy), endTurn()];
    const { failureSink, opts } = build(tapeModelClient(tape));

    const result = await runLoop(opts);

    // The loop really halted on the budget hard-stop.
    expect(result.state).toBe('terminated_budget');

    // EXACTLY ONE packet reached the sink.
    expect(failureSink.count()).toBe(1);
    const row = failureSink.all()[0]!;
    expect(row.packet_type).toBe('failure');

    // Right Failure TYPE for a budget overrun.
    const payload = payloadOf(row);
    expect(payload.failure_type).toBe('scope_exceeded');

    // The packet carries the trace, ending on the run.halted break with the
    // non-null cost at halt (token × price = $25).
    expect(payload.trace.length).toBeGreaterThanOrEqual(1);
    const halted = payload.trace.filter((e) => e.event_type === 'run.halted');
    expect(halted).toHaveLength(1);
    expect((halted[0]!.payload as { cause: string }).cause).toBe('scope_exceeded');
    expect((halted[0]!.payload as { cost_usd: number }).cost_usd).toBe(25);
    expect(payload.trace.at(-1)!.event_type).toBe('run.halted');
  });
});

describe('failure packet sink — clean run emits nothing', () => {
  it('a happy-path end_turn run writes ZERO packets to the sink', async () => {
    const tape: Tape = [uniqueWriteTurn(0), endTurn()];
    const { failureSink, opts } = build(tapeModelClient(tape));

    const result = await runLoop(opts);

    expect(result.state).toBe('done');
    expect(failureSink.count()).toBe(0);
    expect(failureSink.all()).toHaveLength(0);
  });
});
