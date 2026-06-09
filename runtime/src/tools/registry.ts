// registry.ts — the per-role tool surface. A role is handed a tool IFF its §4 grant
// holds that tool's capability. The surface is therefore a pure projection of the
// capability matrix: a coordinator (grant has no W/SH) physically cannot receive
// write_file/shell, and only SPAWN-holders receive spawn. This is the second guard
// behind the gate — even if the gate were misconfigured, a coordinator never holds
// an execution tool to call. Governance intent enforced by construction.
//
// Adding a tool = register it here once; it then auto-surfaces to exactly the roles
// whose grant holds its capability. No per-role tool lists to maintain or drift.
//
// Decoupling: pure data + a filter; no electron, no app imports, no I/O.

import type { ToolDef } from './types.ts';
import { roleGrant } from '../gate/grants.ts';
import { setPlanTool } from './plan.ts';
import { writeFileTool } from './write-file.ts';
import { shellTool } from './shell.ts';
import { spawnTool } from './spawn.ts';
import { webFetchTool } from './web-fetch.ts';
import { calendarReadTool, calendarWriteTool } from './calendar.ts';
import { gmailSendTool } from './gmail.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyToolDef = ToolDef<any>;

/**
 * Every tool the runtime knows how to surface. Order here is the order a role sees
 * its tools. Each tool's `capability` is the key the projection filters on.
 */
export const ALL_TOOLS: readonly AnyToolDef[] = [
  setPlanTool,
  writeFileTool,
  shellTool,
  spawnTool,
  // Phase A capability tools — auto-surface by capability:
  webFetchTool, // NETr → research/content roles
  calendarReadTool, // CONr
  calendarWriteTool, // CONw
  gmailSendTool, // COMM → community-manager (external email)
];

/**
 * The tools a role may use: exactly those whose capability the role's §4 grant
 * holds. Throws on an unknown role (fail-closed — a missing grant is a config
 * error, never a permissive default).
 */
export function toolsForRole(role: string): AnyToolDef[] {
  const grant = roleGrant(role);
  if (!grant) throw new Error(`unknown role '${role}' (no capability grant)`);
  return ALL_TOOLS.filter((t) => grant[t.capability] !== undefined);
}
