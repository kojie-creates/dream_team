// Typed wrapper around window.api (exposed by the preload). All renderer→main calls
// go through invoke<T>; runs that stream progress use on<T>.

declare global {
  interface Window {
    api: {
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
      on: (channel: string, listener: (...args: unknown[]) => void) => () => void;
    };
  }
}

export function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  return window.api.invoke(channel, ...args) as Promise<T>;
}

export function on<T>(channel: string, listener: (data: T) => void): () => void {
  return window.api.on(channel, (data: unknown) => listener(data as T));
}

/** Shapes returned by the host IPC handlers (main/index.ts). */
export interface KeystoreStatus {
  hasKey: boolean;
  hasSession: boolean;
  encryptionAvailable: boolean;
}
export type RunStartReply =
  | { ok: true; state: string; iterations: number; costUsd: number }
  | { ok: false; error: 'forbidden' | 'run_failed'; detail: string };

export interface RunPrepResult {
  workspaceId: string;
  ticketId: string;
  workspaceRoot: string;
}
