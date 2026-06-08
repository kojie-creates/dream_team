// gate() — the pure tier × grant × approval decision function (ADR-001 Decision 2).
//
// Implements GOVERNANCE_SPEC §6 decision flow EXACTLY:
//   1. capability not in the role's grant → blocked_scope (§6 "in grant? no → BLOCK")
//   2. effective tier = STRICTER of (action tier, role's max tier for that
//      capability) — GOVERNANCE_SPEC §5 "the stricter of (action tier, role's max
//      tier for that capability) wins."
//   3. T0 → permit (no gate; §3. The loop short-circuits T0 before calling gate,
//      but gate must still answer correctly if called.)
//   4. T3 → permit (gate-lite: auto-permit if within grant; §3/§6).
//   5. T2 → permit if grant + policy satisfied, else blocked_with_path carrying
//      what's missing (§6 BLOCKED_WITH_PATH).
//   6. T1 → permit ONLY with standing grant AND per-action approval, else
//      blocked_hard (§6 BLOCKED_HARD).
//
// TOTAL and SYNCHRONOUS: no I/O, no awaits, no clock, no randomness. A pure
// function over (action, ctx). This is what makes it fully table-testable over
// the grant matrix with zero filesystem (ADR Decision 2; ADR §4 fail-closed).
//
// Decoupling: no `electron`, no app imports. Types only from this gate module.

import type { GateAction, GateContext, GateDecision, Tier } from './types.ts';
import { approvalKey } from './types.ts';

// Strictness ordering (GOVERNANCE_SPEC §3): T0 cheapest/ungated → T1 highest
// consequence/hard-gated. The STRICTER tier is the one with the higher rank.
const TIER_RANK: Record<Tier, number> = { T0: 0, T3: 1, T2: 2, T1: 3 };

/** The stricter (higher-consequence, more-gated) of two tiers. Shared with the
 * sub-agent grant intersection (§8.5: a child is gated at least as strictly as
 * its parent for any shared capability). */
export function stricterTier(a: Tier, b: Tier): Tier {
  return TIER_RANK[a] >= TIER_RANK[b] ? a : b;
}

/**
 * Decide whether `action` is permitted for the role described by `ctx`. Pure:
 * fail-closed, synchronous, deterministic. The loop must call resolveWorkspace()
 * first and pass the canonical path in `action.resolvedPath` — gate never touches
 * the filesystem.
 */
export function gate(action: GateAction, ctx: GateContext): GateDecision {
  const { capability } = action;
  const grantedMax = ctx.grant[capability];

  // §6: capability not in the grant matrix (`✗`) → out-of-scope, any tier.
  if (grantedMax === undefined) {
    return {
      verdict: 'blocked_scope',
      reason: `capability ${capability} is not in the grant for role ${ctx.role}`,
    };
  }

  // §5: effective tier = stricter of (action tier, role's max tier).
  const effectiveTier = stricterTier(action.actionTier, grantedMax);

  switch (effectiveTier) {
    case 'T0':
      // §3: no gate — cheap, reversible, in-scope. Permit (loop short-circuits
      // this in practice, but the gate answers correctly regardless).
      return { verdict: 'permit', effectiveTier: 'T0' };

    case 'T3':
      // §6: gate-lite — in-grant (already confirmed above) → permit.
      return { verdict: 'permit', effectiveTier: 'T3' };

    case 'T2': {
      // §6: permit if grant + policy satisfied; else blocked_with_path. The
      // slice-1 T2 policy is workspace containment: a path-bearing action must
      // carry a resolved (in-boundary) path. resolveWorkspace() already proved
      // containment upstream, so a present resolvedPath == policy satisfied; a
      // null path on a path-bearing T2 action == prerequisite missing.
      if (action.resolvedPath === null && isPathBearing(capability)) {
        return {
          verdict: 'blocked_with_path',
          effectiveTier: 'T2',
          missing:
            `${capability} at T2 requires a workspace-resolved target path; ` +
            'request scope inside the assigned workspace path',
        };
      }
      return { verdict: 'permit', effectiveTier: 'T2' };
    }

    case 'T1': {
      // §6: permit ONLY with standing grant AND per-action human approval.
      const hasStanding = ctx.approvals.standing.has(capability);
      const hasApproval = ctx.approvals.perAction.has(
        approvalKey(capability, action.resolvedPath),
      );
      if (hasStanding && hasApproval) {
        return { verdict: 'permit', effectiveTier: 'T1' };
      }
      const missingPart = !hasStanding
        ? 'no standing grant (operator has not enabled this capability for the run)'
        : 'no per-action human approval';
      return {
        verdict: 'blocked_hard',
        effectiveTier: 'T1',
        reason: `${capability} requires human approval for this action class: ${missingPart}`,
      };
    }
  }
}

/**
 * Whether a capability's actions carry a workspace path (drives the T2 policy
 * check above). The file/delete capabilities are path-bearing; network, model,
 * connector, handoff, etc. are not.
 */
function isPathBearing(capability: GateAction['capability']): boolean {
  return capability === 'W' || capability === 'DEL' || capability === 'R';
}
