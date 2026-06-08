// T1 — table-driven tests for resolveWorkspace() (ADR-001 Decision 2).
//
// Uses the T0 temp-workspace harness (makeTempWorkspace → realpath'd root) as the
// isolation primitive. Covers: in-boundary, nested in-boundary, not-yet-existing
// file with existing in-bounds parent, `..` escape, absolute path outside root,
// an in-workspace symlink/junction pointing OUTSIDE, the sibling-prefix trap
// (`<root>-evil`), and a resolve_failed path. Also asserts resolveWorkspace
// performs NO filesystem write (it is read-only path resolution).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, symlink, readdir, stat } from 'node:fs/promises';
import { realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resolveWorkspace, type WorkspaceBoundary } from '../../src/gate/workspace.ts';
import { makeTempWorkspace, type TempWorkspace } from '../harness/index.ts';

let ws: TempWorkspace;
let boundary: WorkspaceBoundary;

beforeEach(async () => {
  ws = await makeTempWorkspace();
  boundary = { workspaceRoot: ws.root, readAllowlist: [] };
});

afterEach(async () => {
  await ws.cleanup();
});

describe('resolveWorkspace — in-boundary', () => {
  it('resolves an existing file inside the root → ok', async () => {
    const f = join(ws.root, 'file.txt');
    await writeFile(f, 'hi');
    const r = resolveWorkspace(f, boundary);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.absPath).toBe(await realpath(f));
  });

  it('resolves the root itself → ok', () => {
    const r = resolveWorkspace(ws.root, boundary);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.absPath).toBe(ws.root);
  });

  it('resolves a nested existing path inside the root → ok', async () => {
    const dir = join(ws.root, 'a', 'b');
    await mkdir(dir, { recursive: true });
    const f = join(dir, 'deep.txt');
    await writeFile(f, 'x');
    const r = resolveWorkspace(f, boundary);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.absPath).toBe(await realpath(f));
  });

  it('resolves a relative request against the root → ok', async () => {
    const r = resolveWorkspace('sub/child.txt', boundary);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.absPath).toBe(join(ws.root, 'sub', 'child.txt'));
  });

  it('resolves a not-yet-existing file whose parent dir exists in-bounds → ok', async () => {
    await mkdir(join(ws.root, 'src'), { recursive: true });
    const target = join(ws.root, 'src', 'new-file.ts'); // does not exist yet
    const r = resolveWorkspace(target, boundary);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.absPath).toBe(target);
    // assert the function did NOT create it
    const entries = await readdir(join(ws.root, 'src'));
    expect(entries).not.toContain('new-file.ts');
  });
});

describe('resolveWorkspace — escapes → outside_boundary', () => {
  it('rejects a `..` traversal that escapes the root', () => {
    const r = resolveWorkspace(join(ws.root, '..', 'somewhere'), boundary);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('outside_boundary');
  });

  it('rejects an absolute path outside the root', () => {
    const r = resolveWorkspace(tmpdir(), boundary); // parent-ish, definitely not inside
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('outside_boundary');
  });

  it('rejects the sibling-prefix trap `<root>-evil`', async () => {
    // A real sibling dir that shares the root as a string prefix but is NOT inside it.
    const evil = `${ws.root}-evil`;
    await mkdir(evil, { recursive: true });
    try {
      const r = resolveWorkspace(join(evil, 'loot.txt'), boundary);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe('outside_boundary');
    } finally {
      const { rm } = await import('node:fs/promises');
      await rm(evil, { recursive: true, force: true });
    }
  });

  it('rejects an in-workspace symlink/junction pointing OUTSIDE the root', async () => {
    // Create a real escape target outside the workspace, then a link inside the
    // workspace pointing at it. resolveWorkspace must canonicalize through the link
    // and reject. On Windows, dir symlinks need privilege; fall back to a junction
    // (fs.symlink(target, path, 'junction')), which is allowed without elevation.
    const outside = await makeTempWorkspace('dreamteam-escape-');
    try {
      const linkPath = join(ws.root, 'escape-link');
      let linkKind: 'dir' | 'junction' = 'dir';
      try {
        await symlink(outside.root, linkPath, 'dir');
      } catch (err) {
        // EPERM/EACCES on Windows without Developer Mode → junction fallback.
        if (process.platform === 'win32') {
          await symlink(outside.root, linkPath, 'junction');
          linkKind = 'junction';
        } else {
          throw err;
        }
      }

      // A write target THROUGH the link resolves to outside.root → must be rejected.
      const r = resolveWorkspace(join(linkPath, 'loot.txt'), boundary);
      expect(r.ok, `link kind used: ${linkKind}`).toBe(false);
      if (!r.ok) expect(r.reason).toBe('outside_boundary');
    } finally {
      await outside.cleanup();
    }
  });
});

describe('resolveWorkspace — unresolvable → resolve_failed', () => {
  it('returns resolve_failed when an intermediate component is a file (not a dir)', async () => {
    const file = join(ws.root, 'iam-a-file');
    await writeFile(file, 'x');
    // Treat the file as a directory: <file>/child cannot exist and cannot be created.
    const r = resolveWorkspace(join(file, 'child.txt'), boundary);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('resolve_failed');
  });
});

describe('resolveWorkspace — purity (no filesystem write)', () => {
  it('does not create, modify, or delete anything in the workspace', async () => {
    // Seed a known state.
    await mkdir(join(ws.root, 'keep'), { recursive: true });
    await writeFile(join(ws.root, 'keep', 'a.txt'), 'original');
    const beforeEntries = (await readdir(ws.root)).sort();
    const beforeStat = await stat(join(ws.root, 'keep', 'a.txt'));

    // Exercise every branch: ok (existing), ok (not-yet-existing), outside, failed.
    resolveWorkspace(join(ws.root, 'keep', 'a.txt'), boundary);
    resolveWorkspace(join(ws.root, 'keep', 'b-new.txt'), boundary);
    resolveWorkspace(join(ws.root, '..', 'nope'), boundary);
    resolveWorkspace(join(ws.root, 'keep', 'a.txt', 'child'), boundary);

    // Nothing changed on disk.
    const afterEntries = (await readdir(ws.root)).sort();
    expect(afterEntries).toEqual(beforeEntries);
    const afterStat = await stat(join(ws.root, 'keep', 'a.txt'));
    expect(afterStat.mtimeMs).toBe(beforeStat.mtimeMs);
    expect(afterStat.size).toBe(beforeStat.size);
    // the not-yet-existing target was NOT created
    await expect(stat(join(ws.root, 'keep', 'b-new.txt'))).rejects.toThrow();
  });
});
