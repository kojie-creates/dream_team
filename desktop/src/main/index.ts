// Electron main — hosts the governed runtime (ADR Decision 1). The renderer is the
// UI; it triggers runs over IPC. This file is the ONLY place Electron + the runtime
// meet: it hands the runtime's `registerRunStart` the REAL ipcMain + safeStorage, so
// the gate/loop/confinement core stays electron-free and unit-tested.
//
// Secret posture (Decision 7): the BYOK Anthropic key + the Supabase user session are
// stored OS-encrypted (keystore.ts) and decrypted only here in main. No service-role
// key exists in this app; the runtime's only DB identity is the user's session.

import { app, BrowserWindow, ipcMain, safeStorage, shell } from 'electron';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { WebSocket as WsWebSocket } from 'ws';

// Portable layout: when packaged, keep ALL app data (encrypted secrets + run
// workspaces) in a `data/` folder NEXT TO the exe instead of scattering into
// %APPDATA%/%LOCALAPPDATA%. Makes the whole app one movable folder.
// Must run before app-ready and before any getPath('userData') read. (DPAPI is
// user-scoped, so encrypted secrets survive a move on the same Windows user;
// moved to another user/machine they simply won't decrypt and get re-entered.)
// A redirect failure must NOT brick startup — fall back to the default userData.
if (app.isPackaged) {
  try {
    const portableData = join(dirname(app.getPath('exe')), 'data');
    mkdirSync(portableData, { recursive: true });
    app.setPath('userData', portableData);
  } catch {
    /* keep default userData */
  }
}

// supabase-js constructs a RealtimeClient that requires a global WebSocket; Electron's
// Node 18 runtime has none. We never use realtime, but the constructor demands it — so
// polyfill it process-wide BEFORE any createClient runs (run-prep + the runtime adapter).
if (!(globalThis as { WebSocket?: unknown }).WebSocket) {
  (globalThis as { WebSocket?: unknown }).WebSocket = WsWebSocket;
}

import { registerRunStart } from '../../../runtime/src/host/electron-adapter.ts';
import type { AdapterConfig } from '../../../runtime/src/host/electron-adapter.ts';
import { writeFileTool } from '../../../runtime/src/tools/write-file.ts';
import { roleGrant } from '../../../runtime/src/gate/grants.ts';
import type { ApprovalSet } from '../../../runtime/src/gate/types.ts';

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.ts';
import { saveSecret, loadSecretBytes, hasSecret, clearSecret } from './keystore.ts';
import { registerRunPrep } from './run-prep.ts';

const dir = __dirname;

const NO_APPROVALS: ApprovalSet = { standing: new Set(), perAction: new Set() };

/** The adapter config: public Supabase + secret loaders + slice-1 grants/tools. */
function adapterConfig(): AdapterConfig {
  return {
    supabase: { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY },
    loadEncryptedAnthropicKey: () => {
      const b = loadSecretBytes('anthropic_key');
      if (!b) throw new Error('Anthropic key not set — add it in Settings.');
      return b;
    },
    loadEncryptedSession: () => {
      const b = loadSecretBytes('supabase_session');
      if (!b) throw new Error('Not signed in — sign in first.');
      return b;
    },
    grantFor: (role) => {
      const g = roleGrant(role);
      if (!g) throw new Error(`no capability grant for role: ${role}`);
      return g;
    },
    approvalsFor: () => NO_APPROVALS,
    tools: [writeFileTool],
    // failureEmitter omitted → the runtime uses the append_packet RPC sink.
    // makeSupabaseClient / makeModelClient omitted → real supabase-js + Anthropic SDK.
  };
}

/** Keystore + workspace IPC the renderer calls (the run:start handler is registered by the runtime). */
function registerHostIpc(): void {
  ipcMain.handle('keystore:save-key', (_e, value: string) => {
    saveSecret('anthropic_key', value);
    return { ok: true };
  });
  ipcMain.handle('keystore:save-session', (_e, sessionJson: string) => {
    saveSecret('supabase_session', sessionJson);
    return { ok: true };
  });
  ipcMain.handle('keystore:status', () => ({
    hasKey: hasSecret('anthropic_key'),
    hasSession: hasSecret('supabase_session'),
    encryptionAvailable: safeStorage.isEncryptionAvailable(),
  }));
  ipcMain.handle('keystore:clear', () => {
    clearSecret('anthropic_key');
    clearSecret('supabase_session');
    return { ok: true };
  });
  ipcMain.handle('keystore:clear-session', () => {
    clearSecret('supabase_session');
    return { ok: true };
  });

  // Open a run's output folder in the OS file explorer.
  ipcMain.handle('shell:open-path', async (_e, p: string) => {
    await shell.openPath(p);
    return { ok: true };
  });
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1100,
    height: 750,
    show: false,
    webPreferences: {
      preload: join(dir, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
    },
  });
  win.on('ready-to-show', () => win.show());

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void win.loadFile(join(dir, '../renderer/index.html'));
  }
}

void app.whenReady().then(() => {
  registerHostIpc();
  registerRunPrep();
  registerRunStart(ipcMain, safeStorage, adapterConfig());
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
