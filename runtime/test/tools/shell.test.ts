// Tests for the shell tool (ADR-001 Decision 8). The load-bearing test is the
// REFUSAL: shell must run nothing unless confinement is `os`. The rest pins the
// exec wiring (sh -c), exit-code-as-data, and the execution_error paths.

import { describe, it, expect } from 'vitest';
import { shellTool, type ShellInput } from '../../src/tools/shell.ts';
import type { ToolExecContext } from '../../src/tools/types.ts';
import type { ConfinementProvider, ExecResult } from '../../src/confine/provider.ts';
import { softwareConfinement } from '../../src/confine/provider.ts';

const boundary = { workspaceRoot: '/ws/proj', readAllowlist: [] };

/** A fake `os` provider whose exec records its call and returns a canned result. */
function fakeOsProvider(result: ExecResult): {
  provider: ConfinementProvider;
  calls: Array<{ cmd: string; args: string[] }>;
} {
  const calls: Array<{ cmd: string; args: string[] }> = [];
  const provider: ConfinementProvider = {
    kind: 'os',
    workspaceRoot: () => '/ws/proj',
    async exec(cmd, args) {
      calls.push({ cmd, args });
      return result;
    },
  };
  return { provider, calls };
}

function ctx(over: Partial<ToolExecContext> = {}): ToolExecContext {
  return { boundary, ...over };
}

const RUN: ShellInput = { command: 'echo hi' };

describe('shell — HARD GUARD: OS isolation required (Decision 8)', () => {
  it('REFUSES under software confinement — runs nothing, execution_error', async () => {
    const obs = await shellTool.execute(RUN, ctx({ confine: softwareConfinement('/ws/proj') }));
    expect(obs.ok).toBe(false);
    expect(obs.is_error).toBe(true);
    expect(obs.summary).toMatch(/execution_error: shell requires OS isolation/);
  });

  it('REFUSES when no confinement provider is present', async () => {
    const obs = await shellTool.execute(RUN, ctx());
    expect(obs.ok).toBe(false);
    expect(obs.is_error).toBe(true);
    expect(obs.summary).toMatch(/OS isolation/);
  });
});

describe('shell — declaration', () => {
  it('is SH / T2 with no pathArg', () => {
    expect(shellTool.capability).toBe('SH');
    expect(shellTool.actionTier).toBe('T2');
    expect(shellTool.pathArg).toBeUndefined();
  });
});

describe('shell — runs under os confinement', () => {
  it('execs `sh -c <command>` and reports exit 0 with output as data', async () => {
    const { provider, calls } = fakeOsProvider({ exitCode: 0, stdout: 'hi\n', stderr: '' });
    const obs = await shellTool.execute(RUN, ctx({ confine: provider }));

    expect(calls).toEqual([{ cmd: 'sh', args: ['-c', 'echo hi'] }]);
    expect(obs.ok).toBe(true);
    expect(obs.is_error).toBeUndefined();
    expect(obs.summary).toBe('shell exited 0');
    expect(obs.data).toMatchObject({ exitCode: 0, stdout: 'hi\n', stderr: '' });
  });

  it('a nonzero exit is a NORMAL result (ok:true, code in data)', async () => {
    const { provider } = fakeOsProvider({ exitCode: 2, stdout: '', stderr: 'boom' });
    const obs = await shellTool.execute({ command: 'exit 2' }, ctx({ confine: provider }));
    expect(obs.ok).toBe(true);
    expect(obs.summary).toBe('shell exited 2');
    expect(obs.data).toMatchObject({ exitCode: 2, stderr: 'boom' });
  });

  it('truncates flooding output', async () => {
    const big = 'x'.repeat(20_000);
    const { provider } = fakeOsProvider({ exitCode: 0, stdout: big, stderr: '' });
    const obs = await shellTool.execute(RUN, ctx({ confine: provider }));
    const data = obs.data as { stdout: string };
    expect(data.stdout.length).toBeLessThan(big.length);
    expect(data.stdout).toMatch(/truncated/);
  });

  it('a container-exec throw → execution_error (nothing claimed)', async () => {
    const provider: ConfinementProvider = {
      kind: 'os',
      workspaceRoot: () => '/ws/proj',
      async exec() {
        throw new Error('docker daemon not reachable');
      },
    };
    const obs = await shellTool.execute(RUN, ctx({ confine: provider }));
    expect(obs.ok).toBe(false);
    expect(obs.is_error).toBe(true);
    expect(obs.summary).toMatch(/execution_error: container exec failed/);
  });

  it('rejects an empty command', async () => {
    const { provider, calls } = fakeOsProvider({ exitCode: 0, stdout: '', stderr: '' });
    const obs = await shellTool.execute({ command: '   ' }, ctx({ confine: provider }));
    expect(obs.ok).toBe(false);
    expect(obs.summary).toMatch(/empty shell command/);
    expect(calls).toHaveLength(0);
  });
});
