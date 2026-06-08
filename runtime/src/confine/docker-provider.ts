// dockerConfinement — the `os` ConfinementProvider (ADR-001 Decision 8).
//
// Shell-capable roles MUST run tool execution under OS-level isolation. This is
// that boundary: every exec() is a fresh `docker run --rm` into a locked-down
// container with the workspace bind-mounted and NO network. Per-command (not a
// persistent container) so there is zero state bleed between commands and no
// lifecycle/cleanup surface — the container exists only for the one command.
//
// Isolation posture (Decision 8): no network (`--network=none`), all Linux
// capabilities dropped (`--cap-drop=ALL`), no privilege escalation
// (`--security-opt no-new-privileges`), non-root UID, and the ONLY host path the
// container can see is the realpath'd workspace, bind-mounted at /workspace. A
// command therefore cannot reach the host filesystem outside the workspace, the
// network, or root — even via symlink/subprocess/postinstall (the failure modes
// that make a path-prefix check insufficient for shell, brief §3).
//
// Future hardening (not v1): read-only root fs + tmpfs /tmp, the default-deny
// logging proxy for outbound, and resource (cpu/mem/pids) limits.
//
// Testability: the actual `docker` invocation is an injectable `run` seam, so the
// argv (the isolation flags) is unit-tested WITHOUT a daemon; a real-container
// check is env-gated (DREAM_DOCKER=1) like the live-Supabase integration tests.
//
// Decoupling: no `electron`, no app imports. Node child_process only.

import { execFile } from 'node:child_process';
import type { ConfinementProvider, ExecResult } from './provider.ts';

/** The seam that actually runs `docker <argv>`. Injected in tests; real impl below. */
export type DockerRunner = (argv: string[], opts: { timeoutMs: number }) => Promise<ExecResult>;

export interface DockerConfinementOptions {
  /** Container image. Default `node:20-alpine` (code-developer SH = build/test). */
  image?: string;
  /** Per-command wall-clock limit. Default 120s. */
  timeoutMs?: number;
  /** Injectable docker runner (tests). Default shells out to the `docker` CLI. */
  run?: DockerRunner;
}

const DEFAULT_IMAGE = 'node:20-alpine';
const DEFAULT_TIMEOUT_MS = 120_000;

/**
 * The locked-down `docker run` argv for ONE command (Decision 8 isolation flags).
 * Exported-shape is internal; tests assert it via the injected runner.
 */
function buildArgv(workspaceRoot: string, image: string, cmd: string, args: string[]): string[] {
  return [
    'run',
    '--rm', // remove the container when the command exits (no persistence)
    '--network=none', // no network at all (v1 — proxy deferred)
    '--cap-drop=ALL', // drop every Linux capability
    '--security-opt',
    'no-new-privileges', // no setuid escalation inside
    '--user',
    '1000:1000', // non-root
    '-v',
    `${workspaceRoot}:/workspace`, // ONLY host path visible, writable
    '-w',
    '/workspace', // run in the workspace
    image,
    cmd,
    ...args,
  ];
}

/** Default runner: shell out to the `docker` CLI, capturing exit code + output. */
const defaultRunner: DockerRunner = (argv, { timeoutMs }) =>
  new Promise((resolve) => {
    execFile(
      'docker',
      argv,
      { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024, windowsHide: true },
      (err, stdout, stderr) => {
        const out = stdout;
        let errStr = stderr;
        if (err == null) {
          resolve({ exitCode: 0, stdout: out, stderr: errStr });
          return;
        }
        const code = (err as NodeJS.ErrnoException).code;
        if (typeof code === 'number') {
          // A nonzero container exit — a normal result, not a runner failure.
          resolve({ exitCode: code, stdout: out, stderr: errStr });
          return;
        }
        // Spawn failure / timeout / docker not found: surface as a nonzero exit
        // with the reason in stderr (the shell tool maps this to execution_error).
        if (errStr.trim() === '') errStr = `${code ?? 'error'}: ${err.message}`;
        resolve({ exitCode: 126, stdout: out, stderr: errStr });
      },
    );
  });

/**
 * Construct the `os` ConfinementProvider over an already-realpath'd workspace
 * root. `exec()` runs one command in a fresh locked-down container. The root is
 * the app workspace record's path, realpath'd once at run start (§3 seam) — this
 * factory does NOT realpath or touch the filesystem.
 */
export function dockerConfinement(
  workspaceRoot: string,
  options: DockerConfinementOptions = {},
): ConfinementProvider {
  const image = options.image ?? DEFAULT_IMAGE;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const run = options.run ?? defaultRunner;
  return {
    kind: 'os',
    workspaceRoot(): string {
      return workspaceRoot;
    },
    exec(cmd: string, args: string[]): Promise<ExecResult> {
      return run(buildArgv(workspaceRoot, image, cmd, args), { timeoutMs });
    },
  };
}
