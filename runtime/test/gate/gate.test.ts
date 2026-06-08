// T2 — table-driven tests for the pure gate() decision function + grants.ts matrix
// (ADR-001 Decision 2 / Decision 9; GOVERNANCE_SPEC §4/§5/§6).
//
// Covers the done-criterion cases over the code-developer grant matrix:
//   - T0 bypass → permit
//   - T3-in-grant (W) → permit
//   - T2 (DEL/SH) with policy unmet → blocked_with_path
//   - T1 (escalated action) with no approval → blocked_hard; WITH approval → permit
//   - out-of-grant (DEP/SEC/NETw) → blocked_scope
//   - the stricter-of rule (action tier vs role max tier — stricter wins)
// Plus: gate() is pure (no I/O — deterministic across repeated calls, synchronous).

import { describe, it, expect } from 'vitest';
import { gate } from '../../src/gate/gate.ts';
import { roleGrant } from '../../src/gate/grants.ts';
import {
  approvalKey,
  type ApprovalSet,
  type Capability,
  type GateAction,
  type GateContext,
  type RoleGrant,
  type Tier,
} from '../../src/gate/types.ts';
import type { WorkspaceBoundary } from '../../src/gate/workspace.ts';

// ── Fixtures ────────────────────────────────────────────────────────────────

const BOUNDARY: WorkspaceBoundary = {
  workspaceRoot: '/ws/root',
  readAllowlist: [],
};

const GRANT: RoleGrant = roleGrant('code-developer')!;

/** Build a GateContext; approvals empty by default (the safe-by-default posture). */
function ctx(overrides: Partial<GateContext> = {}): GateContext {
  const emptyApprovals: ApprovalSet = {
    standing: new Set<Capability>(),
    perAction: new Set<string>(),
  };
  return {
    role: 'code-developer',
    grant: GRANT,
    approvals: emptyApprovals,
    boundary: BOUNDARY,
    ...overrides,
  };
}

function action(
  capability: Capability,
  actionTier: Tier,
  resolvedPath: string | null = null,
): GateAction {
  return { capability, actionTier, resolvedPath };
}

// ── grants.ts: the matrix encodes the §4 Build Layer code-developer row ───────

describe('grants.ts — code-developer §4 matrix encoding', () => {
  const cases: Array<[Capability, Tier | undefined]> = [
    ['MDL', 'T0'],
    ['R', 'T0'],
    ['W', 'T3'],
    ['DEL', 'T2'],
    ['SH', 'T2'],
    ['NETr', 'T2'],
    ['HO', 'T3'],
    ['NETw', undefined], // ✗
    ['CONr', undefined], // ✗
    ['CONw', undefined], // ✗
    ['SEC', undefined], // ✗
    ['DEP', undefined], // ✗
    ['SPAWN', undefined], // ✗
  ];
  it.each(cases)('grant[%s] = %s', (cap, tier) => {
    expect(GRANT[cap]).toBe(tier);
  });

  it('returns undefined for an unknown role (fail-closed, no permissive default)', () => {
    expect(roleGrant('nonexistent-role')).toBeUndefined();
  });
});

// ── grants.ts: the full §4 matrix (all 24 roles) ─────────────────────────────

describe('grants.ts — full §4 matrix', () => {
  it('encodes all 28 roles', () => {
    const roles = [
      'central-orchestrator', 'research-coordinator', 'build-coordinator',
      'operate-coordinator', 'distribution-coordinator', 'learning-coordinator',
      'research-analyst', 'market-intelligence', 'idea-generator', 'knowledge-librarian',
      'architect', 'ux-designer', 'code-developer', 'qa-testing', 'truth-agent',
      'devops', 'data-pipeline', 'security', 'performance-optimization',
      'marketing-strategy', 'content-creation', 'sales-enablement', 'community-manager',
      'analytics', 'customer-insight', 'experimentation', 'strategy-advisor',
      'distribution-packager',
    ];
    for (const r of roles) expect(roleGrant(r), r).toBeDefined();
    expect(roles).toHaveLength(28);
  });

  // Spot-checks pinning the distinctive cells of each layer.
  const spot: Array<[string, Capability, Tier | undefined]> = [
    // PLAN is universal (T0) — every role can plan (planner slice).
    ['central-orchestrator', 'PLAN', 'T0'],
    ['code-developer', 'PLAN', 'T0'],
    ['truth-agent', 'PLAN', 'T0'],
    ['distribution-packager', 'PLAN', 'T0'],
    // Coordinators: SPAWN+HO at T2, no filesystem.
    ['central-orchestrator', 'SPAWN', 'T2'],
    ['build-coordinator', 'W', undefined],
    ['learning-coordinator', 'HO', 'T2'],
    // Research: read-and-synthesize, browse-to-read, no execution/spawn.
    ['research-analyst', 'NETr', 'T2'],
    ['research-analyst', 'W', 'T3'],
    ['research-analyst', 'SPAWN', undefined], // ✗ — specialists don't spawn
    ['idea-generator', 'NETr', undefined], // ✗ — purely generative, no browse
    ['knowledge-librarian', 'W', 'T3'],
    // Build separation of duties: qa read-only on source, truth read+sign.
    ['qa-testing', 'W', undefined],
    ['qa-testing', 'SH', 'T2'],
    ['truth-agent', 'W', 'T3'],
    ['truth-agent', 'SH', undefined],
    // Operate holds the T1 production-reach caps.
    ['devops', 'DEP', 'T1'],
    ['devops', 'SEC', 'T1'],
    ['devops', 'CONw', 'T1'],
    ['devops', 'SPEND', 'T1'],
    ['data-pipeline', 'DEP', 'T2'], // pipeline deploy is T2, not T1
    ['security', 'SEC', 'T1'], // read-only audit
    ['security', 'CONw', undefined], // ✗
    ['security', 'DEP', undefined], // ✗
    ['performance-optimization', 'SPEND', 'T2'],
    ['performance-optimization', 'SEC', undefined], // ✗
    // Distribution: only community-manager reaches outside; COMM is T1.
    ['marketing-strategy', 'COMM', undefined], // ✗
    ['community-manager', 'COMM', 'T1'],
    ['community-manager', 'CONw', 'T1'],
    // Learning: read-and-recommend, HO gated upstream at T2.
    ['analytics', 'HO', 'T2'],
    ['analytics', 'CONr', 'T2'],
    ['analytics', 'NETr', undefined], // ✗ (DB read only)
    ['strategy-advisor', 'NETr', undefined], // ✗
    // Packager builds dist/ with shell, cannot deploy.
    ['distribution-packager', 'SH', 'T2'],
    ['distribution-packager', 'DEP', undefined], // ✗
  ];
  it.each(spot)('roleGrant(%s)[%s] = %s', (role, cap, tier) => {
    expect(roleGrant(role)![cap]).toBe(tier);
  });
});

// ── gate(): the §6 decision flow per tier ────────────────────────────────────

describe('gate() — T0 bypass', () => {
  it('MDL (role max T0) → permit T0', () => {
    expect(gate(action('MDL', 'T0'), ctx())).toEqual({ verdict: 'permit', effectiveTier: 'T0' });
  });
  it('R (role max T0) → permit T0', () => {
    expect(gate(action('R', 'T0', '/ws/root/f.txt'), ctx())).toEqual({
      verdict: 'permit',
      effectiveTier: 'T0',
    });
  });
});

describe('gate() — T3 in grant → permit', () => {
  it('W (role max T3) at action tier T3 → permit T3', () => {
    expect(gate(action('W', 'T3', '/ws/root/src/x.ts'), ctx())).toEqual({
      verdict: 'permit',
      effectiveTier: 'T3',
    });
  });
  it('HO (role max T3) → permit T3', () => {
    expect(gate(action('HO', 'T3'), ctx())).toEqual({ verdict: 'permit', effectiveTier: 'T3' });
  });
});

describe('gate() — T2 with policy unmet → blocked_with_path', () => {
  it('DEL at T2 with no resolved path → blocked_with_path (carries what is missing)', () => {
    const d = gate(action('DEL', 'T2', null), ctx());
    expect(d.verdict).toBe('blocked_with_path');
    if (d.verdict === 'blocked_with_path') {
      expect(d.effectiveTier).toBe('T2');
      expect(d.missing).toMatch(/DEL/);
      expect(d.missing.length).toBeGreaterThan(0);
    }
  });

  it('W escalated to T2 (write outside assigned subdir) with no path → blocked_with_path', () => {
    // action class T2 (write outside assigned path, §5) on capability W (role max
    // T3): stricter-of → T2; no resolved path → policy unmet.
    const d = gate(action('W', 'T2', null), ctx());
    expect(d.verdict).toBe('blocked_with_path');
  });

  it('DEL at T2 WITH a resolved (in-boundary) path → permit T2 (policy satisfied)', () => {
    expect(gate(action('DEL', 'T2', '/ws/root/src/old.ts'), ctx())).toEqual({
      verdict: 'permit',
      effectiveTier: 'T2',
    });
  });

  it('NETr at T2 (not path-bearing) with null path → permit T2', () => {
    expect(gate(action('NETr', 'T2', null), ctx())).toEqual({
      verdict: 'permit',
      effectiveTier: 'T2',
    });
  });
});

describe('gate() — T1 hard gate (standing grant AND per-action approval)', () => {
  // DEL is granted to code-developer at max T2; escalate the ACTION class to T1
  // (e.g. delete OUTSIDE workspace, §5) so the effective tier is T1.
  const delT1 = action('DEL', 'T1', '/ws/root/src/x.ts');

  it('no approval at all → blocked_hard', () => {
    const d = gate(delT1, ctx());
    expect(d.verdict).toBe('blocked_hard');
    if (d.verdict === 'blocked_hard') expect(d.effectiveTier).toBe('T1');
  });

  it('standing grant but NO per-action approval → blocked_hard', () => {
    const c = ctx({
      approvals: { standing: new Set<Capability>(['DEL']), perAction: new Set<string>() },
    });
    expect(gate(delT1, c).verdict).toBe('blocked_hard');
  });

  it('per-action approval but NO standing grant → blocked_hard', () => {
    const c = ctx({
      approvals: {
        standing: new Set<Capability>(),
        perAction: new Set<string>([approvalKey('DEL', '/ws/root/src/x.ts')]),
      },
    });
    expect(gate(delT1, c).verdict).toBe('blocked_hard');
  });

  it('standing grant AND matching per-action approval → permit T1', () => {
    const c = ctx({
      approvals: {
        standing: new Set<Capability>(['DEL']),
        perAction: new Set<string>([approvalKey('DEL', '/ws/root/src/x.ts')]),
      },
    });
    expect(gate(delT1, c)).toEqual({ verdict: 'permit', effectiveTier: 'T1' });
  });

  it('approval for a DIFFERENT path does not satisfy this action → blocked_hard', () => {
    const c = ctx({
      approvals: {
        standing: new Set<Capability>(['DEL']),
        perAction: new Set<string>([approvalKey('DEL', '/ws/root/src/OTHER.ts')]),
      },
    });
    expect(gate(delT1, c).verdict).toBe('blocked_hard');
  });
});

describe('gate() — out-of-grant → blocked_scope (any tier)', () => {
  const cases: Array<[Capability, Tier]> = [
    ['DEP', 'T1'],
    ['SEC', 'T1'],
    ['NETw', 'T2'],
    ['CONw', 'T1'],
    ['SPAWN', 'T2'],
  ];
  it.each(cases)('%s (action tier %s) not in grant → blocked_scope', (cap, tier) => {
    const d = gate(action(cap, tier), ctx());
    expect(d.verdict).toBe('blocked_scope');
    if (d.verdict === 'blocked_scope') expect(d.reason).toMatch(new RegExp(cap));
  });
});

describe('gate() — stricter-of (action tier, role max tier) wins (§5)', () => {
  it('action tier T0 on W (role max T3) → effective T3 (stricter = T3), not T0', () => {
    // T0 < T3 in strictness; the role can never exercise W more loosely than T3.
    expect(gate(action('W', 'T0', '/ws/root/src/x.ts'), ctx())).toEqual({
      verdict: 'permit',
      effectiveTier: 'T3',
    });
  });

  it('action tier T1 on W (role max T3) → effective T1 (stricter = T1) → hard gate', () => {
    // Action class escalates W to T1 (e.g. write OUTSIDE workspace, §5); the role
    // max T3 does NOT loosen it — stricter wins → T1 → blocked_hard without approval.
    const d = gate(action('W', 'T1', '/ws/root/x'), ctx());
    expect(d.verdict).toBe('blocked_hard');
    if (d.verdict === 'blocked_hard') expect(d.effectiveTier).toBe('T1');
  });

  it('action tier T3 on DEL (role max T2) → effective T2 (stricter = T2), not T3', () => {
    // T2 stricter than T3; DEL must stay at its role max T2 even if the action
    // class were a looser T3 → goes down the T2 path (policy applies).
    const d = gate(action('DEL', 'T3', null), ctx());
    expect(d.verdict).toBe('blocked_with_path'); // T2 path, null path → policy unmet
    if (d.verdict === 'blocked_with_path') expect(d.effectiveTier).toBe('T2');
  });
});

describe('gate() — purity (no I/O, deterministic, synchronous)', () => {
  it('returns the same decision across repeated calls (deterministic)', () => {
    const a = action('DEL', 'T2', null);
    const c = ctx();
    const first = gate(a, c);
    for (let i = 0; i < 50; i++) {
      expect(gate(a, c)).toEqual(first);
    }
  });

  it('is synchronous — returns a plain object, never a Promise', () => {
    const d = gate(action('W', 'T3', '/ws/root/src/x.ts'), ctx());
    expect(d).not.toBeInstanceOf(Promise);
    expect(typeof (d as { then?: unknown }).then).toBe('undefined');
  });

  it('does not mutate its inputs (action and ctx unchanged after the call)', () => {
    const a = action('W', 'T3', '/ws/root/src/x.ts');
    const aSnapshot = JSON.stringify(a);
    const c = ctx();
    const grantSnapshot = JSON.stringify(c.grant);
    gate(a, c);
    expect(JSON.stringify(a)).toBe(aSnapshot);
    expect(JSON.stringify(c.grant)).toBe(grantSnapshot);
  });
});
