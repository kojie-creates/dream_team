// grants.ts — typed encoding of the GOVERNANCE_SPEC §4 capability grant matrix
// (ADR-001 Decision 9). The grant is DATA, not engineering: encode the matrix
// once, look it up by role, and pass it AS A PARAMETER into the gate context
// (never a global) so sub-agent intersection (parent ∩ requested, §8.5) can slot
// in later without reworking the gate or loop.
//
// Slice 1 needs exactly one role: `code-developer` (the Build Layer row). The
// structure (a role → RoleGrant table) is shaped so more roles drop in as new
// rows without touching the lookup. A capability ABSENT from a role's map is
// `✗` (out-of-grant) by construction — the gate blocks it as blocked_scope.
//
// Decoupling: pure data + a lookup; no `electron`, no app imports, no I/O.

import type { Capability, RoleGrant, Tier } from './types.ts';

/**
 * GOVERNANCE_SPEC §4, "Build Layer" table, `code-developer` row:
 *
 *   | MDL | R  | W  | DEL | SH | NETr | NETw | CON | SEC | DEP | SPAWN | HO |
 *   | T0  | T0 | T3 | T2  | T2 | T2   |  ✗   |  ✗  |  ✗  |  ✗  |   ✗   | T3 |
 *
 * (Spec footnote: "code-developer is the heaviest actor: scoped writes (T3), but
 * DEL, SH, and dependency install are T2. No deploy, no secrets, no external
 * network write.") The `CON` column splits into CONr/CONw (both ✗ here); SPEND
 * is N/A for this role (absent → ✗). Omitted codes = ✗ = out-of-grant.
 */
const CODE_DEVELOPER_GRANT: RoleGrant = {
  MDL: 'T0', // call an LLM (within budget)
  R: 'T0', // read files inside the workspace
  W: 'T3', // write/edit inside the assigned src scope
  DEL: 'T2', // delete/overwrite files
  SH: 'T2', // shell (build/test/install) — slice-1 ships NO shell tool (ADR Decision 8)
  NETr: 'T2', // network read (fetch/browse)
  // NETw: ✗   external network write — not granted
  // CONr: ✗   connector read — not granted
  // CONw: ✗   connector write — not granted
  // SEC:  ✗   read secrets — not granted
  // DEP:  ✗   deploy — not granted
  // SPEND:✗   non-token spend — N/A for this role
  // SPAWN:✗   sub-agent spawn — not granted
  HO: 'T3', // emit a handoff packet (intra-layer)
};

// Role → grant table. Slice 1 populates only `code-developer`; additional roles
// are added here as new rows (Decision 9: "structure it so more roles slot in").
const MATRIX: Readonly<Record<string, RoleGrant>> = {
  'code-developer': CODE_DEVELOPER_GRANT,
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
