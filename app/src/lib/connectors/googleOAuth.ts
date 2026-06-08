// Single source of truth for the Google OAuth callback location.
//
// The callback is PRODUCT-WIDE and fixed — it does NOT carry the workspace slug in
// the path. Google requires exact-match redirect URIs, so a per-workspace callback
// would force a new registered URI for every workspace. Instead the OAuth `state`
// carries the workspace (slug + id), and the callback derives them from it. One URI
// is registered in the Google client, forever, for every workspace and every scope.
//
// Register in the Google Cloud console (Authorized redirect URIs):
//   <NEXT_PUBLIC_SITE_URL>/api/connectors/google/callback
//   e.g. http://localhost:3000/api/connectors/google/callback  (dev)
//        https://app.example.com/api/connectors/google/callback (prod)

import { env } from '@/env';

/** The fixed, slug-free callback path. Imported by both the start and callback routes. */
export const GOOGLE_CALLBACK_PATH = '/api/connectors/google/callback';

/** Absolute callback URL sent to Google as `redirect_uri` — must match on both legs. */
export function googleCallbackUrl(): string {
  return `${env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')}${GOOGLE_CALLBACK_PATH}`;
}
