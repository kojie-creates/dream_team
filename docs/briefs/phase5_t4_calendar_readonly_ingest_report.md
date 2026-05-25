# Phase 5 T4 — Calendar Read-Only Ingest Preview — Report

Date: 2026-05-24
Status: COMPLETE (automated gates) / OPERATOR LIVE SMOKE PENDING

## Summary

Read-only Google Calendar ingest with explicit user confirmation. Adds a
per-connector detail page that lists upcoming events, previews one event
verbatim as the brief body, and creates a `briefs` + `tickets` pair only
after the user clicks **Create brief and ticket**. No write scopes, no
background polling, no automatic ingest.

## Files Changed

Created:

- `app/src/lib/connectors/googleCalendar.ts` — server-only Calendar v3
  client. `listUpcomingCalendarEvents`, `getCalendarEvent`, transparent
  refresh-token grant, `eventToBriefText` normalizer. `import 'server-only'`.
- `app/src/app/w/[slug]/settings/connectors/google-calendar/page.tsx` —
  connector detail page. Connected-state header, read-only security copy,
  list of next 10 upcoming events, optional preview pane (driven by
  `?eventId=`), confirm form. Not-connected empty state with link back to
  Connectors.
- `app/src/components/connectors/ConfirmCalendarBriefForm.tsx` — client
  component wrapping `createBriefFromCalendarEvent` with `useActionState`
  for inline error surfacing.

Modified:

- `app/src/app/actions/connectors.ts` — added
  `createBriefFromCalendarEvent` server action. Auth → RLS workspace read →
  RLS connector status check → server-only Calendar fetch → RLS-gated brief
  and ticket inserts as the calling user → best-effort `trace_events` +
  `connectors.last_sync_at` update via service-role.
- `app/src/components/connectors/ConnectorCard.tsx` — added **View events**
  link to the Google Calendar card when status is `connected`, beside
  the existing Disconnect form.

No migrations added. T1 schema (`connectors`, `connector_tokens`, plus
Phase 1 `briefs` / `tickets` / `trace_events`) was sufficient.

## Provider API Used

Google Calendar API v3 (read-only):

- `GET https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=<now>&maxResults=10&singleEvents=true&orderBy=startTime`
- `GET https://www.googleapis.com/calendar/v3/calendars/primary/events/{eventId}`

Refresh: `POST https://oauth2.googleapis.com/token` with
`grant_type=refresh_token` when the stored `expires_at` is within 60s of
expiry. The refreshed access token is re-encrypted via the existing
AES-256-GCM vault helper and written back through the service-role client.

No event create / patch / delete calls. No FreeBusy. No calendars-list
mutation. `calendarId` is hard-coded to `primary`.

## Scopes Used

Unchanged from T3:

1. `openid`
2. `email`
3. `profile`
4. `https://www.googleapis.com/auth/calendar.readonly`

No write scopes. No Gmail / Drive / Sheets. No `calendar` (read-write)
scope is requested or accepted.

## Read-Only Guarantee

- The provider helper exposes only `GET` calls and never builds a request
  body for create/update/delete endpoints.
- The OAuth scope set is unchanged from T3 (`calendar.readonly`). The
  helper does not request additional scopes at refresh time (refresh-token
  grants cannot escalate scope on Google's OAuth endpoint).
- The action creates rows in `briefs`, `tickets`, `trace_events`, and
  updates `connectors.last_sync_at` — all internal Supabase tables. It
  never calls Google with a non-`GET` verb.
- No background job, cron, queue worker, or webhook listener was added.
  Every Calendar fetch is driven by an in-flight user request.

## Preview and Confirmation Behavior

1. User navigates to `/w/<slug>/settings/connectors/google-calendar` (linked
   as **View events** from the connector card when connected).
2. Page server-fetches the next 10 upcoming events from the user's primary
   calendar and renders title, start time, attendee count, and a video-link
   indicator.
3. User clicks **Preview as brief** on a row → page reloads with
   `?eventId=<id>`. The single event is fetched again server-side and
   `eventToBriefText` renders the exact body that will be persisted, inside
   a monospaced `<pre>` block. The source line shows
   `google_calendar · event id <providerEventId>`.
4. Only after the user clicks **Create brief and ticket** is the
   `createBriefFromCalendarEvent` server action invoked. The action
   re-fetches the event server-side (the client never supplies the body
   text) and writes the rows.
5. On success the action redirects to `/w/<slug>/tickets/<ticketId>`.

The list page does not prefetch or auto-confirm anything. Errors from
Google (e.g. `401`, `403`, `404`) surface as in-page text without throwing
into the Next.js error boundary.

## Brief and Ticket Insertion Path

Order (mirrors Phase 2 orchestration's authorization order):

1. `createSupabaseServerClient()` → `auth.getUser()` (anon key + cookie
   session). Missing user → redirect to `/signin`.
2. RLS-gated `select id, slug from workspaces where slug = $1` — non-members
   see no row and get `Workspace not found or access denied.`
3. RLS-gated `select id, status from connectors where workspace_id = $1
   and provider = 'google_calendar'`. A non-member never reaches this
   point (workspace lookup already filtered); a member of a workspace
   without a connected provider gets `Google Calendar is not connected.`
4. `getCalendarEvent(workspace.id, eventId)` — server-only path that
   resolves the connector via service-role, decrypts the access token,
   refreshes if needed, and calls Google.
5. `insert into briefs (source='connector', raw_text=<eventToBriefText>,
   parsed_status='ready', created_by=auth.uid())` — RLS-gated via
   `briefs_member_insert`.
6. `insert into tickets (status='open', title=<event title, ≤120 chars>,
   created_by=auth.uid())` — RLS-gated via `tickets_member_insert`.
7. Best-effort `trace_events` insert (seq=1, `from_agent='connector:google_calendar'`,
   `event_type='brief_ingested'`) and `connectors.last_sync_at` update via
   service-role. Failure is swallowed so the user-facing artifact is not
   blocked by a non-essential trace write.
8. `revalidatePath('/w/<slug>')` + `revalidatePath('/w/<slug>/settings/connectors')`
   then `redirect('/w/<slug>/tickets/<id>')`.

Service-role is used in exactly two places: (a) decrypting the OAuth token
inside the read helper (no RLS path exists for `connector_tokens` by
design), and (b) the best-effort trace event + sync stamp. Both are
preceded by RLS-gated authorization on the same request.

## Token Refresh Path

`getConnectorAccessToken` (internal to `googleCalendar.ts`):

- Looks up the connector by `(workspace_id, provider)` via service-role.
- Reads `connector_tokens` via service-role.
- `decryptToken(access_token_encrypted)` via the T3 AES-256-GCM helper.
- If `expires_at - now < 60_000ms`, decrypts the refresh token and POSTs
  to `oauth2.googleapis.com/token` with `grant_type=refresh_token`.
- On success: re-encrypts the new access token, persists with the new
  `expires_at`, updates `updated_at`.
- On failure (no refresh token stored, missing client creds, non-2xx
  response): throws a `GoogleCalendarError` with a stable code
  (`refresh_unavailable`, `oauth_not_configured`, `refresh_failed`,
  `refresh_persist_failed`). Page and action surface the code+message
  in-line rather than 500ing.

## Validation Output

```
pnpm copy:smoke               → copy-smoke: OK (28 checks)
pnpm model:smoke              → model-smoke: OK (13 checks)
pnpm verify:supabase-project  → verify-supabase-project: OK
pnpm typecheck                → exit 0, no errors
pnpm lint                     → exit 0, no errors
pnpm exec supabase test db    → Files=8, Tests=73, Result: PASS
```

The pgtap suite is unchanged from T1–T3 (no migration changes in T4).
Connector RLS still passes the 14 assertions added in T1, including the
zero-policy lock on `connector_tokens` against anon and authenticated
roles. `briefs`/`tickets` insert policies (used here for the connector-
sourced rows) continue to pass.

## Operator Acceptance

PENDING. Live operator smoke requires the same Google Cloud Console OAuth
client + `.env.local` setup documented in the T3 report (`GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET`, `CONNECTOR_TOKEN_ENCRYPTION_KEY`), plus at least
one upcoming event on the operator's primary calendar.

Recommended walkthrough once configured:

1. Complete T3 Connect flow → status flips to `Connected`.
2. Open `/w/<slug>/settings/connectors/google-calendar` (via the new
   **View events** link on the connector card).
3. Confirm next 10 events render with titles, times, attendee count.
4. Click **Preview as brief** on one row → confirm the preview text
   accurately reflects the event metadata and labels the source as
   `google_calendar · event id <id>`.
5. Click **Create brief and ticket** → confirm redirect to
   `/w/<slug>/tickets/<id>`.
6. Confirm the new ticket appears on Home and in History, and the brief
   body matches the preview text verbatim.

If the calendar has no upcoming events, create a throwaway test event in
Google Calendar and rerun from step 3.

Acceptance ticket URL: not exercised in this session (no live OAuth
credentials configured).

## Next Recommended Ticket

Phase 5 T5 — Automation Rules. With confirm-to-create ingest proven,
T5 introduces a narrow, user-defined automation surface (e.g. "create a
ticket when an event with attendees ≥ N appears on calendar X within the
next 24h"), still gated by explicit per-rule consent. The right place for
the rules table, the rule evaluator (still on-demand, not background
polling), and the first end-to-end automated brief creation under a rule.
