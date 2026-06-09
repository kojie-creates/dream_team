// connectors/google.ts — the runtime's OWN Google connector access (ADR-001:
// the runtime imports NOTHING from app/). It mirrors what app/src/lib/connectors/
// googleCalendar.ts does, but uses the user-session RPC (get_connector_token,
// migration 0013) instead of a service-role read, and refreshes an expired token
// IN MEMORY for the run (no DB write-back in Phase A — Google permits re-refresh).
//
// Decryption uses the connector encryption key injected by the host (the desktop
// decrypts it from safeStorage and passes it in StartRunDeps.connectorConfig) — the
// runtime never reads env/secrets itself. AES-256-GCM, format `v1:<iv>:<tag>:<ct>`
// (the same format app/src/lib/connectors/tokenVault.ts writes).
//
// Network: these calls run in the Node runtime process (which has network) — only
// the docker SHELL is `--network=none`. The capability gate (CONr/CONw) governs use.

import { createDecipheriv } from 'node:crypto';
import { getConnectorTokenRpc, type SupabaseRpcClient } from '../db/client.ts';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REFRESH_LEEWAY_MS = 60_000; // refresh if expiring within 60s
const ALGO = 'aes-256-gcm';
const FORMAT_PREFIX = 'v1:';

/** Google providers the runtime can resolve a token for (must match connectors.provider). */
export type GoogleProvider = 'google_calendar' | 'gmail' | 'google_drive' | 'google_sheets';

export type ConnectorErrorCode =
  | 'not_connected'
  | 'token_missing'
  | 'decrypt_failed'
  | 'refresh_unavailable'
  | 'refresh_failed'
  | 'oauth_not_configured'
  | 'rpc_failed';

/** A connector failure with a stable code — tools map it to a model-readable execution_error. */
export class ConnectorError extends Error {
  constructor(
    public readonly code: ConnectorErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ConnectorError';
  }
}

/** Secrets the runtime needs to use Google connectors (injected by the host). */
export interface ConnectorConfig {
  /** 64-hex AES-256 key — the same CONNECTOR_TOKEN_ENCRYPTION_KEY the app encrypts with. */
  encryptionKeyHex: string;
  googleClientId: string;
  googleClientSecret: string;
}

/**
 * Pre-bound to ONE run's workspace: a tool just asks for a provider's bearer token.
 * The workspace id is captured by the factory so the model never supplies it.
 */
export interface ConnectorAccess {
  googleToken(provider: GoogleProvider): Promise<string>;
}

function loadKey(hex: string): Buffer {
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new ConnectorError('decrypt_failed', 'connector encryption key must be 64 hex chars.');
  }
  return Buffer.from(hex, 'hex');
}

/** Decrypt a `v1:<iv>:<tag>:<ct>` value (mirror of app tokenVault.decryptToken). */
function decryptToken(packed: string | null, key: Buffer): string | null {
  if (packed == null || packed === '') return null;
  if (!packed.startsWith(FORMAT_PREFIX)) {
    throw new ConnectorError('decrypt_failed', 'unrecognized connector ciphertext format.');
  }
  const parts = packed.slice(FORMAT_PREFIX.length).split(':');
  if (parts.length !== 3) {
    throw new ConnectorError('decrypt_failed', 'malformed connector ciphertext payload.');
  }
  const [ivB64, tagB64, ctB64] = parts as [string, string, string];
  try {
    const decipher = createDecipheriv(ALGO, key, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const pt = Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]);
    return pt.toString('utf8');
  } catch {
    throw new ConnectorError('decrypt_failed', 'connector token failed authentication/decryption.');
  }
}

/**
 * Resolve a usable Google access token for `provider` in `workspaceId`: read the
 * encrypted row via the RPC, decrypt, and refresh in-memory if expired/expiring.
 * Throws a ConnectorError on any miss (the tool surfaces it as execution_error).
 */
export async function resolveGoogleToken(
  supabase: SupabaseRpcClient,
  config: ConnectorConfig,
  workspaceId: string,
  provider: GoogleProvider,
): Promise<string> {
  const key = loadKey(config.encryptionKeyHex);
  const row = await getConnectorTokenRpc(supabase)(workspaceId, provider);
  if (!row) {
    throw new ConnectorError('not_connected', `${provider} is not connected for this workspace.`);
  }
  if (row.status !== 'connected') {
    throw new ConnectorError('not_connected', `${provider} connector status is "${row.status}".`);
  }
  const accessToken = decryptToken(row.access_token_encrypted, key);
  if (!accessToken) {
    throw new ConnectorError('token_missing', `No stored ${provider} access token — reconnect it.`);
  }

  const expiresAtMs = row.expires_at ? Date.parse(row.expires_at) : 0;
  const expiringSoon = !expiresAtMs || expiresAtMs - Date.now() < REFRESH_LEEWAY_MS;
  if (!expiringSoon) return accessToken;

  // Expiring/expired → refresh in memory. If still valid (within leeway) but no
  // refresh token, the current token is usable; only hard-fail when truly expired.
  const refreshToken = decryptToken(row.refresh_token_encrypted, key);
  if (!refreshToken) {
    if (expiresAtMs && expiresAtMs > Date.now()) return accessToken;
    throw new ConnectorError(
      'refresh_unavailable',
      `${provider} token expired and no refresh token is stored — reconnect it.`,
    );
  }
  if (!config.googleClientId || !config.googleClientSecret) {
    throw new ConnectorError('oauth_not_configured', 'Google client id/secret not configured.');
  }

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.googleClientId,
      client_secret: config.googleClientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }).toString(),
  });
  if (!res.ok) {
    throw new ConnectorError('refresh_failed', `${provider} token refresh failed (${res.status}).`);
  }
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) {
    throw new ConnectorError('refresh_failed', `${provider} refresh returned no access_token.`);
  }
  return json.access_token;
}

/** Bind a run's supabase + config + workspace into the ConnectorAccess tools consume. */
export function makeConnectorAccess(
  supabase: SupabaseRpcClient,
  config: ConnectorConfig,
  workspaceId: string,
): ConnectorAccess {
  return {
    googleToken: (provider) => resolveGoogleToken(supabase, config, workspaceId, provider),
  };
}
