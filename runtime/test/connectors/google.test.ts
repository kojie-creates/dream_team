// resolveGoogleToken — reads the encrypted token via the RPC, decrypts with the
// connector key, and refreshes in-memory when expired. Uses a fake supabase rpc +
// a local encrypt mirroring app tokenVault's v1 format.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { createCipheriv, randomBytes } from 'node:crypto';
import { resolveGoogleToken, ConnectorError, type ConnectorConfig } from '../../src/connectors/google.ts';
import type { SupabaseRpcClient } from '../../src/db/client.ts';

const KEY_HEX = 'ab'.repeat(32); // 64 hex
const config: ConnectorConfig = { encryptionKeyHex: KEY_HEX, googleClientId: 'cid', googleClientSecret: 'sec' };

afterEach(() => vi.unstubAllGlobals());

/** Encrypt like app tokenVault: v1:<iv>:<tag>:<ct>. */
function enc(plain: string): string {
  const key = Buffer.from(KEY_HEX, 'hex');
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  const tag = c.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
}

function fakeSupabase(row: unknown): SupabaseRpcClient {
  return {
    async rpc(fn) {
      if (fn === 'get_connector_token') return { data: row === null ? null : [row], error: null };
      return { data: null, error: null };
    },
  };
}

describe('resolveGoogleToken', () => {
  it('decrypts and returns a still-valid access token (no refresh)', async () => {
    const row = {
      connector_id: 'c1',
      status: 'connected',
      access_token_encrypted: enc('access-123'),
      refresh_token_encrypted: enc('refresh-123'),
      expires_at: new Date(Date.now() + 3600_000).toISOString(), // 1h out
      token_type: 'Bearer',
    };
    const token = await resolveGoogleToken(fakeSupabase(row), config, 'ws-1', 'google_calendar');
    expect(token).toBe('access-123');
  });

  it('refreshes in-memory when the access token is expired', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ access_token: 'fresh-999' }) })));
    const row = {
      connector_id: 'c1',
      status: 'connected',
      access_token_encrypted: enc('stale'),
      refresh_token_encrypted: enc('refresh-123'),
      expires_at: new Date(Date.now() - 1000).toISOString(), // already expired
      token_type: 'Bearer',
    };
    const token = await resolveGoogleToken(fakeSupabase(row), config, 'ws-1', 'google_calendar');
    expect(token).toBe('fresh-999');
  });

  it('throws not_connected when the RPC returns no row', async () => {
    await expect(
      resolveGoogleToken(fakeSupabase(null), config, 'ws-1', 'gmail'),
    ).rejects.toBeInstanceOf(ConnectorError);
  });

  it('throws not_connected when status is not connected', async () => {
    const row = { connector_id: 'c1', status: 'revoked', access_token_encrypted: enc('x'), refresh_token_encrypted: null, expires_at: null, token_type: null };
    await expect(
      resolveGoogleToken(fakeSupabase(row), config, 'ws-1', 'google_calendar'),
    ).rejects.toMatchObject({ code: 'not_connected' });
  });
});
