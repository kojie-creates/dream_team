// SERVER-ONLY. Encrypts connector OAuth tokens at rest with AES-256-GCM.
// Never import from a client component. Output format embeds IV + auth tag
// alongside ciphertext so decrypt can recover both without a side channel.

import 'server-only';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { env } from '@/env';

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12; // 96-bit nonce — GCM standard
const KEY_BYTES = 32; // AES-256
const FORMAT_PREFIX = 'v1:';

function loadKey(): Buffer {
  const hex = env.CONNECTOR_TOKEN_ENCRYPTION_KEY;
  if (!hex) {
    throw new Error(
      'CONNECTOR_TOKEN_ENCRYPTION_KEY is not set. Configure a 64-char hex key (32 bytes) before storing connector tokens.',
    );
  }
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error(
      'CONNECTOR_TOKEN_ENCRYPTION_KEY must be 64 hex chars (32 bytes) for AES-256-GCM.',
    );
  }
  const buf = Buffer.from(hex, 'hex');
  if (buf.length !== KEY_BYTES) {
    throw new Error('CONNECTOR_TOKEN_ENCRYPTION_KEY decoded to wrong length.');
  }
  return buf;
}

/**
 * Encrypts a UTF-8 string. Output: `v1:<iv_b64>:<tag_b64>:<cipher_b64>`.
 * Returns null for null/undefined input so callers can pass through optional
 * refresh tokens without branching.
 */
export function encryptToken(plain: string | null | undefined): string | null {
  if (plain == null || plain === '') return null;
  const key = loadKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${FORMAT_PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
}

/**
 * Decrypts a value produced by encryptToken. Returns null for null input.
 * Throws on tampered or malformed input — auth tag verification is enforced
 * by the GCM implementation.
 */
export function decryptToken(packed: string | null | undefined): string | null {
  if (packed == null || packed === '') return null;
  if (!packed.startsWith(FORMAT_PREFIX)) {
    throw new Error('connector_tokens: unrecognized ciphertext format.');
  }
  const body = packed.slice(FORMAT_PREFIX.length);
  const parts = body.split(':');
  if (parts.length !== 3) {
    throw new Error('connector_tokens: malformed ciphertext payload.');
  }
  const [ivB64, tagB64, ctB64] = parts as [string, string, string];
  const key = loadKey();
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const ct = Buffer.from(ctB64, 'base64');
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString('utf8');
}
