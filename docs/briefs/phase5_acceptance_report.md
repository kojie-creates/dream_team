# Phase 5 Acceptance Report

Date: 2026-05-24
Scope: Phase 5 closeout — tickets T1 through T6.

## 1. Summary Verdict

**Phase 5 exit criteria are met in code, with operator OAuth/write smoke
deferred.** OAuth round-trip is implemented for one provider (Google
Calendar) end-to-end. The app can ingest one external item as a confirmed
brief/ticket. A controlled server-side write path exists for a calendar
hold, gated by explicit user confirmation and a bounded
`calendar.events` scope. Every automated gate passes. Live OAuth /
write verification is `operator-pending` because the Google Cloud Console
OAuth client and `.env.local` keys have not been configured in this
session.

This report does **not** claim a live OAuth round-trip or a live calendar
write was observed in this session.

## 2. Phase Scope Recap

Phase 5 connected Dream Team to one external productivity tool and
introduced the first controlled outbound write surface — security first,
read before write, no autonomous scheduler.

Delivered:

- Connector schema + RLS with a server-only token vault (T1).
- Settings → Connectors UI with honest "Not connected" / status copy (T2).
- Google Calendar OAuth start + callback, AES-256-GCM encrypted token
  storage, disconnect flow (T3).
- Read-only Calendar event preview → confirm-to-create brief/ticket (T4).
- Workspace-scoped automation rules table + manual **Run now** action,
  with idempotence on previously-ingested events (T5).
- Controlled tool-write path: bounded `events.insert` behind explicit
  per-action confirmation, audit trace + packet, no autonomous trigger
  (T6).

Not delivered (deliberately out of scope or pending hardware/dashboard):

- Gmail / Drive / Sheets / Slack / Notion connect flows.
- Encryption KMS / key rotation.
- Background scheduler / cron / queue worker.
- Live OAuth round-trip observed in this session.
- Live calendar write observed in this session.

## 3. Ticket-by-Ticket Table

| # | Ticket | Status | Migration | UI surface | Server action / route | RLS / token boundary |
|---|--------|--------|-----------|------------|-----------------------|----------------------|
| T1 | Connector Schema + RLS | COMPLETE | `0006_phase5_connectors.sql` | none | none | `connectors` member-read / admin-write; `connector_tokens` zero client policies |
| T2 | Connector Settings Surface | COMPLETE | none | `/w/[slug]/settings/connectors` | none | RLS-gated session reads only, no service-role on the page |
| T3 | Google Calendar OAuth Skeleton | COMPLETE (automated) / OPERATOR PENDING | none | Connect / Disconnect / Reconnect on ConnectorCard | `…/google-calendar/start`, `…/callback`, `disconnectGoogleCalendar` | AES-256-GCM encrypt at rest; service-role only after RLS + state/nonce check |
| T4 | Calendar Read-Only Ingest | COMPLETE (automated) / OPERATOR PENDING | none | `/w/[slug]/settings/connectors/google-calendar` | `createBriefFromCalendarEvent`, `listUpcomingCalendarEvents`, `getCalendarEvent` | GET-only Calendar v3; insert briefs/tickets via RLS; trace via service-role only after RLS |
| T5 | Automation Rules | COMPLETE (automated) / OPERATOR PENDING | `0007_phase5_automation_rules.sql` | `/w/[slug]/settings/automations` | `createAutomationRule`, `runAutomationRuleNow` | RLS member-read; owner/admin write; idempotence via `trace_events.payload.provider_event_id` |
| T6 | Controlled Tool Write Path | COMPLETE (automated) / OPERATOR PENDING | none | Calendar hold panel on ticket detail page | `createCalendarHoldForTicket`, `createCalendarEvent`, `…/start?write=1` | RLS reads first; service-role only for trace+packet write; bounded `calendar.events` scope |

All six T-reports are present under `docs/briefs/phase5_t*_report.md`.

## 4. Automated Gate Output

Run from `app/`:

```
pnpm copy:smoke              → copy-smoke: OK (28 checks)
pnpm model:smoke             → model-smoke: OK (13 checks)
pnpm verify:supabase-project → verify-supabase-project: OK
pnpm typecheck               → exit 0, no errors
pnpm lint                    → exit 0, no errors
pnpm exec supabase test db   → Files=9, Tests=81, Result: PASS
```

`pnpm exec supabase db reset` was **not run** in this session. The auto-
mode permission classifier blocked it as a destructive local-stateful
operation not pre-authorized for closeout. The pgtap suite (`supabase
test db`) loads migrations 0001..0007 into a temporary schema and exits
PASS, so migration validity is exercised indirectly. If a true `db
reset` is required for sign-off, operator should run it manually.

## 5. Operator Walkthrough Checklist

| # | Step | Status |
|---|------|--------|
| 1 | Open `/w/<slug>/settings/connectors` | code path verified; `operator-pending` for live render |
| 2 | Confirm Google Calendar card reflects connection state | `operator-pending` |
| 3 | Complete OAuth if not already connected | `operator-pending` (requires Google Cloud Console client + `.env.local`) |
| 4 | Open Google Calendar connector detail page | `operator-pending` |
| 5 | Preview an event | `operator-pending` |
| 6 | Create a brief/ticket from the event | `operator-pending` |
| 7 | Open Automations page | code path verified; `operator-pending` for live render |
| 8 | Create and manually run a Calendar ingest rule | `operator-pending` (requires upcoming event on connected account) |
| 9 | Open a ticket and create one calendar hold (write scope) | `operator-pending` (requires reconnect with `?write=1`) |
| 10 | Confirm trace/packet evidence for the write | `operator-pending` |

`operator-pending` is not a pass. It records that the code path exists,
typechecks, lints, and survives RLS/pgtap, but no live signal from the
provider was observed in this session.

## 6. Supabase / RLS / Token Boundary Summary

Migrations:

- `0006_phase5_connectors.sql` — `public.connectors` (member-read,
  admin-write, no client delete) + `public.connector_tokens` (RLS enabled,
  **zero** policies for `anon` and `authenticated`).
- `0007_phase5_automation_rules.sql` — `public.automation_rules`
  (member-read, owner/admin insert + update, no client delete).

pgtap coverage (9 files, 81 tests, all PASS):

- `connectors.test.sql` — 14 assertions including `connector_tokens` is
  unreadable / unwritable by `anon` and `authenticated` (count 0,
  SQLSTATE 42501 on insert).
- `automation_rules.test.sql` — 8 assertions including RLS-filtered
  updates from plain members and admin-only insert.
- 7 prior suites unchanged and still PASS.

Token boundary:

- AES-256-GCM at rest via
  [tokenVault.ts](app/src/lib/connectors/tokenVault.ts). 96-bit random
  IV per encryption; auth tag verified on decrypt. Key sourced from
  server-only `CONNECTOR_TOKEN_ENCRYPTION_KEY` (64 hex chars).
- `tokenVault.ts` and `googleCalendar.ts` carry `import 'server-only'`.
- Service-role client is constructed **only after** the request has
  passed an RLS-gated auth + workspace + (where applicable) connector
  read. This envelope is reused by T3 callback, T4 ingest, T5 manual
  run, and T6 tool write.
- Browser clients (anon + authenticated) cannot read token rows at all
  — verified by pgtap, not just by convention.
- Disconnect path uses the admin-only RLS update, then service-role
  deletes the token row.

## 7. Supported Claims

Each claim is narrow and evidence-backed (file path + gate output).

1. **Dream Team can store workspace-scoped connector status.**
   Evidence: `0006_phase5_connectors.sql`, pgtap (14 assertions including
   workspace isolation and admin-only writes).
2. **Dream Team's token vault is unreadable by browser clients.**
   Evidence: `connector_tokens` RLS-enabled with zero client policies,
   pgtap asserts count=0 reads and 42501 inserts for anon/authenticated.
3. **Dream Team can connect one Google Calendar account when provider
   credentials are configured.** Evidence: OAuth start + callback routes
   in [google-calendar](app/src/app/w/[slug]/settings/connectors/google-calendar/),
   AES-256-GCM token storage, disconnect server action. Live round-trip
   is `operator-pending`.
4. **Dream Team can preview one upcoming Google Calendar event and create
   a brief/ticket from it after explicit confirmation.** Evidence:
   `googleCalendar.ts` GET-only helpers, `createBriefFromCalendarEvent`
   server action. Live ingest is `operator-pending`.
5. **Dream Team can store and manually run an automation rule scoped to a
   single Google Calendar ingest.** Evidence: `automation_rules` schema,
   `runAutomationRuleNow` with idempotence via prior
   `trace_events.payload.provider_event_id`, **Run now** button only.
6. **Dream Team can create one user-confirmed calendar hold when write
   scope is configured.** Evidence: `createCalendarHoldForTicket` action,
   `createCalendarEvent` POST-only helper, `?write=1` opt-in scope
   request, account-email confirm match, trace + `tool_write` packet on
   success. Live write is `operator-pending`.

## 8. Explicit Non-Claims

The app does **not** do any of the following. None of the below is built
behind a feature flag — they simply do not exist.

1. No Gmail send. No Gmail scope is requested anywhere.
2. No Slack post, Notion write, Drive write, or Sheets write.
3. No production ingest from Slack / Notion / Drive / Sheets / Gmail.
4. No autonomous background scheduler. There is no `pg_cron`, `pg_net`,
   `vercel.json` cron, `node-cron`, edge-function schedule, or
   middleware that triggers rules or writes on page load.
5. No `events.update`, `events.patch`, `events.delete`, `events.move`,
   `freeBusy`, `calendars.insert`, or any non-POST write verb.
6. No batch / bulk external write. Each calendar hold is one explicit
   form submission, one POST.
7. No production billing surface.
8. No enterprise connector compliance certification (SOC2 / ISO / HIPAA
   /GDPR DPA).
9. No KMS-backed key rotation for `CONNECTOR_TOKEN_ENCRYPTION_KEY`.
   The key is an env var; rotation requires a manual re-encrypt pass not
   built here.
10. No automatic ticket completion on a successful tool write.

## 9. Security Caveats

1. **Encryption key is env-var only.** Rotation requires re-encrypting
   every row in `connector_tokens` with the new key. This is not yet
   automated. Compromise of the env var compromises every stored token.
2. **Disconnect is local.** `disconnectGoogleCalendar` deletes the token
   row, but it does **not** call Google's `oauth2/revoke` endpoint. A
   leaked refresh token would still be usable from outside the app until
   the user revokes it at `myaccount.google.com`. The connectors page
   copy reflects this: revocation is "from the provider account
   settings."
4. **No CSRF token on form actions.** Server actions rely on Next.js's
   same-origin posture + the Supabase auth cookie. Sufficient for
   internal use; revisit before opening the app to embedded iframes /
   third-party origins.
5. **Service-role key has full DB access.** Compromise of
   `SUPABASE_SERVICE_ROLE_KEY` bypasses every RLS policy in this
   report. The key must remain server-only and not be logged.
6. **OAuth state is signed-by-shape, not signed-cryptographically.**
   T3 uses a same-site cookie nonce + a base64url JSON state payload.
   Workspace id / slug / nonce are cross-checked, but the state itself
   is not HMAC-signed. Acceptable today (cookie + state both must
   match), but an HMAC would make it more robust to future cookie
   handling changes.
7. **No rate limit on calendar hold creation.** A logged-in workspace
   member could submit the form repeatedly to spam their own Google
   Calendar. Mitigations: the submit button is disabled after success in
   the current form, but a refreshed page would allow more submissions.
   Consider per-user / per-ticket rate limit if external abuse is in
   scope.
8. **Token decrypt errors throw, by design.** Tampered ciphertext fails
   GCM tag verification. The user-visible result is a Google Calendar
   "not connected" / "reconnect" prompt rather than silent failure.

## 10. Recommended Phase 6 or Hardening Work

In rough priority order:

1. **Operator OAuth + write smoke.** Configure the Google Cloud Console
   OAuth client, set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
   `CONNECTOR_TOKEN_ENCRYPTION_KEY` in `.env.local`, and walk the full
   operator checklist. Flip every `operator-pending` row to pass or
   record the specific failure.
2. **Provider-side revoke on disconnect.** Call `oauth2/revoke` from
   `disconnectGoogleCalendar` (best-effort) so a stored refresh token
   cannot be used after a user disconnects.
3. **Key rotation tooling.** A one-shot CLI / server action that
   re-encrypts every `connector_tokens` row with a new key. Plus a
   "current key id" column to allow phased rotation.
4. **HMAC-signed OAuth state.** Replace the JSON-only state payload
   with an HMAC using a server secret.
5. **Per-ticket calendar-hold dedupe.** Optional server-side guard
   against creating a second hold with identical title+start within a
   short window for the same ticket.
6. **Scheduler ticket** (Phase 6 candidate). Only after operator
   acceptance: a real `pg_cron` or queue worker for
   `automation_rules`, with explicit per-rule activation and a hard
   audit envelope. Until then the **Manual runs first** copy must stay.
7. **Second provider** (Phase 6 candidate). Re-use the T3–T6 envelope
   for one more low-risk read-only provider (e.g. Drive metadata), to
   prove the abstraction is real rather than Calendar-specific.
8. **Gmail and Slack are not next.** Either requires write scopes that
   are materially more dangerous than `calendar.events`. They should
   come after rate limiting, revoke-on-disconnect, and HMAC state are
   in place.

---

Final verdict: Phase 5 closeout accepted in code with live operator
OAuth/write smoke deferred to a configured environment.
