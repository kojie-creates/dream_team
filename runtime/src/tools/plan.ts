// set_plan — the planner tool (the "plan-as-tool" slice). Lets a specialist turn
// a goal into an explicit, tracked step list and REVISE it as work proceeds. It
// is the single mechanism that makes the loop goal-directed instead of reactive.
//
// Static declaration (Decision 5): capability 'PLAN', actionTier 'T0', no pathArg.
// PLAN is internal cognition — no filesystem/network/exec side effect — so it is
// T0 (permitted within budget for every role that holds the grant). The tool is
// idempotent over the FULL plan: the model calls it to CREATE the plan and again
// to UPDATE step statuses or REPLAN (add/replace steps). The loop captures the
// latest plan into the run result; each call is traced like any tool.
//
// The tool has no external effect: execute() validates the submitted plan and
// echoes it back as the observation (so the model sees its own current plan in
// the next turn) — the loop reads observation.data.plan to track run state.
//
// Decoupling: no electron, no app imports, no I/O. Pure validation.

import type { ToolDef, ToolExecContext, ToolObservation } from './types.ts';

/** Lifecycle of one plan step. */
export type PlanStepStatus = 'pending' | 'in_progress' | 'done' | 'failed' | 'skipped';

const STATUSES: ReadonlySet<string> = new Set<PlanStepStatus>([
  'pending', 'in_progress', 'done', 'failed', 'skipped',
]);

/** One step in a plan. `tool` optionally names the tool the step expects to use. */
export interface PlanStep {
  id: number;
  description: string;
  tool?: string;
  status: PlanStepStatus;
}

/** A goal decomposed into ordered, status-tracked steps. */
export interface Plan {
  goal: string;
  steps: PlanStep[];
}

/** set_plan input == the full current plan (create / update / replan). */
export interface SetPlanInput {
  goal: string;
  steps: PlanStep[];
}

export const setPlanTool: ToolDef<SetPlanInput> = {
  name: 'set_plan',
  capability: 'PLAN',
  actionTier: 'T0',
  inputSchema: {
    type: 'object',
    properties: {
      goal: { type: 'string', description: 'The overall goal this plan pursues.' },
      steps: {
        type: 'array',
        description:
          'Ordered steps. Re-submit the WHOLE plan each call to update statuses or revise (replan).',
        items: {
          type: 'object',
          properties: {
            id: { type: 'number', description: 'Stable step number (keep ids stable across updates).' },
            description: { type: 'string', description: 'What this step does.' },
            tool: { type: 'string', description: 'Optional: the tool this step expects to use.' },
            status: {
              type: 'string',
              enum: ['pending', 'in_progress', 'done', 'failed', 'skipped'],
              description: 'Current status of this step.',
            },
          },
          required: ['id', 'description', 'status'],
          additionalProperties: false,
        },
      },
    },
    required: ['goal', 'steps'],
    additionalProperties: false,
  },
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async execute(input: SetPlanInput, _ctx: ToolExecContext): Promise<ToolObservation> {
    const plan = validatePlan(input);
    if (!plan.ok) return { ok: false, is_error: true, summary: `execution_error: ${plan.reason}` };
    return {
      ok: true,
      summary: summarize(plan.plan),
      data: { plan: plan.plan },
    };
  },
};

type Validated = { ok: true; plan: Plan } | { ok: false; reason: string };

/** Defensive validation — the model can send anything; a bad plan is an error, not silent. */
function validatePlan(input: SetPlanInput): Validated {
  if (typeof input?.goal !== 'string' || input.goal.trim() === '') {
    return { ok: false, reason: 'plan goal must be a non-empty string' };
  }
  if (!Array.isArray(input.steps) || input.steps.length === 0) {
    return { ok: false, reason: 'plan must have at least one step' };
  }
  const steps: PlanStep[] = [];
  const seen = new Set<number>();
  for (const [i, s] of input.steps.entries()) {
    if (typeof s?.id !== 'number' || !Number.isFinite(s.id)) {
      return { ok: false, reason: `step ${i} has no numeric id` };
    }
    if (seen.has(s.id)) return { ok: false, reason: `duplicate step id ${s.id}` };
    seen.add(s.id);
    if (typeof s.description !== 'string' || s.description.trim() === '') {
      return { ok: false, reason: `step ${s.id} has no description` };
    }
    if (!STATUSES.has(s.status)) {
      return { ok: false, reason: `step ${s.id} has invalid status '${s.status}'` };
    }
    if (s.tool !== undefined && typeof s.tool !== 'string') {
      return { ok: false, reason: `step ${s.id} tool must be a string` };
    }
    steps.push({ id: s.id, description: s.description, status: s.status, ...(s.tool ? { tool: s.tool } : {}) });
  }
  return { ok: true, plan: { goal: input.goal, steps } };
}

/** Compact one-line summary for the tool_result + trace observation. */
function summarize(plan: Plan): string {
  const by = (st: PlanStepStatus) => plan.steps.filter((s) => s.status === st).length;
  const parts = (['done', 'in_progress', 'pending', 'failed', 'skipped'] as PlanStepStatus[])
    .map((st) => [st, by(st)] as const)
    .filter(([, n]) => n > 0)
    .map(([st, n]) => `${n} ${st}`);
  return `plan: ${plan.steps.length} step(s) — ${parts.join(', ')}`;
}
