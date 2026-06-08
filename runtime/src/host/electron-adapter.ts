// host/electron-adapter.ts — the ONE electron-aware seam (ADR-001 Decision 1,
// "Decoupling rule"). It wires the renderer→main `run:start` IPC to `startRun`.
//
// CRITICAL: this file imports NOTHING from the electron module. electron is not a
// runtime dependency — the runtime is a decoupled module the desktop app (the
// InnerLight-derived shell) consumes. So `ipcMain` and `safeStorage` are passed in
// as STRUCTURAL types matching exactly the methods used. The real Electron objects
// satisfy these shapes; tests pass fakes. This keeps the entire `runtime/` package
// unit-testable with no Electron runtime (preserves the T0 harness contract).
//
// Secret handling (Decision 7 / §4 risk #3): the BYOK Anthropic key and the
// Supabase user session are decrypted from `safeStorage` HERE, in main, and never
// cross into the renderer or into a tool's execute(). The runtime holds no
// service-role key — its only DB identity is the user session.

import { startRun, WorkspaceMembershipError } from '../index.ts';
import type { StartRunDeps } from '../index.ts';
import type { ApprovalSet, RoleGrant } from '../gate/types.ts';
import type { ToolDef } from '../tools/types.ts';
import type { FailurePacketEmitter } from '../packets/failure.ts';
import type { LoopMessage } from '../loop/run-loop.ts';
import type { ModelClient } from '../model/client.ts';
import { anthropicModelClient } from '../model/client.ts';
import { createUserSessionClient } from '../db/client.ts';
import type { SupabaseConfig, SupabaseRpcClient, UserSession } from '../db/client.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyToolDef = ToolDef<any>;

/** Structural subset of Electron's `ipcMain` (only `handle` is used). */
export interface IpcMainLike {
  handle(
    channel: string,
    listener: (event: unknown, ...args: unknown[]) => Promise<unknown> | unknown,
  ): void;
}

/** Structural subset of Electron's `safeStorage` (decrypt secrets at rest). */
export interface SafeStorageLike {
  isEncryptionAvailable(): boolean;
  decryptString(encrypted: Buffer): string;
}

/** The renderer's `run:start` payload (request-specific run parameters). */
export interface RunStartRequest {
  workspaceId: string;
  ticketId: string;
  role: string;
  system: string;
  messages: LoopMessage[];
  maxTokens: number;
  workspaceRoot: string;
}

/** IPC reply — discriminated so the renderer can branch on outcome without try/catch. */
export type RunStartReply =
  | { ok: true; state: string; iterations: number; costUsd: number }
  | { ok: false; error: 'forbidden' | 'run_failed'; detail: string };

/**
 * Host configuration + the policy/secret hooks the adapter needs. Everything that
 * touches Electron, disk, or the network is injected, so the adapter is a pure
 * function of its inputs and fully testable.
 */
export interface AdapterConfig {
  supabase: SupabaseConfig;
  /** safeStorage-encrypted BYOK Anthropic key (decrypted in main only). */
  loadEncryptedAnthropicKey(): Buffer;
  /** safeStorage-encrypted JSON `{ accessToken, refreshToken }` (the user session). */
  loadEncryptedSession(): Buffer;
  /** The capability grant for a role (GOVERNANCE_SPEC §4 matrix). */
  grantFor(role: string): RoleGrant;
  /** Standing + per-action approvals for this request (T1 actions). */
  approvalsFor(req: RunStartRequest): ApprovalSet;
  /** Tools surfaced to the model. Production slice-1: [writeFileTool]. */
  tools: AnyToolDef[];
  /**
   * Optional failure-packet persistence override. When omitted, startRun builds the
   * RPC-backed sink (append_packet) so halts persist as `packets` rows under RLS.
   */
  failureEmitter?: FailurePacketEmitter;
  /** Test seam: build the user-session client. Defaults to the real supabase-js path. */
  makeSupabaseClient?: (config: SupabaseConfig, session: UserSession) => Promise<SupabaseRpcClient>;
  /** Test seam: build the model client. Defaults to the real Anthropic SDK wrapper. */
  makeModelClient?: (apiKey: string) => ModelClient;
}

/**
 * Register the `run:start` IPC handler. The handler decrypts the BYOK key + user
 * session in main, builds the user-scoped Supabase client + model client, and
 * dispatches `startRun`. A non-member request returns `forbidden` (the run never
 * starts); any other failure returns `run_failed`. The handler never throws across
 * the IPC boundary — it always resolves a structured reply.
 */
export function registerRunStart(
  ipcMain: IpcMainLike,
  safeStorage: SafeStorageLike,
  config: AdapterConfig,
): void {
  const makeSupabaseClient = config.makeSupabaseClient ?? createUserSessionClient;
  const makeModelClient = config.makeModelClient ?? anthropicModelClient;

  ipcMain.handle('run:start', async (_event: unknown, ...args: unknown[]): Promise<RunStartReply> => {
    const req = args[0] as RunStartRequest;
    try {
      if (!safeStorage.isEncryptionAvailable()) {
        return { ok: false, error: 'run_failed', detail: 'OS secret storage unavailable' };
      }
      const apiKey = safeStorage.decryptString(config.loadEncryptedAnthropicKey());
      const session = JSON.parse(
        safeStorage.decryptString(config.loadEncryptedSession()),
      ) as UserSession;

      const supabase = await makeSupabaseClient(config.supabase, session);
      const modelClient = makeModelClient(apiKey);

      const deps: StartRunDeps = {
        supabase,
        modelClient,
        tools: config.tools,
        ...(config.failureEmitter ? { failureEmitter: config.failureEmitter } : {}),
      };

      const result = await startRun(
        {
          workspaceId: req.workspaceId,
          ticketId: req.ticketId,
          role: req.role,
          grant: config.grantFor(req.role),
          approvals: config.approvalsFor(req),
          system: req.system,
          messages: req.messages,
          maxTokens: req.maxTokens,
          workspaceRoot: req.workspaceRoot,
        },
        deps,
      );

      return {
        ok: true,
        state: result.state,
        iterations: result.iterations,
        costUsd: result.cost.costUsd,
      };
    } catch (err) {
      if (err instanceof WorkspaceMembershipError) {
        return { ok: false, error: 'forbidden', detail: err.message };
      }
      return {
        ok: false,
        error: 'run_failed',
        detail: err instanceof Error ? err.message : String(err),
      };
    }
  });
}
