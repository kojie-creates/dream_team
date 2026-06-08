// Gate types (ADR-001 Decision 2, reconciled by Decision 2a: NO nonce).
//
// T0 needed ONLY the GateDecision union so the harness `fakeGate` could return
// scripted decisions of the correct shape. T2 adds the gate's INPUT types
// (GateAction / GateContext / RoleGrant / ApprovalSet) alongside the verdict
// union, copied verbatim from ADR Decision 2 minus the removed `nonce`. The pure
// `gate()` function itself lives in gate.ts; the matrix encoding in grants.ts.

import type { WorkspaceBoundary } from './workspace.ts';

export type Tier = 'T0' | 'T1' | 'T2' | 'T3';

// The 15 capability codes (GOVERNANCE_SPEC §2). The gate checks an action's
// capability against the role's grant before any tier/policy evaluation.
export type Capability =
  | 'MDL' // call an LLM (within budget)
  | 'R' // read files inside the workspace
  | 'W' // write/edit files inside the assigned path scope
  | 'DEL' // delete/overwrite files
  | 'SH' // execute shell commands in the sandbox
  | 'NETr' // network read (GET / browse)
  | 'NETw' // network write (external API POST/PUT)
  | 'CONr' // connector read
  | 'CONw' // connector write
  | 'SEC' // read secrets / credentials
  | 'DEP' // deploy to an environment
  | 'SPEND' // incur cost beyond model tokens
  | 'COMM' // send external communication
  | 'SPAWN' // instantiate a sub-agent
  | 'HO'; // emit a handoff packet

export type GateDecision =
  | { verdict: 'permit'; effectiveTier: Tier }
  | { verdict: 'blocked_with_path'; missing: string; effectiveTier: 'T2' }
  | { verdict: 'blocked_hard'; reason: string; effectiveTier: 'T1' }
  | { verdict: 'blocked_scope'; reason: string }; // out-of-grant, any tier

/**
 * What the model wants to do, as the loop presents it to the gate (ADR Decision
 * 2). `resolvedPath` is the canonicalized target from resolveWorkspace() for
 * path-bearing tools, or null. `actionTier` is the tier of the action CLASS
 * (GOVERNANCE_SPEC §5). NO `nonce` (Decision 2a: in-process synchronous gate).
 */
export interface GateAction {
  capability: Capability;
  resolvedPath: string | null;
  actionTier: Tier;
}

/**
 * A role's standing capability grant: the MAX tier the role may exercise each
 * capability at (GOVERNANCE_SPEC §4 matrix). A capability ABSENT from the map is
 * out-of-grant (`✗` in the matrix) → the gate blocks it as `blocked_scope`
 * before any tier/policy eval (§6 "in capability grant? no → BLOCK").
 */
export type RoleGrant = Partial<Record<Capability, Tier>>;

/**
 * The two ingredients a T1 action needs (GOVERNANCE_SPEC §6, §8.1, §8.4):
 *   - `standing`: capabilities the operator has explicitly turned ON for this run
 *     (the per-project signed grant record; OFF by default per §8.1).
 *   - `perAction`: per-action human approvals already collected (the §8.4 prompt:
 *     "Allow Once" / "Allow for session"), scoped to the exact capability + path.
 * A T1 action permits ONLY if BOTH are present (§6: "standing grant AND human
 * approval"). T2/T3 do not consult this set. Membership is matched by
 * `approvalKey(capability, resolvedPath)`.
 */
export interface ApprovalSet {
  standing: ReadonlySet<Capability>;
  perAction: ReadonlySet<string>;
}

/** Everything the pure gate needs besides the action itself (ADR Decision 2). */
export interface GateContext {
  role: string; // e.g. 'code-developer'
  grant: RoleGrant; // the role's capability→max-tier map (from grants.ts)
  approvals: ApprovalSet; // standing grants + per-action T1 approvals
  boundary: WorkspaceBoundary;
}

/**
 * Canonical key for a per-action T1 approval, so the loop and the gate agree on
 * how a collected approval matches an action. Capability + the canonical path
 * the approval was granted for (or `*` for path-less actions).
 */
export function approvalKey(capability: Capability, resolvedPath: string | null): string {
  return `${capability}:${resolvedPath ?? '*'}`;
}
