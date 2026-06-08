// org.ts — the org-chart routing table (CLAUDE.md "Architecture") encoded as data.
// This is the STRUCTURAL half of Option A delegation: it bounds WHICH roles each
// dispatcher may instantiate. The GRANT half lives in spawn.ts — a dispatcher
// confers the child role's own §4 ceiling (roleGrant), not an intersection, since
// coordinators are intentionally thin and intersection would strangle their
// children. Together: a child runs as exactly one in-chart downstream role at that
// role's matrix grant — never cross-layer, never above the role's ceiling.
//
// Only the 6 SPAWN-holders (orchestrator + 5 coordinators, per §4) are dispatchers;
// every other role is a leaf (no SPAWN → the gate blocks spawn as blocked_scope
// before this table is even consulted). distribution-packager is a leaf the
// orchestrator may instantiate but which does not itself route (runs once, stops).
//
// Decoupling: pure data + lookups; no electron, no app imports, no I/O.

/**
 * Dispatcher role → the downstream roles it may spawn. Mirrors the CLAUDE.md
 * Architecture diagram one-for-one (auditable straight down). A role absent as a
 * KEY is not a dispatcher; a child absent from a key's array is out-of-chart for
 * that dispatcher and refused by mayRoute (cross-layer reach is impossible).
 */
export const ROUTING: Readonly<Record<string, readonly string[]>> = {
  'central-orchestrator': [
    'research-coordinator',
    'build-coordinator',
    'operate-coordinator',
    'distribution-coordinator',
    'learning-coordinator',
    'distribution-packager',
  ],
  'research-coordinator': [
    'research-analyst',
    'market-intelligence',
    'idea-generator',
    'knowledge-librarian',
  ],
  'build-coordinator': [
    'architect',
    'ux-designer',
    'code-developer',
    'qa-testing',
    'truth-agent',
  ],
  'operate-coordinator': [
    'devops',
    'data-pipeline',
    'security',
    'performance-optimization',
  ],
  'distribution-coordinator': [
    'marketing-strategy',
    'content-creation',
    'sales-enablement',
    'community-manager',
  ],
  'learning-coordinator': [
    'analytics',
    'customer-insight',
    'experimentation',
    'strategy-advisor',
  ],
};

/** A dispatcher is any role that appears as a routing key (i.e. holds SPAWN). */
export function isDispatcher(role: string): boolean {
  return Object.prototype.hasOwnProperty.call(ROUTING, role);
}

/**
 * May `spawner` instantiate `child`? True only for an in-chart edge: `spawner` is
 * a dispatcher AND `child` is in its allowed set. A non-dispatcher spawner, a
 * cross-layer child, or an orchestrator skipping a coordinator all return false.
 */
export function mayRoute(spawner: string, child: string): boolean {
  const allowed = ROUTING[spawner];
  return allowed !== undefined && allowed.includes(child);
}
