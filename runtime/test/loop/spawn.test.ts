// Spawn-through-the-loop (§8.5). Proves the gate decides WHO may spawn (only a
// role holding SPAWN) and that a permitted spawn flows loop → ctx.spawn → tool →
// runChild with the intersected child grant. Uses the fake tape + an injected
// runChild — no real child model run.

import { describe, it, expect } from 'vitest';
import { runLoop, type RunLoopOptions } from '../../src/loop/run-loop.ts';
import { spawnTool, type SpawnChildInput } from '../../src/tools/spawn.ts';
import { roleGrant } from '../../src/gate/grants.ts';
import type { ApprovalSet } from '../../src/gate/types.ts';
import { softwareConfinement } from '../../src/confine/provider.ts';
import { InMemoryTraceSink } from '../harness/trace.ts';
import { sinkTraceEmitter } from '../../src/trace/emit.ts';
import { InMemoryFailureSink } from '../harness/failure.ts';
import { sinkFailureEmitter } from '../../src/packets/failure.ts';
import { tapeModelClient, toolUseTurn, endTurn } from '../harness/tape.ts';

const NO_APPROVALS: ApprovalSet = { standing: new Set(), perAction: new Set() };

function options(
  role: string,
  tape: ReturnType<typeof tapeModelClient>,
  runChild: (i: SpawnChildInput) => Promise<{ role: string; state: string; iterations: number; costUsd: number }>,
): RunLoopOptions {
  return {
    modelClient: tape,
    emitter: sinkTraceEmitter(new InMemoryTraceSink()),
    failureEmitter: sinkFailureEmitter(new InMemoryFailureSink()),
    confinement: softwareConfinement('/virtual/ws'),
    role,
    grant: roleGrant(role)!,
    approvals: NO_APPROVALS,
    tools: [spawnTool],
    system: 'route',
    messages: [{ role: 'user', content: 'go' }],
    maxTokens: 256,
    spawn: { depth: 0, orchCount: 0, runChild },
  };
}

const spawnCall = toolUseTurn([
  { id: 's1', name: 'spawn', input: { role: 'code-developer', brief: 'build the thing' } },
]);

describe('spawn — gated by SPAWN grant', () => {
  it('a coordinator (holds SPAWN) dispatches a child with the intersected grant', async () => {
    const calls: SpawnChildInput[] = [];
    const runChild = async (i: SpawnChildInput) => {
      calls.push(i);
      return { role: i.role, state: 'done', iterations: 1, costUsd: 0 };
    };
    const result = await runLoop(options('build-coordinator', tapeModelClient([spawnCall, endTurn()]), runChild));

    expect(result.state).toBe('done');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.role).toBe('code-developer');
    expect(calls[0]!.depth).toBe(1);
    expect(calls[0]!.orchCount).toBe(1);
    // Option A: a dispatcher confers the child role’s OWN §4 ceiling (full
    // code-developer grant), NOT the thin coordinator∩child intersection.
    expect(calls[0]!.grant).toEqual(roleGrant('code-developer'));

    const ev = result.traceEvents.find(
      (e) => e.event_type === 'tool.executed' && e.payload.tool_name === 'spawn',
    );
    expect(ev && ev.event_type === 'tool.executed' && ev.payload.gate_decision).toBe('permit');
  });

  it('a specialist WITHOUT SPAWN is blocked — runChild never runs', async () => {
    const calls: SpawnChildInput[] = [];
    const runChild = async (i: SpawnChildInput) => {
      calls.push(i);
      return { role: i.role, state: 'done', iterations: 1, costUsd: 0 };
    };
    // code-developer has no SPAWN → the gate blocks it (blocked_scope).
    const result = await runLoop(options('code-developer', tapeModelClient([spawnCall, endTurn()]), runChild));

    expect(result.state).toBe('done');
    expect(calls).toHaveLength(0); // never dispatched
    const ev = result.traceEvents.find(
      (e) => e.event_type === 'tool.executed' && e.payload.tool_name === 'spawn',
    );
    expect(ev && ev.event_type === 'tool.executed' && ev.payload.gate_decision).toBe('blocked_scope');
  });
});
