# Phase 5 T6 — Controlled Tool Write Path — Report

Date: 2026-05-24
Status: COMPLETE (automated gates) / OPERATOR LIVE WRITE PENDING

## Summary

Adds the first scoped outbound write surface in the app: creating one Google
Calendar event ("hold") from a ticket, behind explicit per-action human
confirmation. No email send, no Slack post, no Drive/Sheets/Notion write.
No autonomous trigger. No second write per submission. The action is bounded
(POST `events.insert` only), visible (user sees the exact title, date/time,
duration, description, account, and linked ticket before clicking), and
reversible (the user can delete the event from their own calendar).

## Files Changed

Created:

- `app/src/components/tickets/CalendarHoldPanel.tsx` — RSC. Decides
  visibility, reads scopes/account email via the established RLS-then-
  service-role envelope, renders the reconnect CTA when write scope is
  missing.
- `app/src/components/tickets/CalendarHoldForm.tsx` — `'use client'` form
  wrapping `createCalendarHoldForTicket` with `useActionState`. Renders the
  always-visible "Confirm before writing" block. Disables the submit button
  after a successful write to prevent a duplicate hold.

Modified:

- `app/src/lib/connectors/googleCalendar.ts` — added
  `createCalendarEvent(...)` and exported `GOOGLE_CALENDAR_WRITE_SCOPE`.
  Single POST to `events.insert`. No patch/delete/move calls anywhere in
  the module.
- `app/src/app/actions/connectors.ts` — added
  `createCalendarHoldForTicket(...)` server action and the
  `CreateCalendarHoldState` shape.
- `app/src/app/w/[slug]/settings/connectors/google-calendar/start/route.ts`
  — accepts `?write=1` to add the bounded `calendar.events` scope to the
  consent screen. Without `?write=1` the route requests the same scopes as
  before (no behaviour change for existing T3/T4 callers).
- `app/src/app/w/[slug]/tickets/[ticketId]/page.tsx` — renders
  `<CalendarHoldPanel/>` above the source brief.

No migration added. The existing `trace_events` / `packets` / `tickets`
schema is sufficient.

## Scope Requested

Base scopes (unchanged from T3):

1. `openid`
2. `email`
3. `profile`
4. `https://www.googleapis.com/auth/calendar.readonly`

Additional scope (only when caller hits the reconnect link with
`?write=1`):

5. `https://www.googleapis.com/auth/calendar.events`

No Gmail, Drive, Sheets, full `calendar` (read-write), or any other Google
scope is ever requested. The OAuth start route declines to add the write
scope unless the explicit opt-in query parameter is present.

## Confirmation Contract

Before any external call, the form renders the exact write surface in an
always-visible amber confirmation block:

- Account email (the connected `provider_account_email`).
- Event title.
- Date + start time + duration (rendered as `start → end (timeZone)`).
- Description (truncated for display, full text submitted).
- Linked ticket id.

Submit button text is **Create calendar hold** — not "Run", "Send", or
"Proceed". A hidden `confirmed_account` field carries the displayed email
back to the action, which rejects the write if the submitted value does not
match the connector's actual account email.

If the connector lacks the `calendar.events` scope, the panel renders only
the reconnect CTA. No submit button is shown until reconnect completes.
If the panel cannot resolve an account email, it likewise blocks the form
and prompts a reconnect.

## External API Called

Google Calendar API v3:

- `POST https://www.googleapis.com/calendar/v3/calendars/primary/events`

`calendarId` is hard-coded to `primary`. The request body contains only
`summary`, `description`, and `start`/`end` with `dateTime` + `timeZone`.
No attendees, no conference data, no recurrence, no notifications opt-in.

No other write verbs (`PATCH`, `PUT`, `DELETE`, `move`, `import`) are
called from this module. The read-only helpers from T4 are untouched.

## Trace / Packet Evidence Written

On successful write, the action appends (service-role, only after the
RLS-gated auth + workspace + ticket + connector checks already passed):

- `trace_events` row:
  - `event_type='tool.calendar_hold.created'`
  - `from_agent='human-confirmed-tool'`
  - `to_agent='google_calendar'`
  - `seq = max(seq for ticket) + 1`
  - `payload` includes `provider_event_id`, `title`, `start`, `end`,
    `duration_min`, `time_zone`, `confirmed_by` (auth user id),
    `confirmed_account`, `external_write: true`, `tool_use: true`.
- `packets` row:
  - `packet_type='trace'`
  - `body_parsed.packet_kind='tool_write'`
  - `body_parsed` mirrors the trace payload + `html_link`.
  - `body_raw` is a human-readable `TOOL WRITE PACKET` block.

The ticket page's existing trace section renders these like any other
trace event/packet. The ticket status is **not** auto-completed by a
successful hold.

## Hard Boundaries Enforced

- No email send (no Gmail scope; no Gmail API calls anywhere).
- No Slack post, Notion write, Drive write, Sheets write.
- No autonomous external write — `createCalendarHoldForTicket` is only
  reachable via the form submission. No background job, cron, or queue
  worker fires it.
- No broad OAuth scopes beyond the bounded `calendar.events` event-write
  scope.
- No `events.update`, `events.patch`, or `events.delete` in this code path.
- No hidden background action. No tool write on behalf of an agent —
  `from_agent='human-confirmed-tool'`, `confirmed_by=auth.uid()`.
- This is **not** "full automation". It is a single confirmed tool action.
- Service-role is only used after the RLS-gated session-client reads of
  workspaces, tickets, and connectors have all returned a row for the
  caller (same envelope as T3/T4/T5).

## Validation Output

Run from `app/`:

```
pnpm copy:smoke           → copy-smoke: OK (28 checks)
pnpm model:smoke          → model-smoke: OK (13 checks)
pnpm verify:supabase-project → verify-supabase-project: OK
pnpm typecheck            → exit 0, no errors
pnpm lint                 → exit 0, no errors
pnpm exec supabase test db → Files=9, Tests=81, Result: PASS
```

No migrations changed; the pgtap suite is unchanged from T5 (9 files, 81
tests). Connector / token RLS posture and `automation_rules` policies are
all still green.

## Operator Acceptance

PENDING live write. The Google Cloud Console OAuth client + `.env.local`
keys (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`CONNECTOR_TOKEN_ENCRYPTION_KEY`) have not been configured in this
session, and the `calendar.events` scope has therefore not been granted to
a real account. The automated gates above exercise build, types, lint,
copy posture, model-smoke, and the pgtap RLS suite, all of which pass.

When credentials are configured, the operator smoke is:

1. From `/w/<slug>/settings/connectors`, disconnect Google Calendar.
2. Reconnect via the **Reconnect Google Calendar with event-write scope**
   link on the ticket page's Calendar hold panel (i.e. with `?write=1`).
   Confirm Google's consent screen lists Calendar event read **and**
   write.
3. Open an open ticket. Confirm the Calendar hold panel renders the
   account email and a pre-filled form.
4. Edit the title / time / description as desired. Confirm the
   "Confirm before writing" block updates live to match.
5. Click **Create calendar hold**. Confirm:
   - Google Calendar shows the event under the expected account.
   - The success banner shows "Open in Google Calendar" linking to it.
   - The ticket page's Trace section now includes a
     `tool.calendar_hold.created` event with `from human-confirmed-tool
     → google_calendar` and a linked `trace` packet whose body shows
     `Action: calendar_hold.created` + the provider event id.
   - Ticket status is unchanged (not auto-completed).
6. Click submit a second time on the same form — verify the button is
   disabled after the first success (no second write).
7. Delete the test event from Google Calendar to confirm reversibility.

If write scope is denied at consent, confirm the panel still shows the
reconnect CTA and no submit button. If the provider returns 4xx/5xx, the
form surfaces a `event_insert_failed: …` error inline and no trace/packet
row is written.

## Caveats and Non-Claims

- This ticket does **not** introduce any scheduled writer. The settings
  page automations from T5 remain manual-run; nothing about T6 schedules
  or batches calendar holds.
- A successful hold does **not** mark the ticket done. Ticket lifecycle
  is unchanged. Operators close tickets through the existing controls.
- A second click on the same form after success is blocked client-side
  (disabled submit button) — there is no server-side dedupe on event
  content. If a user reloads the page and resubmits with identical
  fields, the action will write a second hold. Calendars de-duplicate by
  user judgement, not by the app.
- The action does not log raw tokens or full API response bodies. Error
  surfacing extracts only the Google `error.status` code when available.

## Next Recommended Ticket

Phase 5 Closeout Acceptance — verify the full T1–T6 surface end-to-end
once live OAuth credentials are configured, sign off on the live operator
smokes (T3 connect, T4 read-only ingest, T5 manual-run automation, T6
single confirmed write), and freeze the Phase 5 deliverable before any
scheduler / second-write work is considered.
