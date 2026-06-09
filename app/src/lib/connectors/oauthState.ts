// HMAC-signed OAuth `state` (phase 6 hardening — was: unsigned base64 JSON).
//
// `state` round-trips through the user's browser and Google, so it is attacker-
// mutable. Signing it makes tampering detectable: the callback rejects any state
// whose signature does not verify, BEFORE any DB work. This complements (does not
// replace) the nonce cookie — the cookie binds state to the browser that ran
// /start; the signature binds the payload to this server. Both must hold.
//
// Key: a domain-separated subkey derived from CONNECTOR_TOKEN_ENCRYPTION_KEY (which
// OAuth already requires), so there is no new env var and no extra operator setup.
// The raw encryption key is never used directly to sign — the label separates uses.

import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '@/env';

const STATE_KEY_LABEL = 'oauth-state-v1';

export type StatePayload = {
  s: string; // workspace slug
  w: string; // workspace id
  p: string; // provider (e.g. 'google_calendar')
  n: string; // nonce (also set as an httpOnly cookie during /start)
};

/** Domain-separated HMAC key derived from the connector encryption key. */
function stateKey(): Buffer {
  const hex = env.CONNECTOR_TOKEN_ENCRYPTION_KEY;
  if (!hex) {
    throw new Error('CONNECTOR_TOKEN_ENCRYPTION_KEY is required to sign OAuth state.');
  }
  // Use the key bytes as the HMAC key over a fixed label → a stable subkey that is
  // never the raw encryption key (domain separation between encryption and signing).
  return createHmac('sha256', Buffer.from(hex, 'hex')).update(STATE_KEY_LABEL).digest();
}

/** `state` = base64url(JSON payload) + "." + base64url(HMAC-SHA256(body)). */
export function signState(payload: StatePayload): string {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = createHmac('sha256', stateKey()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

/**
 * Verify the signature and shape. Returns the payload, or null if the signature is
 * missing/invalid, the body is malformed, or any required field is absent. The
 * signature is checked in constant time before the JSON is parsed.
 */
export function verifyState(raw: string): StatePayload | null {
  const dot = raw.indexOf('.');
  if (dot <= 0 || dot === raw.length - 1) return null;
  const body = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);

  const expected = createHmac('sha256', stateKey()).update(body).digest();
  let actual: Buffer;
  try {
    actual = Buffer.from(sig, 'base64url');
  } catch {
    return null;
  }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return null;
  }

  try {
    const json = Buffer.from(body, 'base64url').toString('utf8');
    const obj = JSON.parse(json) as Partial<StatePayload>;
    if (
      typeof obj.s !== 'string' ||
      typeof obj.w !== 'string' ||
      typeof obj.p !== 'string' ||
      typeof obj.n !== 'string'
    ) {
      return null;
    }
    return obj as StatePayload;
  } catch {
    return null;
  }
}
