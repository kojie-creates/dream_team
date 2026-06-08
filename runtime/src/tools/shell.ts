// shell — the first SH-capability tool (ADR-001 Decision 8). Runs a command
// inside the run's OS-isolation boundary (the docker `os` ConfinementProvider).
//
// Static declaration (Decision 5): capability 'SH', actionTier 'T2', no pathArg
// (the command is not a single workspace path). The LOOP gates SH against the
// role's grant before execute() runs; a role without SH never reaches here.
//
// THE HARD LINE (Decision 8): a shell tool may run ONLY under `os` confinement.
// Under software confinement a path-prefix check is not a sandbox — symlinks,
// `cd ..`, `$(...)`, subprocess spawn and npm postinstall all walk around it. So
// execute() REFUSES (execution_error, runs nothing) unless `ctx.confine.kind ===
// 'os'` with a real exec(). This refusal is the safety property, unit-tested.
//
// A nonzero exit is a NORMAL result (a failing build/test), not a confinement
// failure: the tool reports ok:true with the exit code in `data` so the model can
// read it. Only a refusal or a container-exec throw is is_error (execution_error).
//
// Decoupling: no `electron`, no app imports — runs entirely through ctx.confine.

import type { ToolDef, ToolExecContext, ToolObservation } from './types.ts';

/** shell input: a single command string, run as `sh -c <command>` in the container. */
export interface ShellInput {
  command: string;
}

/** Cap captured output so a runaway command can't flood the tool_result/model. */
const MAX_OUTPUT_CHARS = 10_000;

export const shellTool: ToolDef<ShellInput> = {
  name: 'shell',
  capability: 'SH',
  actionTier: 'T2',
  inputSchema: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'Shell command to run inside the isolated container (executed as `sh -c`).',
      },
    },
    required: ['command'],
    additionalProperties: false,
  },
  async execute(input: ShellInput, ctx: ToolExecContext): Promise<ToolObservation> {
    // HARD GUARD (Decision 8): OS isolation is mandatory for shell. Refuse under
    // software confinement (or a missing/exec-less provider) — run nothing.
    if (!ctx.confine || ctx.confine.kind !== 'os' || typeof ctx.confine.exec !== 'function') {
      return fail('shell requires OS isolation (Decision 8); refused under software confinement');
    }
    if (typeof input.command !== 'string' || input.command.trim() === '') {
      return fail('empty shell command');
    }

    let res;
    try {
      res = await ctx.confine.exec('sh', ['-c', input.command]);
    } catch (err) {
      return fail(`container exec failed: ${describe(err)}`);
    }

    // Command ran (any exit code) → the TOOL succeeded; the exit code is data.
    const ok = res.exitCode === 0;
    return {
      ok: true,
      summary: ok ? 'shell exited 0' : `shell exited ${res.exitCode}`,
      data: {
        exitCode: res.exitCode,
        stdout: truncate(res.stdout),
        stderr: truncate(res.stderr),
      },
    };
  },
};

/** execution_error observation (Decision 2a.4): ok:false, is_error:true, no claim. */
function fail(detail: string): ToolObservation {
  return { ok: false, is_error: true, summary: `execution_error: ${detail}` };
}

function truncate(s: string): string {
  if (s.length <= MAX_OUTPUT_CHARS) return s;
  return `${s.slice(0, MAX_OUTPUT_CHARS)}\n…[truncated ${s.length - MAX_OUTPUT_CHARS} chars]`;
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
