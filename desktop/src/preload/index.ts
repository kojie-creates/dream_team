// Preload — the renderer's only bridge to main. Exposes a generic invoke/on surface
// on window.api (contextIsolation on; the renderer never touches Node or ipcRenderer
// directly). Mirrors the proven InnerLight preload.
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  invoke: (channel: string, ...args: unknown[]): Promise<unknown> =>
    ipcRenderer.invoke(channel, ...args),
  on: (channel: string, listener: (...args: unknown[]) => void): (() => void) => {
    const wrapped = (_event: unknown, ...args: unknown[]): void => listener(...args);
    ipcRenderer.on(channel, wrapped as Parameters<typeof ipcRenderer.on>[1]);
    return () => ipcRenderer.removeListener(channel, wrapped as Parameters<typeof ipcRenderer.on>[1]);
  },
});
