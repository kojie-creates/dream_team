// intersectGrants — the sub-agent grant-inheritance rule (GOVERNANCE_SPEC §8.5):
// a spawned agent's grant = parent grant ∩ requested grant, NEVER a superset.
// "No capability the parent lacks, no tier higher than the parent holds."
//
// Implementation: a capability is in the child grant ONLY if it is in BOTH the
// parent's grant and the requested role's grant; its tier is the STRICTER (more
// gated) of the two (so the child is gated at least as hard as either side, and
// can never exceed the parent). A capability the parent lacks is dropped → the
// child cannot do anything the parent could not. This is the load-bearing safety
// primitive behind the spawn tool: it makes privilege escalation structurally
// impossible (an over-broad request is silently narrowed, not honored).
//
// Pure data → no electron, no I/O. Reuses the gate's tier strictness ordering.

import { stricterTier } from './gate.ts';
import type { Capability, RoleGrant } from './types.ts';

/**
 * The child grant = parent ∩ requested (§8.5). For every capability present in
 * BOTH maps, the child holds it at the stricter of the two tiers; every other
 * capability is absent (= out-of-grant). The result is never a superset of either
 * input — a child can hold no capability its parent lacks, at no tier above the
 * parent's.
 */
export function intersectGrants(parent: RoleGrant, requested: RoleGrant): RoleGrant {
  const child: RoleGrant = {};
  for (const cap of Object.keys(requested) as Capability[]) {
    const reqTier = requested[cap];
    const parentTier = parent[cap];
    // Drop any capability the parent does not hold (no escalation).
    if (reqTier === undefined || parentTier === undefined) continue;
    child[cap] = stricterTier(parentTier, reqTier);
  }
  return child;
}
