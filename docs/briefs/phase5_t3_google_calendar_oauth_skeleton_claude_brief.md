# CLAUDE BRIEF: Phase 5 T3 Google Calendar OAuth Skeleton

Date: 2026-05-24
Repo: `C:\Users\felix\Desktop\dream_team`
App root: `C:\Users\felix\Desktop\dream_team\app`

## Purpose

Implement a minimal Google Calendar OAuth round trip for one workspace.

This ticket proves connect/disconnect for one low-risk provider. It must not ingest calendar events yet and must not write to Google Calendar.

## Operating Mode

This is a single-ticket implementation brief.

Work sequentially. After every file write, immediately read back enough of the changed file to prove it exists and contains the intended section. For markdown reports, echo the first 3 non-empty lines and the line count.

Do not report completion until all validation gates have been run or honestly marked blocked.

## Source Files To Read First

Read these before editing:

1. `app/AGENTS.md`
2. `docs/briefs/phase5_t1_connector_schema_rls_report.md`
3. `docs/briefs/phase5_t2_connector_settings_surface_report.md`
4. `app/src/env.ts`
5. `app/src/lib/supabase/server.ts`
6. `app/src/lib/supabase/service.ts`
7. `app/src/app/auth/callback/route.ts`
8. `app/src/app/actions/invites.ts`
9. `app/src/app/w/[slug]/settings/connectors/page.tsx`

After each read, echo the first 3 non-empty lines.

Use `Get-Content -LiteralPath` for dynamic route paths with `[slug]`.

## Provider And Scopes

Provider:

`google_calendar`

Scopes:

1. `openid`
2. `email`
3. `profile`
4. `https://www.googleapis.com/auth/calendar.readonly`

Do not request write scopes in T3.

## Environment Variables

Add to `.env.example` and `app/src/env.ts`:

1. `GOOGLE_CLIENT_ID`
2. `GOOGLE_CLIENT_SECRET`
3. `CONNECTOR_TOKEN_ENCRYPTION_KEY`

Encryption key expectation:

1. Server-only.
2. Base64url or hex key documented in `.env.example`.
3. Never exposed as `NEXT_PUBLIC_*`.

If encryption cannot be implemented safely, stop before storing tokens and report blocked.

## Token Storage

Implement server-only token encryption helper:

`app/src/lib/connectors/tokenVault.ts`

Requirements:

1. Uses Node crypto AES-256-GCM or equivalent standard primitive.
2. Stores encrypted token payloads as text.
3. Includes IV and auth tag.
4. Has decrypt helper for future tickets.
5. Never imported from client components.

Add `import "server-only"` if the dependency exists. If not, install `server-only` as a tiny dependency and verify build. If dependency installation is undesirable in this ticket, document the risk and keep helper under server-only route/action boundaries.

## OAuth Routes

Create:

1. `app/src/app/w/[slug]/settings/connectors/google-calendar/start/route.ts`
2. `app/src/app/w/[slug]/settings/connectors/google-calendar/callback/route.ts`

Start route:

1. Requires authenticated user.
2. Confirms membership in the workspace via RLS-gated read.
3. Generates `state` containing workspace slug, workspace id, provider, nonce.
4. Stores nonce in an HTTP-only cookie with short expiry.
5. Redirects to Google OAuth with read-only Calendar scope.

Callback route:

1. Requires authenticated user.
2. Validates `state` and nonce cookie.
3. Confirms membership in the workspace via RLS-gated read.
4. Exchanges code server-side.
5. Fetches Google userinfo or token info only enough to identify account email.
6. Uses service-role only after auth and workspace checks.
7. Upserts `connectors` row as `connected`.
8. Upserts encrypted `connector_tokens`.
9. Redirects back to `/w/[slug]/settings/connectors`.

Disconnect:

Implement server action:

`disconnectGoogleCalendar`

Effect:

1. Auth + workspace RLS check first.
2. Service-role after authorization.
3. Delete `connector_tokens` for connector or blank token fields.
4. Set connector status to `disconnected`.
5. Preserve connector metadata row.

## UI Changes

Update the Google Calendar card:

1. If disconnected: show `Connect Google Calendar`.
2. If connected: show connected email if available, scopes, and `Disconnect`.
3. If error: show last error and reconnect option.

All other providers remain disabled.

## Hard Boundaries

1. No Calendar event ingest.
2. No Calendar write scope.
3. No Gmail.
4. No background jobs.
5. No token in client component props unless it is non-sensitive metadata like account email.
6. No token logs.
7. No broad Google scopes.
8. No Orin Supabase project.

## Validation

Run from `app/`:

1. `pnpm copy:smoke`
2. `pnpm model:smoke`
3. `pnpm verify:supabase-project`
4. `pnpm typecheck`
5. `pnpm lint`
6. `pnpm exec supabase test db`

Manual/operator OAuth smoke:

1. Configure Google OAuth redirect URI for local dev.
2. Set env vars.
3. Restart dev server.
4. Open `/w/<slug>/settings/connectors`.
5. Click `Connect Google Calendar`.
6. Complete Google consent.
7. Confirm return to connectors page.
8. Confirm Google Calendar card says connected.
9. Confirm `connector_tokens` is not readable by authenticated client.
10. Click Disconnect.
11. Confirm status returns to disconnected and token row is removed or blanked.

If Google dashboard setup is not done, automated gates can pass but operator OAuth should be marked pending.

## Report Requirements

Write:

`docs/briefs/phase5_t3_google_calendar_oauth_skeleton_report.md`

Report must include:

1. Completion status.
2. Files changed.
3. Env vars added.
4. Redirect URI used.
5. Scopes requested.
6. Token encryption boundary.
7. Auth and workspace checks before service-role writes.
8. Validation output with exact pass lines.
9. Operator OAuth result or pending reason.
10. Next recommended ticket: Phase 5 T4 Calendar Read-Only Ingest Preview.

After writing the report, immediately read it back and echo:

1. line count
2. first 3 non-empty lines
3. final completion status line

## Stop Conditions

Stop and report blocked if:

1. Token encryption cannot be made server-only.
2. OAuth callback cannot validate state.
3. Google requires broader scopes than read-only Calendar for this path.
4. Service-role writes would occur before workspace authorization.
5. Token material would be exposed to the browser or logs.
