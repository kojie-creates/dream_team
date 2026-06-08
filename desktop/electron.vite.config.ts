import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

// Main + preload externalize node deps (resolved from node_modules at runtime);
// the local ../runtime SOURCE is bundled into main (it is not a node_modules pkg).
// Renderer is a normal Vite+React build.
export default defineConfig({
  main: { plugins: [externalizeDepsPlugin()] },
  preload: { plugins: [externalizeDepsPlugin()] },
  renderer: { plugins: [react()] },
});
