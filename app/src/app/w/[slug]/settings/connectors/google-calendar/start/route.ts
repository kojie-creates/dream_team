// Phase 5 T3 — Google Calendar OAuth start route.
// Auth + workspace membership check via RLS-gated session client, then
// redirect to Google's consent screen. Read-only Calendar scope only.

import { NextResponse, type NextRequest } from 'next/server';
import { randomBytes } from 'node:crypto';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { googleCallbackUrl } from '@/lib/connectors/googleOAuth';
import { signState } from '@/lib/connectors/oauthState';
import { env } from '@/env';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const NONCE_COOKIE = 'gcal_oauth_nonce';
const BASE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/calendar.readonly',
];
// Phase 5 T6 — optional bounded write scope. Requested only when caller
// explicitly opts in via ?write=1. No broader Google scope is ever requested.
const WRITE_SCOPE = 'https://www.googleapis.com/auth/calendar.events';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const url = new URL(request.url);
  const origin = url.origin;
  const wantWrite = url.searchParams.get('write') === '1';
  const scopes = wantWrite ? [...BASE_SCOPES, WRITE_SCOPE] : BASE_SCOPES;

  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return NextResponse.redirect(
      new URL(
        `/w/${slug}/settings/connectors?error=${encodeURIComponent('Google OAuth is not configured on this server.')}`,
        origin,
      ),
    );
  }
  if (!env.CONNECTOR_TOKEN_ENCRYPTION_KEY) {
    return NextResponse.redirect(
      new URL(
        `/w/${slug}/settings/connectors?error=${encodeURIComponent('Connector token encryption key is not configured.')}`,
        origin,
      ),
    );
  }

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

  // RLS-gated membership check. If the caller is not a member, this returns
  // no row and we treat it as not-found rather than leaking existence.
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('id, slug')
    .eq('slug', slug)
    .maybeSingle();
  if (!workspace) {
    return NextResponse.redirect(new URL('/', origin));
  }

  const nonce = randomBytes(24).toString('base64url');
  // HMAC-signed state — a tampered payload is rejected at the callback before any
  // DB work. The nonce is also set as an httpOnly cookie below (browser binding).
  const state = signState({
    s: workspace.slug,
    w: workspace.id,
    p: 'google_calendar',
    n: nonce,
  });

  // Product-wide fixed callback (no slug in the path) — the workspace travels in
  // `state` and is recovered there. One registered redirect URI for all workspaces.
  const redirectUri = googleCallbackUrl();

  const authUrl = new URL(GOOGLE_AUTH_URL);
  authUrl.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', scopes.join(' '));
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('include_granted_scopes', 'true');
  authUrl.searchParams.set('prompt', 'consent');
  authUrl.searchParams.set('state', state);

  const res = NextResponse.redirect(authUrl);
  res.cookies.set(NONCE_COOKIE, nonce, {
    httpOnly: true,
    secure: origin.startsWith('https://'),
    sameSite: 'lax',
    // Path '/' so the FIXED callback (/api/connectors/google/callback) receives it —
    // the cookie is set under /w/[slug]/start but read under /api. httpOnly + 10-min
    // TTL keep it tight despite the wider path.
    path: '/',
    maxAge: 600, // 10 minutes
  });
  return res;
}
