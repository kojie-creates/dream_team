// Tests for the set_plan tool (planner slice): a valid plan is echoed back as
// state, and malformed plans are rejected (execution_error) rather than silently
// accepted. No side effects — execute() is pure validation.

import { describe, it, expect } from 'vitest';
import { setPlanTool, type SetPlanInput, type Plan } from '../../src/tools/plan.ts';
import type { ToolExecContext } from '../../src/tools/types.ts';

const ctx: ToolExecContext = { boundary: { workspaceRoot: '/ws', readAllowlist: [] } };

const goodPlan: SetPlanInput = {
  goal: 'build a json validator CLI',
  steps: [
    { id: 1, description: 'write the schema parser', tool: 'write_file', status: 'done' },
    { id: 2, description: 'write the CLI entrypoint', tool: 'write_file', status: 'in_progress' },
    { id: 3, description: 'run the tests', tool: 'shell', status: 'pending' },
  ],
};

describe('set_plan — declaration', () => {
  it('is PLAN / T0 with no pathArg', () => {
    expect(setPlanTool.capability).toBe('PLAN');
    expect(setPlanTool.actionTier).toBe('T0');
    expect(setPlanTool.pathArg).toBeUndefined();
  });
});

describe('set_plan — valid plan', () => {
  it('echoes the validated plan and summarizes status counts', async () => {
    const obs = await setPlanTool.execute(goodPlan, ctx);
    expect(obs.ok).toBe(true);
    expect(obs.is_error).toBeUndefined();
    expect(obs.summary).toMatch(/plan: 3 step\(s\)/);
    expect(obs.summary).toMatch(/1 done/);
    expect(obs.summary).toMatch(/1 in_progress/);
    expect(obs.summary).toMatch(/1 pending/);
    const plan = (obs.data as { plan: Plan }).plan;
    expect(plan.goal).toBe('build a json validator CLI');
    expect(plan.steps.map((s) => s.id)).toEqual([1, 2, 3]);
    expect(plan.steps[0]!.tool).toBe('write_file');
  });

  it('drops an absent tool field rather than carrying undefined', async () => {
    const obs = await setPlanTool.execute(
      { goal: 'g', steps: [{ id: 1, description: 'do', status: 'pending' }] },
      ctx,
    );
    const plan = (obs.data as { plan: Plan }).plan;
    expect('tool' in plan.steps[0]!).toBe(false);
  });
});

describe('set_plan — rejects malformed plans (execution_error, no silent accept)', () => {
  const bad: Array<[string, SetPlanInput]> = [
    ['empty goal', { goal: '  ', steps: [{ id: 1, description: 'x', status: 'pending' }] }],
    ['no steps', { goal: 'g', steps: [] }],
    ['non-numeric id', { goal: 'g', steps: [{ id: 'a' as unknown as number, description: 'x', status: 'pending' }] }],
    ['duplicate id', { goal: 'g', steps: [
      { id: 1, description: 'a', status: 'pending' },
      { id: 1, description: 'b', status: 'pending' },
    ] }],
    ['empty description', { goal: 'g', steps: [{ id: 1, description: '', status: 'pending' }] }],
    ['bad status', { goal: 'g', steps: [{ id: 1, description: 'x', status: 'wat' as unknown as 'pending' }] }],
  ];
  it.each(bad)('rejects: %s', async (_label, input) => {
    const obs = await setPlanTool.execute(input, ctx);
    expect(obs.ok).toBe(false);
    expect(obs.is_error).toBe(true);
    expect(obs.summary).toMatch(/execution_error/);
  });
});
