// T7 — enforced loop-termination + budget hard-stops (ADR-001 Decision 10;
// loop-termination-contract.md; failure-packet-contract.md).
//
// Drives the REAL loop with the tape model client, the in-memory trace sink, the
// in-memory FAILURE PACKET sink, a temp workspace, the REAL gate/grants, and the
// REAL write_file tool. Covers (task T7 done-criterion):
//
//   1. Non-terminating tape (never end_turn) → halts at EXACTLY iteration 15 with
//      a `timeout` FAILURE PACKET, detail "orchestration iteration limit reached",
//      full trace attached, counter == 15 (not 14, not 16). Counter never reset.
//   2. Loop-detection tape (two consecutive identical no-progress iterations) →
//      halts with `timeout`, detail "loop detected — no state change ...".
//   3. Budget-overrun tape (usage drives cumulative cost past $20) → halts with a
//      `scope_exceeded` packet; cost_usd non-null and == token×price.
//   4. Happy-path (T5) tape STILL terminates normally on end_turn — the cap must
//      not fire early (no regression).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runLoop } from '../../src/loop/run-loop.ts';
import type { LoopMessage, RunLoopOptions } from '../../src/loop/run-loop.ts';
import { writeFileTool } from '../../src/tools/write-file.ts';
import { roleGrant } from '../../src/gate/grants.ts';
import type { ApprovalSet } from '../../src/gate/types.ts';
import { softwareConfinement } from '../../src/confine/provider.ts';
import { InMemoryTraceSink } from '../harness/trace.ts';
import { sinkTraceEmitter } from '../../src/trace/emit.ts';
import { InMemoryFailureSink } from '../harness/failure.ts';
import { sinkFailureEmitter } from '../../src/packets/failure.ts';
import { tapeModelClient, toolUseTurn, endTurn, type Tape } from '../harness/tape.ts';
import type { ModelUsage } from '../../src/model/client.ts';
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

describe('T7 — iteration cap (non-terminating tape halts at exactly 15)', () => {
  it('halts at iteration 15 with a timeout packet, full trace, counter == 15', async () => {
    // 20 progress-making turns (unique path each) so loop-detection never fires;
    // the cap must stop us first. The tape never emits end_turn.
    const tape: Tape = Array.from({ length: 20 }, (_, i) => uniqueWriteTurn(i));
    const { failureSink, opts } = build(tapeModelClient(tape));

    const result = await runLoop(opts);

    // Halted by the iteration cap — NOT a clean done.
    expect(result.state).toBe('terminated_iteration_cap');
    // Counter is EXACTLY 15 (not 14, not 16) and was never reset.
    expect(result.iterations).toBe(15);

    // A single FAILURE PACKET, timeout, with the EXACT contract detail string.
    expect(failureSink.count()).toBe(1);
    const packet = result.failure!;
    expect(packet.failure_type).toBe('timeout');
    expect(packet.detail).toBe('orchestration iteration limit reached');

    // Full trace attached: 15 tool.executed (one per completed iteration) + the
    // run.halted event. count(tool.executed) == 15 == the counter.
    const toolEvents = result.traceEvents.filter((e) => e.event_type === 'tool.executed');
    expect(toolEvents).toHaveLength(15);
    const halted = result.traceEvents.filter((e) => e.event_type === 'run.halted');
    expect(halted).toHaveLength(1);
    expect(halted[0]!.payload.verdict).toBe('error');
    expect((halted[0]!.payload as { cause: string }).cause).toBe('timeout');
    // The packet carries the full trace (including the run.halted break).
    expect(packet.trace).toHaveLength(result.traceEvents.length);
    expect(packet.trace.at(-1)!.event_type).toBe('run.halted');
  });

  it('makes exactly 16 createMessage attempts then stops before the 16th body (cap before the call)', async () => {
    // The cap is checked BEFORE createMessage: at iteration 15 the loop returns
    // WITHOUT calling the model a 16th time. So the tape is consumed 15 times.
    const tape: Tape = Array.from({ length: 20 }, (_, i) => uniqueWriteTurn(i));
    const client = tapeModelClient(tape);
    const { opts } = build(client);

    await runLoop(opts);

    // 15 model calls (iterations 0..14), then the cap fires at iteration 15.
    expect(client.requests).toHaveLength(15);
  });
});

describe('T7 — loop detection (two consecutive no-progress iterations)', () => {
  it('halts with timeout / loop-detected when the model re-requests the identical call', async () => {
    // Two IDENTICAL tool_use turns (same id-less signature: same name + input →
    // same observation). After the 2nd, signatures match → halt. A trailing
    // end_turn is present but must NOT be reached.
    const identical = () =>
      toolUseTurn([
        { id: 'toolu_same', name: 'write_file', input: { path: 'out/same.ts', content: 'same\n' } },
      ]);
    const tape: Tape = [identical(), identical(), endTurn()];
    const { failureSink, opts } = build(tapeModelClient(tape));

    const result = await runLoop(opts);

    expect(result.state).toBe('terminated_loop_detected');
    expect(failureSink.count()).toBe(1);
    const packet = result.failure!;
    expect(packet.failure_type).toBe('timeout');
    expect(packet.detail).toBe('loop detected — no state change between iterations');

    // Detection fires on the SECOND identical iteration: iteration counter is 1
    // (incremented once after the first iteration; halt before the second's ++).
    expect(result.iterations).toBe(1);
    const halted = result.traceEvents.filter((e) => e.event_type === 'run.halted');
    expect(halted).toHaveLength(1);
    expect(halted[0]!.payload.verdict).toBe('error');
  });

  it('does NOT false-positive when consecutive iterations make progress (unique writes)', async () => {
    // Distinct writes each turn → distinct signatures → no loop-detection; the
    // run ends cleanly on end_turn well under the cap.
    const tape: Tape = [uniqueWriteTurn(0), uniqueWriteTurn(1), uniqueWriteTurn(2), endTurn()];
    const { failureSink, opts } = build(tapeModelClient(tape));

    const result = await runLoop(opts);

    expect(result.state).toBe('done');
    expect(failureSink.count()).toBe(0);
    expect(result.failure).toBeUndefined();
  });
});

describe('T7 — budget hard-stop ($20/run)', () => {
  it('halts with scope_exceeded; cost_usd non-null and == token×price', async () => {
    // claude-opus-4-8 output price is $25 / 1M tokens. 1,000,000 output tokens on
    // the first turn = $25.00 cumulative → over the $20 hard stop. The budget
    // check runs AFTER usage is accumulated, on the first turn.
    const heavy: ModelUsage = { input_tokens: 0, output_tokens: 1_000_000 };
    const tape: Tape = [uniqueWriteTurn(0, heavy), endTurn()];
    const { failureSink, opts } = build(tapeModelClient(tape));

    const result = await runLoop(opts);

    expect(result.state).toBe('terminated_budget');
    expect(failureSink.count()).toBe(1);
    const packet = result.failure!;
    expect(packet.failure_type).toBe('scope_exceeded');

    // cost is non-null (§4.7) and exactly token × price: 1e6 out × $25/1e6 = $25.
    expect(result.cost.costUsd).toBe(25);
    expect(result.cost.outputTokens).toBe(1_000_000);
    // run.halted carries the non-null cost at halt.
    const halted = result.traceEvents.filter((e) => e.event_type === 'run.halted')[0]!;
    expect((halted.payload as { cost_usd: number }).cost_usd).toBe(25);
    expect((halted.payload as { cause: string }).cause).toBe('scope_exceeded');
  });

  it('does NOT halt on a sub-$20 run (soft-warn boundary; happy path stays done)', async () => {
    // $5 < cost < $20: soft-warn fires (recorded, not fatal) but the run completes.
    // 600,000 output tokens × $25/1e6 = $15.00 — over soft-warn, under hard stop.
    const mid: ModelUsage = { input_tokens: 0, output_tokens: 600_000 };
    const tape: Tape = [uniqueWriteTurn(0, mid), endTurn()];
    const { failureSink, opts } = build(tapeModelClient(tape));

    const result = await runLoop(opts);

    expect(result.state).toBe('done');
    expect(failureSink.count()).toBe(0);
    expect(result.cost.costUsd).toBe(15);
  });
});

describe('max_tokens — clean halt, not a throw (regression: live intern run)', () => {
  it('a truncated turn halts terminated_max_tokens with an execution_error packet', async () => {
    // A real model can stop with `max_tokens` when a long write_file content or prose
    // answer is truncated. The loop must halt cleanly (not throw) so the run records a
    // FAILURE PACKET and the operator can raise maxTokens.
    const tape: Tape = [
      { content: [{ type: 'text', text: 'truncated answer…' }], stop_reason: 'max_tokens', usage: { input_tokens: 0, output_tokens: 100 } },
    ];
    const { failureSink, opts } = build(tapeModelClient(tape));

    const result = await runLoop(opts);

    expect(result.state).toBe('terminated_max_tokens');
    expect(failureSink.count()).toBe(1);
    expect(result.failure!.failure_type).toBe('execution_error');
  });
});

describe('T7 — budget hard-stop is TREE-wide (§8.5 spawn budget)', () => {
  it('halts on a small LOCAL spend once the shared tree total crosses $20', async () => {
    // The tree already spent $18 (parent + earlier children). This loop spends only
    // $5 (200k out × $25/1e6) — well under $20 on its own — but 18 + 5 = $23 crosses
    // the cap. Gating on the shared accumulator, not local cost, is what halts it.
    const treeSpend = { spentUsd: 18 };
    const small: ModelUsage = { input_tokens: 0, output_tokens: 200_000 }; // $5
    const tape: Tape = [uniqueWriteTurn(0, small), endTurn()];
    const { failureSink, opts } = build(tapeModelClient(tape));

    const result = await runLoop({ ...opts, treeSpend });

    expect(result.state).toBe('terminated_budget');
    expect(failureSink.count()).toBe(1);
    expect(result.failure!.failure_type).toBe('scope_exceeded');
    // This loop's OWN cost is only $5 — under $20. The halt came from the tree total.
    expect(result.cost.costUsd).toBe(5);
    expect(treeSpend.spentUsd).toBe(23);
  });

  it('accumulates across sibling loops sharing one accumulator', async () => {
    const treeSpend = { spentUsd: 0 };

    // Sibling A: $15, completes cleanly. The shared total is now $15.
    const a = build(tapeModelClient([uniqueWriteTurn(0, { input_tokens: 0, output_tokens: 600_000 }), endTurn()]));
    const first = await runLoop({ ...a.opts, treeSpend });
    expect(first.state).toBe('done');
    expect(treeSpend.spentUsd).toBe(15);

    // Sibling B: $5 alone (would pass), but 15 + 5 = $20 hits the cap → halts.
    const b = build(tapeModelClient([uniqueWriteTurn(1, { input_tokens: 0, output_tokens: 200_000 }), endTurn()]));
    const second = await runLoop({ ...b.opts, treeSpend });
    expect(second.state).toBe('terminated_budget');
    expect(treeSpend.spentUsd).toBe(20);
  });

  it('no regression: a root run with no treeSpend gates on its own cost', async () => {
    // Same $25 single-turn overrun as the per-run test — with no shared accumulator
    // injected, the loop creates its own root and behaves exactly as before.
    const tape: Tape = [uniqueWriteTurn(0, { input_tokens: 0, output_tokens: 1_000_000 }), endTurn()];
    const { opts } = build(tapeModelClient(tape));
    const result = await runLoop(opts);
    expect(result.state).toBe('terminated_budget');
    expect(result.cost.costUsd).toBe(25);
  });
});

describe('T7 — no regression: happy path still terminates on end_turn', () => {
  it('a single write + end_turn ends as done, no failure packet, cap does not fire early', async () => {
    const tape: Tape = [uniqueWriteTurn(0), endTurn()];
    const { failureSink, opts } = build(tapeModelClient(tape));

    const result = await runLoop(opts);

    expect(result.state).toBe('done');
    expect(result.failure).toBeUndefined();
    expect(failureSink.count()).toBe(0);
    // One completed tool iteration; cap (15) never approached.
    expect(result.iterations).toBe(1);
  });
});
