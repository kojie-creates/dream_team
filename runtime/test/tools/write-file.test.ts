// T4 — tests for write_file + the open-once TOCTOU rule (ADR-001 Decision 2a).
//
// Uses the T0 temp-workspace harness (realpath'd root) as the isolation
// primitive. Covers (per task T4 / Decision 2a.5):
//   1. write inside workspace → ok, file present with correct content
//   2. nested-dir write inside workspace → ok (parents created)
//   3. path OUTSIDE workspace → refused, no file created, execution_error
//   4. symlink-swap negative test (Decision 2a.5): after resolveWorkspace returns
//      ok, the afterResolveBeforeOpen hook replaces a path COMPONENT with a
//      junction pointing to an escape dir → assert (a) ok:false/is_error with an
//      execution_error summary, (b) NO file at the escape target, (c) the
//      one-observation-per-call invariant holds.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFile, stat, mkdir, rm, symlink, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { writeFileTool, type WriteFileInput } from '../../src/tools/write-file.ts';
import type { ToolExecContext } from '../../src/tools/types.ts';
import type { WorkspaceBoundary } from '../../src/gate/workspace.ts';
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

function ctx(over: Partial<ToolExecContext> = {}): ToolExecContext {
  return { boundary, ...over };
}

describe('write_file — happy path (inside workspace)', () => {
  it('writes a file at the workspace root → ok, content present', async () => {
    const input: WriteFileInput = { path: 'hello.txt', content: 'hello world' };
    const obs = await writeFileTool.execute(input, ctx());

    expect(obs.ok).toBe(true);
    expect(obs.is_error).toBeUndefined();
    const written = await readFile(join(ws.root, 'hello.txt'), 'utf8');
    expect(written).toBe('hello world');
  });

  it('writes into a not-yet-existing nested dir → ok, parents created', async () => {
    const input: WriteFileInput = { path: join('src', 'deep', 'mod.ts'), content: 'export const x = 1;\n' };
    const obs = await writeFileTool.execute(input, ctx());

    expect(obs.ok).toBe(true);
    const written = await readFile(join(ws.root, 'src', 'deep', 'mod.ts'), 'utf8');
    expect(written).toBe('export const x = 1;\n');
  });

  it('overwrites (truncates) an existing file → ok, only new content', async () => {
    await writeFileTool.execute({ path: 'f.txt', content: 'AAAAAAAAAA' }, ctx());
    const obs = await writeFileTool.execute({ path: 'f.txt', content: 'bb' }, ctx());

    expect(obs.ok).toBe(true);
    const written = await readFile(join(ws.root, 'f.txt'), 'utf8');
    expect(written).toBe('bb'); // truncated, not 'bbAAAAAAAA'
  });
});

describe('write_file — path outside workspace → execution_error, no write', () => {
  it('refuses a `..` escape, creates nothing, returns execution_error', async () => {
    const escapeName = 'escaped-by-dotdot.txt';
    const obs = await writeFileTool.execute(
      { path: join('..', escapeName), content: 'should never land' },
      ctx(),
    );

    expect(obs.ok).toBe(false);
    expect(obs.is_error).toBe(true);
    expect(obs.summary).toContain('execution_error');
    // No file created at the parent of the workspace root.
    await expect(stat(join(ws.root, '..', escapeName))).rejects.toThrow();
  });
});

describe('write_file — symlink-swap TOCTOU (Decision 2a.5)', () => {
  it('a junction swapped in AFTER resolve → execution_error, no file at escape target', async () => {
    // The legitimate, in-bounds target at resolve time: <root>/sub/loot.txt where
    // <root>/sub is a real directory. resolveWorkspace() will pass.
    const subDir = join(ws.root, 'sub');
    await mkdir(subDir, { recursive: true });

    // A real escape directory OUTSIDE the workspace (under os.tmpdir()/escape/...).
    const escape = await makeTempWorkspace('dreamteam-escape-');
    const escapeTarget = join(escape.root, 'loot.txt');

    let swapKind: 'dir' | 'junction' = 'dir';
    let observationCount = 0;

    try {
      // Race-point hook: between resolveWorkspace (ok) and open, replace the `sub`
      // DIRECTORY component with a link to the escape dir. The final component
      // (loot.txt) is NOT a link, so O_NOFOLLOW on the final component does not
      // trip; the escape is caught by the post-open realpath containment re-check.
      const afterResolveBeforeOpen = async (): Promise<void> => {
        await rm(subDir, { recursive: true, force: true });
        try {
          await symlink(escape.root, subDir, 'dir');
        } catch (err) {
          // Windows without Developer Mode → junction fallback (no elevation needed).
          if (process.platform === 'win32') {
            await symlink(escape.root, subDir, 'junction');
            swapKind = 'junction';
          } else {
            throw err;
          }
        }
      };

      const obs = await writeFileTool.execute(
        { path: join('sub', 'loot.txt'), content: 'ESCAPED' },
        ctx({ afterResolveBeforeOpen }),
      );
      observationCount++;

      // (a) The call fails closed with an execution_error observation.
      expect(obs.ok, `swap kind used: ${swapKind}`).toBe(false);
      expect(obs.is_error).toBe(true);
      expect(obs.summary).toContain('execution_error');

      // (b) NO file landed at the escape target outside the workspace.
      await expect(readFile(escapeTarget, 'utf8')).rejects.toThrow();
      const escapeEntries = await readdir(escape.root);
      expect(escapeEntries).not.toContain('loot.txt');

      // (c) One-observation-per-call invariant (count(observations) == count(calls)).
      expect(observationCount).toBe(1);
    } finally {
      // Remove the swapped-in link before cleaning the workspace so rm does not
      // recurse THROUGH a junction into the escape dir; then clean the escape dir.
      await rm(subDir, { recursive: true, force: true });
      await escape.cleanup();
    }
  });
});

describe('write_file — static declaration (Decision 5)', () => {
  it('declares capability W, actionTier T3, pathArg path', () => {
    expect(writeFileTool.name).toBe('write_file');
    expect(writeFileTool.capability).toBe('W');
    expect(writeFileTool.actionTier).toBe('T3');
    expect(writeFileTool.pathArg).toBe('path');
  });
});
