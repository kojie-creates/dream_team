// spawn — the sub-agent dispatch tool (GOVERNANCE_SPEC §8.5, loop-termination
// contract). A parent that holds the SPAWN grant (coordinators/orchestrator)
// launches a CHILD governed run for a requested role. The child's grant is
// parent ∩ requested (intersectGrants) — privilege escalation is structurally
// impossible. Recursion is bounded twice: spawn depth ≤ 3, and the shared
// orchestration counter (threaded child←parent, never reset) ≤ 15.
//
// Static declaration (Decision 5): capability 'SPAWN', actionTier 'T2'. The LOOP
// gates SPAWN against the spawner's grant before execute() runs — a role without
// SPAWN never reaches here (blocked_scope). Inside, execute() enforces the depth
// and orchestration caps (a request past either is refused, never run).
//
// The actual child run is INJECTED via ctx.spawn.runChild (DI) so this tool does
// not import the loop — the composition root supplies a runChild that re-enters
// runLoop with the child role/grant and incremented depth/count.
//
// Decoupling: no electron, no app imports, no loop import.

import type { ToolDef, ToolExecContext, ToolObservation } from './types.ts';
import type { RoleGrant } from '../gate/types.ts';
import { roleGrant } from '../gate/grants.ts';
import { intersectGrants } from '../gate/intersect.ts';

/** §8.5 spawn-depth cap. */
export const MAX_SPAWN_DEPTH = 3;
/** loop-termination contract: the shared routing-chain cap (never reset). */
export const MAX_ORCHESTRATION_ITERATIONS = 15;

/** What a finished child run reports back to the parent. */
export interface ChildRunSummary {
  role: string;
  state: string;
  iterations: number;
  costUsd: number;
}

/** What the spawn tool hands the injected child runner. */
export interface SpawnChildInput {
  role: string;
  grant: RoleGrant;
  brief: string;
  depth: number;
  orchCount: number;
}

/** Injected child runner (composition root): re-enters the governed loop. */
export type RunChildFn = (input: SpawnChildInput) => Promise<ChildRunSummary>;

/** The spawn seam in the tool context — the spawner's identity + caps + runner. */
export interface SpawnContext {
  spawnerRole: string;
  spawnerGrant: RoleGrant;
  depth: number;
  orchCount: number;
  runChild: RunChildFn;
}

/** spawn input: which role to dispatch + the brief for the child. */
export interface SpawnInput {
  role: string;
  brief: string;
}

export const spawnTool: ToolDef<SpawnInput> = {
  name: 'spawn',
  capability: 'SPAWN',
  actionTier: 'T2',
  inputSchema: {
    type: 'object',
    properties: {
      role: { type: 'string', description: 'The specialist role to dispatch (e.g. code-developer).' },
      brief: { type: 'string', description: 'The work brief for the spawned sub-agent.' },
    },
    required: ['role', 'brief'],
    additionalProperties: false,
  },
  async execute(input: SpawnInput, ctx: ToolExecContext): Promise<ToolObservation> {
    const spawn = ctx.spawn;
    if (!spawn) return fail('spawn is not available in this run');
    if (typeof input.role !== 'string' || input.role.trim() === '') return fail('spawn requires a role');
    if (typeof input.brief !== 'string' || input.brief.trim() === '') return fail('spawn requires a brief');

    const requested = roleGrant(input.role);
    if (!requested) return fail(`unknown role '${input.role}' (no capability grant)`);

    // Hard caps (§8.5 + loop-termination contract). A request past either is
    // refused — the child is NOT run.
    if (spawn.depth + 1 > MAX_SPAWN_DEPTH) {
      return fail(`spawn depth cap (${MAX_SPAWN_DEPTH}) exceeded`);
    }
    if (spawn.orchCount + 1 >= MAX_ORCHESTRATION_ITERATIONS) {
      return fail('orchestration iteration limit reached');
    }

    // §8.5: child grant = parent ∩ requested. Escalation is impossible — any
    // capability the spawner lacks is dropped here, silently narrowing the child.
    const childGrant = intersectGrants(spawn.spawnerGrant, requested);

    const summary = await spawn.runChild({
      role: input.role,
      grant: childGrant,
      brief: input.brief,
      depth: spawn.depth + 1,
      orchCount: spawn.orchCount + 1,
    });

    return {
      ok: true,
      summary: `spawned ${summary.role} → ${summary.state} (${summary.iterations} iter, $${summary.costUsd.toFixed(4)})`,
      data: { child: summary, childGrant },
    };
  },
};

function fail(detail: string): ToolObservation {
  return { ok: false, is_error: true, summary: `execution_error: ${detail}` };
}
