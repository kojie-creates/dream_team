// Planner-through-the-loop (planner slice). Drives set_plan via the fake tape:
// create a plan, then update/replan it, then end — and asserts the loop captures
// the LATEST plan into RunResult.plan and gates PLAN as a permitted T0 action
// (one tool.executed trace per set_plan call). No fs/network — set_plan is pure.

import { describe, it, expect } from 'vitest';
import { runLoop, type RunLoopOptions } from '../../src/loop/run-loop.ts';
import { setPlanTool } from '../../src/tools/plan.ts';
import { roleGrant } from '../../src/gate/grants.ts';
import type { ApprovalSet } from '../../src/gate/types.ts';
import { softwareConfinement } from '../../src/confine/provider.ts';
import { InMemoryTraceSink } from '../harness/trace.ts';
import { sinkTraceEmitter } from '../../src/trace/emit.ts';
import { InMemoryFailureSink } from '../harness/failure.ts';
import { sinkFailureEmitter } from '../../src/packets/failure.ts';
import { tapeModelClient, toolUseTurn, endTurn } from '../harness/tape.ts';

const NO_APPROVALS: ApprovalSet = { standing: new Set(), perAction: new Set() };

function options(tape: ReturnType<typeof tapeModelClient>): RunLoopOptions {
  return {
    modelClient: tape,
    emitter: sinkTraceEmitter(new InMemoryTraceSink()),
    failureEmitter: sinkFailureEmitter(new InMemoryFailureSink()),
    confinement: softwareConfinement('/virtual/ws'), // set_plan ignores the boundary
    role: 'code-developer',
    grant: roleGrant('code-developer')!,
    approvals: NO_APPROVALS,
    tools: [setPlanTool],
    system: 'plan then act',
    messages: [{ role: 'user', content: 'go' }],
    maxTokens: 256,
  };
}

describe('planner — set_plan through the loop', () => {
  it('captures the latest plan (create → update/replan) into RunResult.plan', async () => {
    const tape = tapeModelClient([
      // create
      toolUseTurn([{ id: 'p1', name: 'set_plan', input: {
        goal: 'ship the widget',
        steps: [
          { id: 1, description: 'design', status: 'in_progress' },
          { id: 2, description: 'build', status: 'pending' },
        ],
      } }]),
      // update + replan (step 1 done, add step 3)
      toolUseTurn([{ id: 'p2', name: 'set_plan', input: {
        goal: 'ship the widget',
        steps: [
          { id: 1, description: 'design', status: 'done' },
          { id: 2, description: 'build', status: 'in_progress' },
          { id: 3, description: 'review', status: 'pending' },
        ],
      } }]),
      endTurn(),
    ]);

    const result = await runLoop(options(tape));

    expect(result.state).toBe('done');
    expect(result.plan).toBeDefined();
    expect(result.plan!.goal).toBe('ship the widget');
    // the LATEST plan wins (3 steps, step 1 done)
    expect(result.plan!.steps).toHaveLength(3);
    expect(result.plan!.steps.find((s) => s.id === 1)!.status).toBe('done');
    expect(result.plan!.steps.find((s) => s.id === 3)!.description).toBe('review');

    // one tool.executed trace per set_plan call, both permitted (PLAN is T0).
    const planEvents = result.traceEvents.filter(
      (e) => e.event_type === 'tool.executed' && e.payload.tool_name === 'set_plan',
    );
    expect(planEvents).toHaveLength(2);
    for (const e of planEvents) {
      if (e.event_type === 'tool.executed') expect(e.payload.gate_decision).toBe('permit');
    }
  });

  it('a run that never plans returns plan: undefined', async () => {
    const tape = tapeModelClient([endTurn()]);
    const result = await runLoop(options(tape));
    expect(result.state).toBe('done');
    expect(result.plan).toBeUndefined();
  });
});
