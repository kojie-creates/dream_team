// ToolDef / ToolObservation — the tool interface contract (ADR-001 Decision 5).
//
// Every tool is a module implementing a fixed interface. The LOOP, not the tool,
// calls the gate: a tool DECLARES its `capability` and `actionTier` statically
// (what makes the trace assertion and grant intersection mechanical) but never
// decides whether it may run. By the time `execute()` is called, the loop has
// already guaranteed a gate-permit (Decision 5: "pure of governance").
//
// "Pure of governance" is NOT "pure of confinement reality": a path-bearing
// write/delete tool still owns the filesystem open-once TOCTOU rule (Decision
// 2a.4) inside its own `execute()`. To re-assert containment on the opened
// object WITHOUT re-deriving the root, `execute()` is handed the run's
// `WorkspaceBoundary` via `ToolExecContext` (the §3 confinement↔app seam).
//
// Decoupling: no `electron`, no app imports.

import type { Capability, Tier } from '../gate/types.ts';
import type { WorkspaceBoundary } from '../gate/workspace.ts';
import type { ConfinementProvider } from '../confine/provider.ts';

/**
 * Minimal JSON-Schema shape surfaced to the model in `tools[]`. Slice 1 only
 * needs an object schema; this is intentionally loose (the SDK accepts a plain
 * JSON Schema object) rather than pulling a schema library into the contract.
 */
export type JSONSchema = Record<string, unknown>;

/**
 * Everything `execute()` may touch besides its typed `input` (ADR Decision 2a.4).
 * Confinement is enforced before `execute` runs; the tool reaches outside neither
 * `input` nor `ctx`. `boundary` lets the tool re-assert containment on the OPENED
 * object without re-deriving the workspace root.
 */
export interface ToolExecContext {
  /** The run's confinement boundary (realpath'd root); SOURCE OF TRUTH for the open-once re-check. */
  boundary: WorkspaceBoundary;
  /**
   * The run's confinement provider (Decision 8). Shell-class tools REQUIRE
   * `confine.kind === 'os'` and run via `confine.exec()`; path tools (write_file)
   * ignore it and use `boundary`. Optional so non-shell ctx construction (and the
   * test harness) needn't supply it — a shell tool refuses when it is absent.
   */
  confine?: ConfinementProvider;
  /**
   * TEST-ONLY race-window seam (Decision 2a.5). If present, `execute()` awaits it
   * AFTER resolveWorkspace() returns ok but BEFORE opening the handle, so a test
   * can deterministically swap a path component for a symlink/junction at the
   * exact TOCTOU race point. Production code leaves this undefined — it is never
   * set on a real run.
   */
  afterResolveBeforeOpen?: () => void | Promise<void>;
}

/**
 * What a tool returns to the loop, which the loop forwards to the model as
 * `tool_result` content (ADR Decision 5). `ok:false` with `is_error:true` is the
 * confinement/reality failure path (maps to `execution_error` per Decision 2a.4).
 */
export interface ToolObservation {
  ok: boolean;
  /** Short, model-readable summary used as tool_result content + trace observation_summary. */
  summary: string;
  data?: unknown;
  is_error?: boolean;
}

/**
 * A tool module (ADR Decision 5). Declares its capability/action-tier statically;
 * does NOT call the gate. `pathArg` names the input field (if any) that is a
 * workspace path → the loop runs resolveWorkspace() on it before gating.
 */
export interface ToolDef<I = unknown> {
  name: string;
  capability: Capability; // what the gate checks
  actionTier: Tier; // action-class tier (GOVERNANCE_SPEC §5)
  inputSchema: JSONSchema; // surfaced to the model in tools[]
  /** Which input field is a workspace path (drives resolveWorkspace()), if any. */
  pathArg?: keyof I;
  /** Pure of governance: the loop guarantees gate-permit before this runs. */
  execute(input: I, ctx: ToolExecContext): Promise<ToolObservation>;
}
