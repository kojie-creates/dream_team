// Product-wide Google OAuth callback (one fixed URI for every workspace + scope).
//
// The path no longer carries the workspace slug — the OAuth `state` carries it
// (s = slug, w = workspace id), and we derive the target workspace from there. The
// security guards are unchanged from the per-slug version and do not rely on the URL:
//   1. nonce cookie must equal state.n  → CSRF: state must match a real /start this
//      browser initiated (the nonce cookie is httpOnly, set during /start).
//   2. session user via getUser()        → the caller is signed in.
//   3. RLS-gated workspace read on state.s, id === state.w → the caller is a MEMBER
//      of exactly the workspace named in state. A tampered state cannot widen reach.
// Only after all three do we exchange the code and use service-role to persist tokens.

import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service';
import { encryptToken } from '@/lib/connectors/tokenVault';
import { googleCallbackUrl } from '@/lib/connectors/googleOAuth';
import { verifyState } from '@/lib/connectors/oauthState';
import { env } from '@/env';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';
const NONCE_COOKIE = 'gcal_oauth_nonce';

function redirectBack(origin: string, slug: string, error?: string) {
  const url = new URL(`/w/${slug}/settings/connectors`, origin);
  if (error) url.searchParams.set('error', error);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const origin = url.origin;
  const code = url.searchParams.get('code');
  const stateRaw = url.searchParams.get('state');
  const providerError = url.searchParams.get('error');

  // Verify + parse state first — the signature is checked before anything else, and
  // the slug for any redirect is derived from it (no URL slug). A tampered or
  // unsigned state fails here and never reaches the DB.
  const state = stateRaw ? verifyState(stateRaw) : null;
  const slug = state?.s ?? null;
  // When state is unreadable we have no workspace to return to; fall back to root.
  const fail = (error: string) =>
    slug ? redirectBack(origin, slug, error) : NextResponse.redirect(new URL('/', origin));

  if (providerError) return fail(`Google returned: ${providerError}`);
  if (!code || !stateRaw) return fail('Missing code or state.');
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return fail('Google OAuth is not configured.');
  if (!env.CONNECTOR_TOKEN_ENCRYPTION_KEY) return fail('Token encryption key missing.');
  if (!state) return fail('Invalid state.');
  if (state.p !== 'google_calendar') return fail('State provider mismatch.');

  const nonceCookie = request.cookies.get(NONCE_COOKIE)?.value;
  if (!nonceCookie || nonceCookie !== state.n) return fail('OAuth nonce mismatch.');

  // (1) auth check
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(
      new URL(
        `/signin?next=${encodeURIComponent(`/w/${state.s}/settings/connectors`)}`,
        origin,
      ),
    );
  }

  // (2) workspace membership via RLS-gated read — derived from state, verified by id.
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('id, slug')
    .eq('slug', state.s)
    .maybeSingle();
  if (!workspace || workspace.id !== state.w) {
    return fail('Workspace check failed.');
  }

  // (4) token exchange — fixed redirect URI (must equal the one /start sent).
  const redirectUri = googleCallbackUrl();
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
    return redirectBack(origin, workspace.slug, `Token exchange failed (${tokenRes.status}).`);
  }
  const tokenJson = (await tokenRes.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    token_type?: string;
  };
  if (!tokenJson.access_token) {
    return redirectBack(origin, workspace.slug, 'No access_token in response.');
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
    return redirectBack(origin, workspace.slug, `Connector upsert failed: ${upsertErr?.message ?? 'unknown'}`);
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
    return redirectBack(origin, workspace.slug, `Token persist failed: ${tokenErr.message}`);
  }

  const res = redirectBack(origin, workspace.slug);
  res.cookies.delete(NONCE_COOKIE);
  return res;
}
