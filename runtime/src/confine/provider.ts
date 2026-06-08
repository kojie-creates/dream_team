// ConfinementProvider — the confinement seam (ADR-001 Decision 8).
//
// The runtime exposes a single ConfinementProvider interface so the SAME tool
// runs against a software boundary (no-shell roles, slice 1) or an OS boundary
// (shell roles, later) WITHOUT the loop knowing which. `workspaceRoot()` is the
// realpath'd boundary and is the SOURCE OF TRUTH for containment — its value
// comes from the app's workspace record, never inferred by the runtime (§3
// confinement↔app seam).
//
// SLICE-1 SCOPE (HARD LINE — Decision 8 / §4.1): this file ships the `software`
// provider ONLY. `exec` exists on the interface for the future `os` provider but
// is ABSENT on the software provider — there is NO shell/exec in slice 1. Do not
// add one here; enabling `SH` requires the `os` provider (a separate task).
//
// Decoupling: no `electron`, no app imports, no I/O beyond holding a realpath'd
// string handed in at construction.

/** Result of an `os`-provider command execution (reserved; not used in slice 1). */
export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * The confinement seam (ADR Decision 8). `kind` discriminates the boundary
 * mechanism; `workspaceRoot()` returns the realpath'd root used for containment.
 * `exec` is present ONLY when `kind === 'os'` (runs inside the isolated
 * user/container); for `kind === 'software'` it is absent — there is no shell in
 * slice-1 software confinement.
 */
export interface ConfinementProvider {
  kind: 'software' | 'os';
  /** Realpath'd absolute workspace root (Decision 8 SOURCE OF TRUTH). */
  workspaceRoot(): string;
  /** Present only for `kind === 'os'`. Not implemented in slice 1. */
  exec?(cmd: string, args: string[]): Promise<ExecResult>;
}

/**
 * Construct the slice-1 software ConfinementProvider over an already-realpath'd
 * workspace root. The root is the app workspace record's path, realpath'd once at
 * run start (§3 seam) — this factory does NOT realpath or touch the filesystem;
 * it only closes over the canonical value. No `exec` is exposed (no shell in
 * slice 1, Decision 8 hard line).
 */
export function softwareConfinement(workspaceRoot: string): ConfinementProvider {
  return {
    kind: 'software',
    workspaceRoot(): string {
      return workspaceRoot;
    },
  };
}
