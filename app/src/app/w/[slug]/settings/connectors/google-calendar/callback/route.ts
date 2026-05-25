// Phase 5 T3 — Google Calendar OAuth callback.
// Order of operations is load-bearing:
//   1. Validate user session (anon-key client).
//   2. Confirm workspace membership via RLS-gated read.
//   3. Validate state cookie + state param.
//   4. Exchange code with Google.
//   5. Identify provider account (userinfo).
//   6. ONLY THEN use service-role to upsert connector + encrypted tokens.

import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service';
import { encryptToken } from '@/lib/connectors/tokenVault';
import { env } from '@/env';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';
const NONCE_COOKIE = 'gcal_oauth_nonce';

type StatePayload = {
  s: string;
  w: string;
  p: string;
  n: string;
};

function parseState(raw: string): StatePayload | null {
  try {
    const padded = raw + '='.repeat((4 - (raw.length % 4)) % 4);
    const json = Buffer.from(
      padded.replace(/-/g, '+').replace(/_/g, '/'),
      'base64',
    ).toString('utf8');
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

function redirectBack(origin: string, slug: string, error?: string) {
  const url = new URL(`/w/${slug}/settings/connectors`, origin);
  if (error) url.searchParams.set('error', error);
  return NextResponse.redirect(url);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const url = new URL(request.url);
  const origin = url.origin;
  const code = url.searchParams.get('code');
  const stateRaw = url.searchParams.get('state');
  const providerError = url.searchParams.get('error');

  if (providerError) {
    return redirectBack(origin, slug, `Google returned: ${providerError}`);
  }
  if (!code || !stateRaw) {
    return redirectBack(origin, slug, 'Missing code or state.');
  }
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return redirectBack(origin, slug, 'Google OAuth is not configured.');
  }
  if (!env.CONNECTOR_TOKEN_ENCRYPTION_KEY) {
    return redirectBack(origin, slug, 'Token encryption key missing.');
  }

  const state = parseState(stateRaw);
  if (!state) return redirectBack(origin, slug, 'Invalid state.');
  if (state.p !== 'google_calendar') {
    return redirectBack(origin, slug, 'State provider mismatch.');
  }
  if (state.s !== slug) {
    return redirectBack(origin, slug, 'State workspace mismatch.');
  }

  const nonceCookie = request.cookies.get(NONCE_COOKIE)?.value;
  if (!nonceCookie || nonceCookie !== state.n) {
    return redirectBack(origin, slug, 'OAuth nonce mismatch.');
  }

  // (1) auth check
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(
      new URL(
        `/signin?next=${encodeURIComponent(`/w/${slug}/settings/connectors`)}`,
        origin,
      ),
    );
  }

  // (2) workspace membership via RLS-gated read
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('id, slug')
    .eq('slug', slug)
    .maybeSingle();
  if (!workspace || workspace.id !== state.w) {
    return redirectBack(origin, slug, 'Workspace check failed.');
  }

  // (4) token exchange
  const redirectUri = `${env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')}/w/${workspace.slug}/settings/connectors/google-calendar/callback`;
  const tokenBody = new URLSearchParams({
    code,
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });
  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: tokenBody.toString(),
    cache: 'no-store',
  });
  if (!tokenRes.ok) {
    return redirectBack(origin, slug, `Token exchange failed (${tokenRes.status}).`);
  }
  const tokenJson = (await tokenRes.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    token_type?: string;
  };
  if (!tokenJson.access_token) {
    return redirectBack(origin, slug, 'No access_token in response.');
  }

  // (5) identify account (best-effort; failure does not abort connect)
  let accountEmail: string | null = null;
  let accountId: string | null = null;
  try {
    const uiRes = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
      cache: 'no-store',
    });
    if (uiRes.ok) {
      const ui = (await uiRes.json()) as { sub?: string; email?: string };
      accountEmail = ui.email ?? null;
      accountId = ui.sub ?? null;
    }
  } catch {
    // ignore; we already have tokens
  }

  const grantedScopes = (tokenJson.scope ?? '').split(/\s+/).filter(Boolean);
  const expiresAt =
    typeof tokenJson.expires_in === 'number'
      ? new Date(Date.now() + tokenJson.expires_in * 1000).toISOString()
      : null;

  // (6) service-role upsert — only reached after auth + workspace check passed
  const admin = createSupabaseServiceRoleClient();
  const nowIso = new Date().toISOString();

  const { data: connectorRow, error: upsertErr } = await admin
    .from('connectors')
    .upsert(
      {
        workspace_id: workspace.id,
        provider: 'google_calendar',
        status: 'connected',
        scopes: grantedScopes,
        connected_by: user.id,
        connected_at: nowIso,
        last_error: null,
        updated_at: nowIso,
      },
      { onConflict: 'workspace_id,provider' },
    )
    .select('id')
    .single();
  if (upsertErr || !connectorRow) {
    return redirectBack(origin, slug, `Connector upsert failed: ${upsertErr?.message ?? 'unknown'}`);
  }

  const { error: tokenErr } = await admin.from('connector_tokens').upsert(
    {
      connector_id: connectorRow.id,
      access_token_encrypted: encryptToken(tokenJson.access_token),
      refresh_token_encrypted: encryptToken(tokenJson.refresh_token ?? null),
      expires_at: expiresAt,
      token_type: tokenJson.token_type ?? null,
      provider_account_id: accountId,
      provider_account_email: accountEmail,
      updated_at: nowIso,
    },
    { onConflict: 'connector_id' },
  );
  if (tokenErr) {
    return redirectBack(origin, slug, `Token persist failed: ${tokenErr.message}`);
  }

  const res = redirectBack(origin, slug);
  res.cookies.delete(NONCE_COOKIE);
  return res;
}
