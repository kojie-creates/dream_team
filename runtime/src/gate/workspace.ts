// resolveWorkspace() — path canonicalization + boundary containment (ADR-001 Decision 2).
//
// Pure of policy and pure of writes: this function only READS the filesystem
// (realpath / lstat / stat) to learn what a requested path canonicalizes to, then
// asserts the canonical path is contained under the run's workspace root. It never
// creates, modifies, or deletes anything (ADR §4: "no I/O beyond read-only path
// resolution").
//
// Containment is by PATH-SEGMENT containment on the resolved path, NOT a string
// prefix, so a sibling like `<root>-evil` is correctly rejected (Decision 2). All
// symlink/junction components are resolved before the check; a component that
// resolves outside the root is rejected (Decision 2a is the TOOL's open-once rule
// at write time — this is the up-front resolve+contain check that precedes it).
//
// Not-yet-existing write targets: the target file may not exist, but its parent
// chain must. We realpath the DEEPEST EXISTING ANCESTOR (resolving every symlink
// up to that point), then re-attach the remaining not-yet-existing trailing
// segments and verify the whole thing is inside the realpath'd root.
//
// Decoupling: no `electron`, no app imports. Cross-platform Node `fs`/`path` only
// (the dev/ship target is Windows 11: handles drive-letter case, slash direction,
// and NTFS junctions/symlinks via realpath).

import { realpathSync, statSync } from 'node:fs';
import { isAbsolute, resolve as resolvePath, dirname, relative, sep } from 'node:path';

/** The run's confinement boundary (ADR Decision 2). `workspaceRoot` is already realpath'd. */
export interface WorkspaceBoundary {
  /** Realpath'd absolute path to the workspace root (Decision 8 SOURCE OF TRUTH). */
  workspaceRoot: string;
  /** Additional realpath'd roots a read may target (unused by slice-1 write path; reserved). */
  readAllowlist: string[];
}

/** Result of canonicalizing + containing a requested path (ADR Decision 2). */
export type WorkspaceResolution =
  | { ok: true; absPath: string } // canonicalized, inside the boundary
  | { ok: false; reason: 'outside_boundary' | 'resolve_failed'; detail: string };

/**
 * Canonicalize `requestedPath` (resolving symlinks/junctions) and assert it is
 * contained under `boundary.workspaceRoot`. The path need not exist yet, but its
 * deepest existing ancestor must, and that ancestor must realpath to a location
 * inside the root. Returns a discriminated union; never throws, never writes.
 */
export function resolveWorkspace(
  requestedPath: string,
  boundary: WorkspaceBoundary,
): WorkspaceResolution {
  // Build an absolute lexical path. Relative requests are resolved against the
  // root (the workspace is the run's CWD); absolute requests are taken as-is so
  // an out-of-root absolute path is caught by the containment check below.
  const lexicalAbs = isAbsolute(requestedPath)
    ? resolvePath(requestedPath)
    : resolvePath(boundary.workspaceRoot, requestedPath);

  // Realpath the deepest existing ancestor (resolves every symlink/junction up to
  // it), then re-attach the not-yet-existing trailing segments. This is what makes
  // a not-yet-created write target valid as long as its real parent is in-bounds,
  // while still catching a symlinked parent that points outside.
  let canonical: string;
  try {
    canonical = realpathDeepestExisting(lexicalAbs);
  } catch (err) {
    return { ok: false, reason: 'resolve_failed', detail: describe(err) };
  }

  if (!isContained(canonical, boundary.workspaceRoot)) {
    return {
      ok: false,
      reason: 'outside_boundary',
      detail: `resolved path ${canonical} is not inside workspace root ${boundary.workspaceRoot}`,
    };
  }

  return { ok: true, absPath: canonical };
}

/**
 * Realpath the longest existing prefix of `absPath`, then re-append the trailing
 * segments that do not exist yet. Resolves symlinks/junctions in the existing
 * prefix (so an in-workspace symlink pointing outside is canonicalized to its real
 * outside target and later rejected by containment). Throws only if NO ancestor
 * up to the filesystem root exists (a genuinely unresolvable path) — mapped to
 * `resolve_failed` by the caller. Read-only: realpathSync never writes.
 */
function realpathDeepestExisting(absPath: string): string {
  const trailing: string[] = [];
  let current = absPath;

  // Walk up until realpathSync succeeds on an existing ancestor.
  for (;;) {
    try {
      const realCurrent = realpathSync(current);
      if (trailing.length === 0) return realCurrent;
      // A not-yet-existing target requires its deepest existing ancestor to be a
      // DIRECTORY (you cannot create children under a file). statSync follows to
      // the real object; a non-directory here is a genuine resolve failure.
      if (!statSync(realCurrent).isDirectory()) {
        throw new Error(`ENOTDIR: ancestor ${realCurrent} is not a directory`);
      }
      // Re-attach the not-yet-existing trailing segments (deepest first → reverse).
      return resolvePath(realCurrent, ...trailing.reverse());
    } catch (err) {
      if (!isEnoent(err)) throw err; // EACCES, ELOOP, etc. → genuine resolve failure
      const parent = dirname(current);
      if (parent === current) throw err; // reached fs root with nothing existing
      trailing.push(basenameOf(current, parent));
      current = parent;
    }
  }
}

/**
 * Path-segment containment: is `child` the root itself or a strict descendant of
 * `root`? Uses `path.relative` (NOT string prefix) so `<root>-evil` is NOT inside
 * `<root>`. Cross-platform: `relative` normalizes slash direction and drive-letter
 * case on Windows.
 */
function isContained(child: string, root: string): boolean {
  const rel = relative(root, child);
  if (rel === '') return true; // the root itself
  // Outside if the relative path climbs out (`..`) or is absolute (different drive).
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return false;
  return true;
}

function basenameOf(child: string, parent: string): string {
  // The single segment between parent and child (avoids path.basename edge cases
  // with trailing separators by deriving it from the dirname split point).
  return child.slice(parent.length).replace(/^[\\/]+/, '');
}

function isEnoent(err: unknown): boolean {
  return isErrnoException(err) && err.code === 'ENOENT';
}

function isErrnoException(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && typeof (err as NodeJS.ErrnoException).code === 'string';
}

function describe(err: unknown): string {
  if (isErrnoException(err)) return `${err.code}: ${err.message}`;
  return err instanceof Error ? err.message : String(err);
}
