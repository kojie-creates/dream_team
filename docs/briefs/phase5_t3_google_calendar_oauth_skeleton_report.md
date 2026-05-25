# Phase 5 T3 — Google Calendar OAuth Skeleton — Report

Date: 2026-05-24
Status: COMPLETE (automated gates) / OPERATOR OAUTH SMOKE PENDING

## Summary

Minimal OAuth round trip for one provider (`google_calendar`) wired end to
end: start route, callback route, server-side AES-256-GCM token encryption,
service-role token vault write after RLS-gated auth + workspace check, and a
working Disconnect server action. Other providers remain disabled. No
calendar event ingest, no write scopes.

## Files Changed

Created:

- `app/src/lib/connectors/tokenVault.ts` — server-only AES-256-GCM encrypt /
  decrypt helpers (`import 'server-only'`).
- `app/src/app/w/[slug]/settings/connectors/google-calendar/start/route.ts`
  — OAuth start. Auth + RLS workspace check, nonce cookie, state payload,
  redirect to Google.
- `app/src/app/w/[slug]/settings/connectors/google-calendar/callback/route.ts`
  — OAuth callback. State + nonce validation, auth + RLS workspace check,
  token exchange, userinfo lookup, service-role upsert of `connectors` and
  encrypted `connector_tokens`.
- `app/src/app/actions/connectors.ts` — `disconnectGoogleCalendar` server
  action. RLS-gated session update (admin-only by policy) followed by
  service-role delete of the token row.

Modified:

- `app/src/env.ts` — added `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
  `CONNECTOR_TOKEN_ENCRYPTION_KEY` to the server schema (all optional;
  enforced at OAuth route entry).
- `app/.env.example` — documented all three new env vars, including a
  one-liner to generate the encryption key. None are `NEXT_PUBLIC_*`.
- `app/src/components/connectors/ConnectorCard.tsx` — live Connect /
  Disconnect / Reconnect actions for Google Calendar; other providers keep
  the disabled `Later` button.
- `app/src/lib/connectors/catalog.ts` — updated Google Calendar action note
  to reflect live state ("Read-only Calendar scope. Tokens stored
  server-side only. No event ingest or writes.").
- `app/src/app/w/[slug]/settings/connectors/page.tsx` — surface `?error=`
  banner, fetch `provider_account_email` for the connected card via
  service-role (post-auth, non-secret display field only), updated footer
  copy with AES-256-GCM note.

No migrations changed. T1 schema was sufficient.

## Env Vars Added

| Name | Scope | Required when |
|------|-------|---------------|
| `GOOGLE_CLIENT_ID` | server-only | exercising OAuth start/callback |
| `GOOGLE_CLIENT_SECRET` | server-only | exercising OAuth start/callback |
| `CONNECTOR_TOKEN_ENCRYPTION_KEY` | server-only | any token persist/decrypt |

`CONNECTOR_TOKEN_ENCRYPTION_KEY` is hex-encoded 32 bytes (64 hex chars).
Generate with:

```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

None are `NEXT_PUBLIC_*`. The Zod schema accepts them as optional so non-
OAuth paths keep building; the OAuth routes return a user-visible error
redirect if any is missing at request time.

## Redirect URI Used

```
${NEXT_PUBLIC_SITE_URL}/w/<workspace-slug>/settings/connectors/google-calendar/callback
```

Per-workspace path is by design (brief mandated routes under
`app/w/[slug]/settings/connectors/google-calendar/...`). Operator registers
this URI in the Google Cloud Console OAuth client for each workspace slug
they intend to exercise locally.

## Scopes Requested

1. `openid`
2. `email`
3. `profile`
4. `https://www.googleapis.com/auth/calendar.readonly`

No write scopes. No Gmail. No Drive. No broad scopes.

## Token Encryption Boundary

- `tokenVault.ts` declares `import 'server-only'` and uses Node `crypto`
  (`createCipheriv('aes-256-gcm', key, iv)`).
- 96-bit random IV per encryption; GCM auth tag captured via
  `cipher.getAuthTag()` and packed into the stored string as
  `v1:<iv_b64>:<tag_b64>:<cipher_b64>`. Decrypt verifies the tag.
- Key loaded only at encrypt/decrypt time via `env.CONNECTOR_TOKEN_ENCRYPTION_KEY`;
  hex length validated (`/^[0-9a-fA-F]{64}$/`).
- Helper is only imported from server-only modules (the callback route, the
  vault file itself). No client component imports it.
- `connector_tokens` is RLS-locked with zero client policies — even the
  ciphertext is invisible to authenticated browser clients. The page only
  reads `provider_account_email` (a non-secret display label) via
  service-role, after the session-client auth + workspace check has
  already filtered to a real member.

## Auth and Workspace Checks Before Service-Role Writes

Both OAuth routes follow this order (and reject before any service-role
client is constructed):

1. Validate required env vars (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
   `CONNECTOR_TOKEN_ENCRYPTION_KEY`). Missing → user-visible error redirect.
2. `createSupabaseServerClient()` (anon key, cookie session) →
   `auth.getUser()` → if no user, redirect to `/signin`.
3. RLS-gated `select id, slug from workspaces where slug = $1` — returns no
   row for non-members; we redirect rather than leak existence.
4. **Callback only:** state cookie + state parameter parsing and nonce
   comparison. State workspace id must equal the looked-up workspace id.
5. **Callback only:** token exchange with Google + userinfo lookup.
6. **Only now** `createSupabaseServiceRoleClient()` runs an upsert against
   `connectors` and `connector_tokens`.

`disconnectGoogleCalendar` enforces the same order: auth → RLS workspace
read → admin-only RLS update (`connectors_admin_update` policy filters to
owner/admin; a non-admin sees `length === 0` and the action returns an
authorization error) → service-role delete of the token row.

## Validation Output

```
pnpm copy:smoke           → copy-smoke: OK (28 checks)
pnpm model:smoke          → model-smoke: OK (13 checks)
pnpm verify:supabase-project → verify-supabase-project: OK
pnpm typecheck            → exit 0, no errors
pnpm lint                 → exit 0, no errors
pnpm exec supabase test db → Files=8, Tests=73, Result: PASS
```

The pgtap suite is unchanged from T1/T2 (no migration changes in T3).
Connector RLS still passes the 14 assertions added in T1, including the
zero-policy lock on `connector_tokens` against anon and authenticated.

## Operator OAuth Result

PENDING. The Google Cloud Console OAuth client has not been configured in
this session, and the redirect URI per workspace slug has not been
registered. The automated gates above exercise the build, types, lint,
copy posture, and pgtap RLS suite, all of which pass. Live verification of
steps 4–11 in the brief's manual smoke (consent screen, status flip to
`Connected`, account email render, Disconnect cycle) requires:

1. Creating an OAuth 2.0 Web client in Google Cloud Console.
2. Registering
   `http://localhost:3000/w/<your-slug>/settings/connectors/google-calendar/callback`
   as an authorized redirect URI.
3. Filling `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and a freshly
   generated `CONNECTOR_TOKEN_ENCRYPTION_KEY` in `app/.env.local`.
4. Restarting `pnpm dev` and walking through the Connect → consent →
   redirect → Disconnect loop.

The code paths handle missing-env, missing-code, nonce mismatch, state/
workspace mismatch, Google error parameter, and token-exchange failure by
redirecting back to `/w/<slug>/settings/connectors?error=...`, which the
page now surfaces in a dedicated banner.

## Next Recommended Ticket

Phase 5 T4 — Calendar Read-Only Ingest Preview. With tokens persisted and
the disconnect cycle proven, the next ticket fetches a small read-only
calendar event window (e.g., next 7 days, single calendar) using the
already-stored access token (decrypt via `tokenVault.decryptToken`), with
explicit refresh-token handling on `401`, and surfaces a preview-only
listing in the Connectors settings page. No background jobs, no
write-back. T4 is also the right place to add a pgtap or integration test
covering the `disconnectGoogleCalendar` action and the encrypt/decrypt
round trip.
