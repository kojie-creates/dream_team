// T6 decoupling guard (ADR-001 Decision 1 "Decoupling rule"): NO file under
// runtime/src may import `electron`. The Electron host passes ipcMain/safeStorage as
// structural types into host/electron-adapter.ts — so even the adapter is
// electron-free, and the whole package stays unit-testable with no Electron runtime.

import { describe, it, expect } from 'vitest';
import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src');

async function tsFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const ent of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, ent.name);
    if (ent.isDirectory()) out.push(...(await tsFiles(full)));
    else if (ent.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

const ELECTRON_IMPORT = /(?:from\s+|import\s+|require\(\s*)['"]electron['"]/;

describe('runtime/src decoupling', () => {
  it('no src file imports electron', async () => {
    const files = await tsFiles(SRC);
    expect(files.length).toBeGreaterThan(10); // sanity: we actually scanned the tree
    const offenders: string[] = [];
    for (const f of files) {
      if (ELECTRON_IMPORT.test(await readFile(f, 'utf8'))) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });
});
