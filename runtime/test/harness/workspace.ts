// Ephemeral temp-workspace helper for the T0 vitest harness.
//
// Makes a fresh temp dir per test and cleans it up. Filesystem tests (T1
// resolveWorkspace, T4 write_file, T8 escape) need a real, isolated, realpath'd
// directory as the workspace root (ADR-001 Decision 8: workspace root is
// realpath'd once; Decision 2a.5: the symlink-swap test mounts junctions inside
// it). T0 ships the helper so those later tests have an isolation primitive.

import { mkdtemp, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** A live temp workspace: its realpath'd root plus a cleanup function. */
export interface TempWorkspace {
  /** Realpath'd absolute path to the workspace root (matches Decision 8 SOURCE OF TRUTH semantics). */
  root: string;
  /** Remove the workspace recursively. Idempotent. */
  cleanup(): Promise<void>;
}

/**
 * Create an isolated temp workspace. The returned `root` is realpath-resolved so
 * containment checks (T1) compare against the canonical path, not a symlinked
 * /tmp on macOS-style systems. Caller is responsible for calling cleanup()
 * (e.g. in an afterEach), or use withTempWorkspace for auto-cleanup.
 */
export async function makeTempWorkspace(prefix = 'dreamteam-rt-'): Promise<TempWorkspace> {
  const created = await mkdtemp(join(tmpdir(), prefix));
  const root = await realpath(created);
  return {
    root,
    async cleanup(): Promise<void> {
      await rm(root, { recursive: true, force: true });
    },
  };
}

/**
 * Run `fn` with a fresh temp workspace, cleaning it up afterward even on throw.
 * Convenience wrapper for tests that don't need afterEach lifecycle.
 */
export async function withTempWorkspace<T>(fn: (ws: TempWorkspace) => Promise<T>): Promise<T> {
  const ws = await makeTempWorkspace();
  try {
    return await fn(ws);
  } finally {
    await ws.cleanup();
  }
}
