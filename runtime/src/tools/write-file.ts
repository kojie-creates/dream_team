// write_file — the slice-1 workspace-scoped write tool (ADR-001 Decision 5)
// implementing the open-once / no-follow / handle-validation TOCTOU rule
// (Decision 2a.3, verbatim).
//
// Static declaration (Decision 5): capability 'W', actionTier 'T3', pathArg
// 'path'. The tool does NOT call the gate — the loop guarantees a permit before
// `execute()` runs. But the tool DOES own filesystem-reality confinement
// (Decision 2a.4): the gate validated a path STRING; between that validation and
// the write, a hostile dependency can swap a path component for a symlink/NTFS
// junction pointing outside the workspace (the string still passes; the write
// escapes). The defense is: open the handle ONCE with no-follow, re-assert
// containment on the OPENED object (not the string), write THROUGH the handle,
// never re-open by name. Any failure → write nothing, return execution_error
// (the action was permitted but reality changed — not a grant/scope failure).
//
// Decoupling: no `electron`, no app imports. Cross-platform Node `fs` only.

import { constants as FS } from 'node:fs';
import { open, realpath, lstat, mkdir } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { isAbsolute, relative, sep, dirname } from 'node:path';
import { resolveWorkspace } from '../gate/workspace.ts';
import type { WorkspaceBoundary } from '../gate/workspace.ts';
import type { ToolDef, ToolExecContext, ToolObservation } from './types.ts';

/** write_file input (Decision 5: `{ path, content }`, pathArg:'path'). */
export interface WriteFileInput {
  path: string;
  content: string;
}

export const writeFileTool: ToolDef<WriteFileInput> = {
  name: 'write_file',
  capability: 'W',
  actionTier: 'T3',
  pathArg: 'path',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Workspace-relative or absolute path to write inside the workspace.' },
      content: { type: 'string', description: 'File content to write (overwrites existing).' },
    },
    required: ['path', 'content'],
    additionalProperties: false,
  },
  async execute(input: WriteFileInput, ctx: ToolExecContext): Promise<ToolObservation> {
    return writeFileExecute(input, ctx);
  },
};

/**
 * The open-once rule (ADR Decision 2a.3). Every failure path returns
 * `execution_error` and writes nothing.
 */
async function writeFileExecute(
  input: WriteFileInput,
  ctx: ToolExecContext,
): Promise<ToolObservation> {
  const boundary = ctx.boundary;

  // (a) Resolve the requested path via T1. If not ok → execution_error (the loop
  // would normally resolve+gate first, but the tool must still fail closed if
  // handed an unresolved/out-of-bounds path; never write).
  const resolution = resolveWorkspace(input.path, boundary);
  if (!resolution.ok) {
    return fail(`path did not resolve inside workspace: ${resolution.reason} (${resolution.detail})`);
  }
  const resolvedPath = resolution.absPath;

  // TEST-ONLY race window (Decision 2a.5): swap the filesystem between resolve and
  // open. Production runs never set this hook.
  if (ctx.afterResolveBeforeOpen) {
    await ctx.afterResolveBeforeOpen();
  }

  // The parent must exist before opening a not-yet-existing target. mkdir of an
  // in-bounds parent chain is harmless; if a component was swapped to a junction
  // after resolve, mkdir just no-ops on the existing link and the parent re-check
  // below catches the escape before any FILE is created.
  const parent = dirname(resolvedPath);
  await mkdir(parent, { recursive: true });

  // (b-pre) RE-ASSERT PARENT CONTAINMENT ON THE REAL PARENT, BEFORE the create.
  // This is load-bearing on Windows: O_NOFOLLOW refuses only a symlinked FINAL
  // component, NOT a junctioned ANCESTOR — and an O_CREAT open through a
  // junctioned parent CREATES the file at the escape target before any post-open
  // check can reject it (verified TOCTOU). Realpath'ing the (already-existing)
  // parent resolves any swapped-in junction to its real outside location; if that
  // is outside the root we fail closed having created NOTHING. This is the
  // open-once discipline applied to the directory the file is created in.
  let realParent: string;
  try {
    realParent = await realpath(parent);
  } catch (err) {
    return fail(`pre-open parent realpath failed: ${describe(err)}`);
  }
  if (!isContained(realParent, boundary.workspaceRoot)) {
    return fail(`write parent ${realParent} is outside workspace root ${boundary.workspaceRoot}`);
  }

  let handle: FileHandle | undefined;
  try {
    // (b) OPEN ONCE, no-follow final component. O_NOFOLLOW makes the open itself
    // fail with ELOOP if the final component is a symlink/junction — closing the
    // race on the final component at open time. We open for writing
    // (create+truncate). On ELOOP / any no-follow rejection → fail closed; NEVER
    // fall back to a string re-open.
    const flags = FS.O_WRONLY | FS.O_CREAT | FS.O_TRUNC | FS.O_NOFOLLOW;
    try {
      handle = await open(resolvedPath, flags, 0o600);
    } catch (err) {
      return fail(`open (no-follow) refused: ${describe(err)}`);
    }

    // (c) RE-ASSERT CONTAINMENT ON THE OPENED OBJECT, not the string. realpath the
    // target now that it exists, and confirm it is the root or a descendant by
    // PATH-SEGMENT containment (not string prefix). On Windows additionally reject
    // if the final component is itself a symlink (belt-and-suspenders alongside
    // O_NOFOLLOW). Any mismatch → close, write nothing, execution_error.
    let realTarget: string;
    try {
      realTarget = await realpath(resolvedPath);
    } catch (err) {
      return fail(`post-open realpath failed: ${describe(err)}`);
    }
    if (!isContained(realTarget, boundary.workspaceRoot)) {
      return fail(`opened object ${realTarget} is outside workspace root ${boundary.workspaceRoot}`);
    }
    try {
      const st = await lstat(resolvedPath);
      if (st.isSymbolicLink()) {
        return fail(`final component ${resolvedPath} is a symlink`);
      }
    } catch (err) {
      return fail(`post-open lstat failed: ${describe(err)}`);
    }

    // (d) WRITE THROUGH THE HELD HANDLE ONLY. Never a second fs.writeFile(path)
    // by name (that would re-introduce the race).
    await handle.writeFile(input.content, { encoding: 'utf8' });

    // (e) Success.
    return {
      ok: true,
      summary: `wrote ${Buffer.byteLength(input.content, 'utf8')} bytes to ${displayPath(resolvedPath, boundary)}`,
      data: { path: resolvedPath, bytes: Buffer.byteLength(input.content, 'utf8') },
    };
  } catch (err) {
    // Any unexpected error during the write itself → execution_error, nothing claimed.
    return fail(`write failed: ${describe(err)}`);
  } finally {
    // Close the handle in a finally (step d).
    if (handle) {
      await handle.close().catch(() => {});
    }
  }
}

/** Build the execution_error observation (Decision 2a.4: ok:false, is_error:true). */
function fail(detail: string): ToolObservation {
  return { ok: false, is_error: true, summary: `execution_error: ${detail}` };
}

/**
 * Path-segment containment (same rule as resolveWorkspace.isContained): is
 * `child` the root or a strict descendant? Uses path.relative, not string prefix.
 */
function isContained(child: string, root: string): boolean {
  const rel = relative(root, child);
  if (rel === '') return true;
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return false;
  return true;
}

/** Workspace-relative display path for the summary (falls back to absolute). */
function displayPath(absPath: string, boundary: WorkspaceBoundary): string {
  const rel = relative(boundary.workspaceRoot, absPath);
  return rel === '' ? absPath : rel;
}

function describe(err: unknown): string {
  if (err instanceof Error && typeof (err as NodeJS.ErrnoException).code === 'string') {
    return `${(err as NodeJS.ErrnoException).code}: ${err.message}`;
  }
  return err instanceof Error ? err.message : String(err);
}
