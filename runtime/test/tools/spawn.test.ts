// Tests for the spawn tool (§8.5 + loop-termination contract). Covers: refusal
// without a spawn seam, unknown role, the depth + orchestration caps, and the
// happy path — runChild is invoked with the INTERSECTED child grant and
// incremented depth/orchestration counts.

import { describe, it, expect } from 'vitest';
import {
  spawnTool,
  MAX_SPAWN_DEPTH,
  MAX_ORCHESTRATION_ITERATIONS,
  type SpawnContext,
  type SpawnChildInput,
} from '../../src/tools/spawn.ts';
import type { ToolExecContext } from '../../src/tools/types.ts';
import { roleGrant } from '../../src/gate/grants.ts';

const boundary = { workspaceRoot: '/ws', readAllowlist: [] };

function recordingRunChild() {
  const calls: SpawnChildInput[] = [];
  const runChild = async (input: SpawnChildInput) => {
    calls.push(input);
    return { role: input.role, state: 'done', iterations: 2, costUsd: 0.0123 };
  };
  return { runChild, calls };
}

function ctx(spawn: SpawnContext | undefined): ToolExecContext {
  return { boundary, spawn };
}

function spawnSeam(over: Partial<SpawnContext> = {}): SpawnContext {
  return {
    spawnerRole: 'code-developer',
    spawnerGrant: roleGrant('code-developer')!,
    depth: 0,
    orchCount: 0,
    runChild: async (i) => ({ role: i.role, state: 'done', iterations: 1, costUsd: 0 }),
    ...over,
  };
}

describe('spawn — declaration', () => {
  it('is SPAWN / T2 with no pathArg', () => {
    expect(spawnTool.capability).toBe('SPAWN');
    expect(spawnTool.actionTier).toBe('T2');
    expect(spawnTool.pathArg).toBeUndefined();
  });
});

describe('spawn — refusals (run nothing)', () => {
  it('refuses when no spawn seam is present', async () => {
    const obs = await spawnTool.execute({ role: 'qa-testing', brief: 'x' }, ctx(undefined));
    expect(obs.ok).toBe(false);
    expect(obs.summary).toMatch(/spawn is not available/);
  });

  it('refuses an unknown role', async () => {
    const { runChild, calls } = recordingRunChild();
    const obs = await spawnTool.execute({ role: 'nope', brief: 'x' }, ctx(spawnSeam({ runChild })));
    expect(obs.ok).toBe(false);
    expect(obs.summary).toMatch(/unknown role/);
    expect(calls).toHaveLength(0);
  });

  it('refuses past the spawn DEPTH cap', async () => {
    const { runChild, calls } = recordingRunChild();
    const obs = await spawnTool.execute(
      { role: 'qa-testing', brief: 'x' },
      ctx(spawnSeam({ depth: MAX_SPAWN_DEPTH, runChild })),
    );
    expect(obs.ok).toBe(false);
    expect(obs.summary).toMatch(/depth cap/);
    expect(calls).toHaveLength(0);
  });

  it('refuses at the ORCHESTRATION cap', async () => {
    const { runChild, calls } = recordingRunChild();
    const obs = await spawnTool.execute(
      { role: 'qa-testing', brief: 'x' },
      ctx(spawnSeam({ orchCount: MAX_ORCHESTRATION_ITERATIONS - 1, runChild })),
    );
    expect(obs.ok).toBe(false);
    expect(obs.summary).toMatch(/orchestration iteration limit/);
    expect(calls).toHaveLength(0);
  });
});

describe('spawn — Option A dispatcher delegation (org graph)', () => {
  it('a coordinator confers the child role’s OWN §4 ceiling (full W/SH), not an intersection', async () => {
    const { runChild, calls } = recordingRunChild();
    const obs = await spawnTool.execute(
      { role: 'code-developer', brief: 'build it' },
      ctx(spawnSeam({ spawnerRole: 'build-coordinator', spawnerGrant: roleGrant('build-coordinator')!, runChild })),
    );

    expect(obs.ok).toBe(true);
    const child = calls[0]!;
    // The full code-developer §4 grant — the coordinator’s thinness does NOT
    // strangle the child (this is exactly what literal intersection broke).
    expect(child.grant).toEqual(roleGrant('code-developer'));
    expect(child.grant.W).toBe('T3');
    expect(child.grant.SH).toBe('T2');
  });

  it('refuses a cross-layer (out-of-chart) child — runChild never runs', async () => {
    const { runChild, calls } = recordingRunChild();
    const obs = await spawnTool.execute(
      { role: 'devops', brief: 'deploy' },
      ctx(spawnSeam({ spawnerRole: 'research-coordinator', spawnerGrant: roleGrant('research-coordinator')!, runChild })),
    );
    expect(obs.ok).toBe(false);
    expect(obs.summary).toMatch(/out of org chart/);
    expect(calls).toHaveLength(0);
  });
});

describe('spawn — legacy intersection path (non-dispatcher SPAWN-holder, defense)', () => {
  it('runs the child with the INTERSECTED grant + incremented counts', async () => {
    const { runChild, calls } = recordingRunChild();
    const obs = await spawnTool.execute(
      { role: 'qa-testing', brief: 'run the tests' },
      ctx(spawnSeam({ spawnerGrant: roleGrant('code-developer')!, depth: 0, orchCount: 0, runChild })),
    );

    expect(obs.ok).toBe(true);
    expect(calls).toHaveLength(1);
    const child = calls[0]!;
    expect(child.role).toBe('qa-testing');
    expect(child.brief).toBe('run the tests');
    expect(child.depth).toBe(1);
    expect(child.orchCount).toBe(1);
    // child grant = code-developer ∩ qa-testing (shared caps, stricter tier).
    expect(child.grant).toEqual({ MDL: 'T0', R: 'T0', PLAN: 'T0', SH: 'T2', HO: 'T3' });
    // the spawner's W is NOT granted to a qa child (qa has no W).
    expect(child.grant.W).toBeUndefined();
    expect((obs.data as { child: { state: string } }).child.state).toBe('done');
  });
});
