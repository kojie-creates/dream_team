// keystore — OS-encrypted secret storage in Electron main (DPAPI on Windows via
// safeStorage), generalized from InnerLight's keystore.ts for the two secrets the
// runtime needs: the BYOK Anthropic key and the Supabase user session JSON.
//
// Each secret is stored as its safeStorage-ENCRYPTED bytes in a file under the app's
// userData dir. The runtime adapter (registerRunStart) is handed the ENCRYPTED buffer
// and decrypts it with safeStorage at call time — so plaintext never sits on disk and
// the renderer never sees it. If OS encryption is unavailable the value is stored as
// plaintext bytes (matching the InnerLight fallback); the adapter refuses to run when
// encryption is unavailable, so a real run never depends on the plaintext path.

import { app, safeStorage } from 'electron';
import { existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

/** The named secrets this app persists. */
export type SecretName = 'anthropic_key' | 'supabase_session';

function fileFor(name: SecretName): string {
  return join(app.getPath('userData'), `.${name}`);
}

/** Encrypt (when available) + persist a secret. */
export function saveSecret(name: SecretName, value: string): void {
  const bytes = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(value)
    : Buffer.from(value, 'utf8');
  writeFileSync(fileFor(name), bytes);
}

/** Return the raw ENCRYPTED bytes (for the adapter to decrypt), or null if absent. */
export function loadSecretBytes(name: SecretName): Buffer | null {
  const p = fileFor(name);
  if (!existsSync(p)) return null;
  try {
    return readFileSync(p);
  } catch {
    return null;
  }
}

/** Decrypt + return the plaintext (renderer-facing checks should NOT use this). */
export function loadSecretString(name: SecretName): string | null {
  const bytes = loadSecretBytes(name);
  if (!bytes) return null;
  try {
    return safeStorage.isEncryptionAvailable()
      ? safeStorage.decryptString(bytes)
      : bytes.toString('utf8');
  } catch {
    return null;
  }
}

export function hasSecret(name: SecretName): boolean {
  return existsSync(fileFor(name));
}

export function clearSecret(name: SecretName): void {
  const p = fileFor(name);
  if (existsSync(p)) rmSync(p);
}
