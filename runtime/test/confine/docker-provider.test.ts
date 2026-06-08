// Tests for the docker `os` ConfinementProvider (ADR-001 Decision 8).
//
// The isolation posture IS the argv handed to `docker`. We assert it via an
// injected runner (no daemon needed): --network=none, --cap-drop=ALL,
// no-new-privileges, non-root, the workspace bind-mount, and command ordering.
// A real-container check is env-gated (DREAM_DOCKER=1) like the live-Supabase
// integration test — run it with Docker Desktop up.

import { describe, it, expect } from 'vitest';
import { dockerConfinement, type DockerRunner } from '../../src/confine/docker-provider.ts';
import type { ExecResult } from '../../src/confine/provider.ts';

const ROOT = process.platform === 'win32' ? 'C:\\ws\\proj' : '/ws/proj';

/** A runner that records the argv it was handed and returns a canned result. */
function capturingRunner(result: ExecResult = { exitCode: 0, stdout: '', stderr: '' }): {
  run: DockerRunner;
  calls: Array<{ argv: string[]; timeoutMs: number }>;
} {
  const calls: Array<{ argv: string[]; timeoutMs: number }> = [];
  const run: DockerRunner = async (argv, opts) => {
    calls.push({ argv, timeoutMs: opts.timeoutMs });
    return result;
  };
  return { run, calls };
}

describe('dockerConfinement — provider shape', () => {
  it('is an os provider and returns the realpath’d root verbatim', () => {
    const p = dockerConfinement(ROOT, { run: capturingRunner().run });
    expect(p.kind).toBe('os');
    expect(p.workspaceRoot()).toBe(ROOT);
    expect(typeof p.exec).toBe('function');
  });
});

describe('dockerConfinement — isolation argv (Decision 8)', () => {
  it('builds a locked-down `docker run` for a command', async () => {
    const { run, calls } = capturingRunner();
    const p = dockerConfinement(ROOT, { run });
    await p.exec!('echo', ['hi']);

    expect(calls).toHaveLength(1);
    const argv = calls[0]!.argv;
    // Every isolation flag is present.
    expect(argv).toContain('run');
    expect(argv).toContain('--rm');
    expect(argv).toContain('--network=none');
    expect(argv).toContain('--cap-drop=ALL');
    expect(argv).toContain('--user');
    expect(argv).toContain('1000:1000');
    expect(argv.join(' ')).toContain('--security-opt no-new-privileges');
    // ONLY the workspace is bind-mounted, at /workspace, and it is the cwd.
    expect(argv).toContain('-v');
    expect(argv).toContain(`${ROOT}:/workspace`);
    expect(argv).toContain('-w');
    expect(argv).toContain('/workspace');
    // Default image, then the command + args, in order, at the very end.
    expect(argv).toContain('node:20-alpine');
    expect(argv.slice(-3)).toEqual(['node:20-alpine', 'echo', 'hi']);
  });

  it('honors a custom image and timeout', async () => {
    const { run, calls } = capturingRunner();
    const p = dockerConfinement(ROOT, { run, image: 'alpine', timeoutMs: 5000 });
    await p.exec!('sh', ['-c', 'true']);
    expect(calls[0]!.argv).toContain('alpine');
    expect(calls[0]!.argv).not.toContain('node:20-alpine');
    expect(calls[0]!.timeoutMs).toBe(5000);
    expect(calls[0]!.argv.slice(-4)).toEqual(['alpine', 'sh', '-c', 'true']);
  });

  it('returns the runner’s ExecResult unchanged', async () => {
    const result: ExecResult = { exitCode: 7, stdout: 'out', stderr: 'err' };
    const p = dockerConfinement(ROOT, { run: capturingRunner(result).run });
    await expect(p.exec!('false', [])).resolves.toEqual(result);
  });
});

// ── Real container — env-gated (DREAM_DOCKER=1, Docker Desktop running) ───────
describe('dockerConfinement — real container', () => {
  const live = process.env.DREAM_DOCKER === '1';
  it.skipIf(!live)('runs `echo` in a real node:20-alpine container', async () => {
    const root = process.cwd();
    const p = dockerConfinement(root);
    const res = await p.exec!('echo', ['hello-from-container']);
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain('hello-from-container');
  }, 120_000);

  it.skipIf(!live)('has NO network (wget to a host fails)', async () => {
    const p = dockerConfinement(process.cwd());
    // --network=none → name resolution / connect must fail (nonzero exit).
    const res = await p.exec!('sh', ['-c', 'wget -T 3 -q -O- http://example.com || echo BLOCKED']);
    expect(res.stdout).toContain('BLOCKED');
  }, 120_000);
});
