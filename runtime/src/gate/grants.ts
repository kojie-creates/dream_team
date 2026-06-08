// grants.ts — typed encoding of the GOVERNANCE_SPEC §4 capability grant matrix
// (ADR-001 Decision 9). The grant is DATA, not engineering: encode the matrix
// once, look it up by role, and pass it AS A PARAMETER into the gate context
// (never a global) so sub-agent intersection (parent ∩ requested, §8.5) can slot
// in later without reworking the gate or loop.
//
// This is the FULL §4 matrix — all 24 roles the spec tabulates, grouped by layer
// exactly as §4 presents them. A capability ABSENT from a role's map is `✗`
// (out-of-grant) by construction — the gate blocks it as blocked_scope before any
// tier eval (§6). So each row lists ONLY the capabilities the role actually holds;
// every omission is a deliberate `✗`.
//
// Encoding rules applied to the §4 tables:
//   - The `CONr/w` cell "T2 / T1" → { CONr: 'T2', CONw: 'T1' }; a single `✗` → both omitted.
//   - A column absent from a layer's sub-table is `✗` for every role in it
//     (e.g. the Build table has no SPEND column → SPEND ✗ for all Build roles).
//   - T1 cells (devops DEP/SEC/SPEND/CONw, community-manager COMM/CONw, …) still
//     require a standing grant AND per-action approval at the gate (§6); the tier
//     here is only the role's CEILING, not a standing authorization.
//
// Decoupling: pure data + a lookup; no `electron`, no app imports, no I/O.

import type { Capability, RoleGrant, Tier } from './types.ts';

// Role → grant table, grouped by §4 layer. Order mirrors the spec for auditability
// (Decision 9 / "org legibility": a reviewer reads access policy straight down).
const MATRIX: Readonly<Record<string, RoleGrant>> = {
  // ── Orchestrator & Coordinators (routing — no execution tools) ──────────────
  // Power is SPAWN + HO, both T2 (assignment is the authorization surface).
  'central-orchestrator': { MDL: 'T0', R: 'T0', SPAWN: 'T2', HO: 'T2' },
  'research-coordinator': { MDL: 'T0', R: 'T0', SPAWN: 'T2', HO: 'T2' },
  'build-coordinator': { MDL: 'T0', R: 'T0', SPAWN: 'T2', HO: 'T2' },
  'operate-coordinator': { MDL: 'T0', R: 'T0', SPAWN: 'T2', HO: 'T2' },
  'distribution-coordinator': { MDL: 'T0', R: 'T0', SPAWN: 'T2', HO: 'T2' },
  'learning-coordinator': { MDL: 'T0', R: 'T0', SPAWN: 'T2', HO: 'T2' }, // HO gated upstream

  // ── Build Layer (the primary executors) ─────────────────────────────────────
  'architect': { MDL: 'T0', R: 'T0', W: 'T3', NETr: 'T2', HO: 'T3' }, // design/ADR
  'ux-designer': { MDL: 'T0', R: 'T0', W: 'T3', NETr: 'T2', HO: 'T3' }, // design
  // code-developer is the heaviest Build actor: scoped writes (T3), DEL/SH/install
  // at T2, no deploy/secrets/external-net-write. (Reviewed verbatim since slice 1.)
  'code-developer': { MDL: 'T0', R: 'T0', W: 'T3', DEL: 'T2', SH: 'T2', NETr: 'T2', HO: 'T3' },
  'qa-testing': { MDL: 'T0', R: 'T0', SH: 'T2', HO: 'T3' }, // runs tests; read-only on src
  'truth-agent': { MDL: 'T0', R: 'T0', W: 'T3', HO: 'T3' }, // verdict/witness only

  // ── Operate Layer (highest-risk — holds the T1 production-reach caps) ────────
  'devops': { MDL: 'T0', R: 'T0', W: 'T3', DEL: 'T2', SH: 'T2', NETr: 'T2', NETw: 'T2', CONr: 'T2', CONw: 'T1', SEC: 'T1', DEP: 'T1', SPEND: 'T1', HO: 'T3' },
  'data-pipeline': { MDL: 'T0', R: 'T0', W: 'T3', DEL: 'T2', SH: 'T2', NETr: 'T2', NETw: 'T2', CONr: 'T2', CONw: 'T1', SEC: 'T2', DEP: 'T2', SPEND: 'T2', HO: 'T3' },
  'security': { MDL: 'T0', R: 'T0', W: 'T3', SH: 'T2', NETr: 'T2', CONr: 'T2', SEC: 'T1', HO: 'T3' }, // SEC is read-only audit
  'performance-optimization': { MDL: 'T0', R: 'T0', W: 'T3', SH: 'T2', NETr: 'T2', CONr: 'T2', SPEND: 'T2', HO: 'T3' },

  // ── Distribution Layer (external-communication risk) ─────────────────────────
  'marketing-strategy': { MDL: 'T0', R: 'T0', W: 'T3', NETr: 'T2', HO: 'T3' }, // plans
  'content-creation': { MDL: 'T0', R: 'T0', W: 'T3', NETr: 'T2', HO: 'T3' }, // content
  'sales-enablement': { MDL: 'T0', R: 'T0', W: 'T3', NETr: 'T2', HO: 'T3' }, // collateral
  // Only community-manager reaches the outside world; COMM + connector-write are T1.
  'community-manager': { MDL: 'T0', R: 'T0', W: 'T3', NETr: 'T2', NETw: 'T2', CONr: 'T2', CONw: 'T1', COMM: 'T1', HO: 'T3' },

  // ── Learning Layer (read-and-recommend; every HO gated upstream at T2) ───────
  'analytics': { MDL: 'T0', R: 'T0', W: 'T3', CONr: 'T2', HO: 'T2' }, // specs; DB read
  'customer-insight': { MDL: 'T0', R: 'T0', W: 'T3', NETr: 'T2', HO: 'T2' },
  // experimentation's flag writes are T2 (a narrower write than its T3 spec write);
  // the spec tabulates only the W column here, so the ceiling encoded is W:T3.
  'experimentation': { MDL: 'T0', R: 'T0', W: 'T3', CONr: 'T2', HO: 'T2' },
  'strategy-advisor': { MDL: 'T0', R: 'T0', W: 'T3', HO: 'T2' },

  // ── Packager ─────────────────────────────────────────────────────────────────
  'distribution-packager': { MDL: 'T0', R: 'T0', W: 'T3', SH: 'T2', HO: 'T3' }, // builds dist/
};

/**
 * Look up a role's standing capability grant from the §4 matrix. Returns
 * `undefined` for an unknown role — the caller (loop construction) treats an
 * unknown role as a configuration error (fail-closed; ADR §4), it must NOT
 * default to a permissive grant.
 */
export function roleGrant(role: string): RoleGrant | undefined {
  return MATRIX[role];
}

// Re-export for callers that only need the shape (keeps grants.ts the single
// import site for "the matrix").
export type { Capability, RoleGrant, Tier };
