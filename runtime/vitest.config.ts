import { defineConfig } from 'vitest/config';

// T0 vitest config. Node environment; the harness is deterministic and
// network-free (injectable model client). No electron, no globals.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
