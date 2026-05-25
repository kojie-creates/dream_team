# CLAUDE BRIEF: Phase 5 T6 Controlled Tool Write Path

Date: 2026-05-24
Repo: `C:\Users\felix\Desktop\dream_team`
App root: `C:\Users\felix\Desktop\dream_team\app`

## Purpose

Add one controlled outbound tool-write path with explicit human confirmation.

Preferred path: create a Google Calendar hold from a ticket. This is safer than email sending because the action is bounded, visible, and reversible by the user in their calendar.

This ticket is the first external write. Treat it as high-risk.

## Operating Mode

This is a single-ticket implementation brief.

Work sequentially. After every file write, immediately read back enough of the changed file to prove it exists and contains the intended section. For markdown reports, echo the first 3 non-empty lines and the line count.

Do not report completion until all validation gates have been run or honestly marked blocked.

## Source Files To Read First

Read these before editing:

1. `app/AGENTS.md`
2. `docs/briefs/phase5_t3_google_calendar_oauth_skeleton_report.md`
3. `docs/briefs/phase5_t4_calendar_readonly_ingest_report.md`
4. `docs/briefs/phase5_t5_automation_rules_report.md`
5. `app/src/app/actions/orchestration.ts`
6. `app/src/app/w/[slug]/tickets/[ticketId]/page.tsx`
7. `app/src/lib/connectors/googleCalendar.ts`
8. `app/src/lib/connectors/tokenVault.ts`
9. `app/supabase/migrations/0005_phase1_workflow_foundation.sql`
10. `app/supabase/migrations/0006_phase5_connectors.sql`

After each read, echo the first 3 non-empty lines.

Use `Get-Content -LiteralPath` for dynamic route paths with `[slug]` or `[ticketId]`.

## Scope Decision

Implement only:

`Create calendar hold`

Do not implement Gmail send, Slack post, Notion write, Drive write, or Sheets write.

Required additional scope:

`https://www.googleapis.com/auth/calendar.events`

If the existing T3 connection has only read-only scope, the UI must require reconnect with expanded scope before showing the write action as available.

## User Confirmation Contract

No external write can happen until the user sees and confirms:

1. Calendar account email.
2. Event title.
3. Event date/time.
4. Duration.
5. Description.
6. Which ticket it is linked to.

Confirmation button text:

`Create calendar hold`

Avoid vague text like `Run`, `Proceed`, or `Send`.

## UI Location

Ticket detail page:

1. Show a `Calendar hold` panel only when Google Calendar is connected.
2. Show form fields:
   - title default from ticket title
   - date
   - start time
   - duration
   - description default includes ticket URL or ticket title
3. Show explicit confirmation copy:
   - `This will create one event in your connected Google Calendar.`
4. If write scope is missing:
   - show `Reconnect Google Calendar with event-write scope`
   - do not show submit button.

## Server Action

Create:

`createCalendarHoldForTicket`

Requirements:

1. Authenticated session.
2. RLS workspace read.
3. RLS ticket read.
4. RLS connector metadata read.
5. Confirm connector has write scope.
6. Service-role token read only after authorization.
7. Google Calendar API event insert.
8. Write `trace_events` row:
   - `event_type='tool.calendar_hold.created'`
   - `from_agent='human-confirmed-tool'`
   - `to_agent='google_calendar'`
9. Write packet:
   - `packet_type='trace'`
   - `body_parsed.packet_kind='tool_write'`
   - include provider event id, title, start/end, confirmed_by, external_write true
10. Do not mark ticket done solely because a hold was created.

If the schema cannot represent trace/packet without service-role, follow the established Phase 2 service-role-after-authorization pattern.

## Provider Helper

Extend:

`app/src/lib/connectors/googleCalendar.ts`

Add:

`createCalendarEvent`

Requirements:

1. Server-only.
2. Uses stored encrypted token.
3. Calls Google Calendar `events.insert`.
4. Returns provider event id and html link if present.
5. Does not log tokens or full response bodies.

## Hard Boundaries

1. No email send.
2. No automatic external write.
3. No external write without explicit confirmation.
4. No broad OAuth scopes beyond Calendar event write.
5. No deleting or updating existing calendar events.
6. No hidden background action.
7. No tool write on behalf of an agent without human confirmation.
8. No claim that this is full automation. It is a confirmed tool action.

## Validation

Run from `app/`:

1. `pnpm copy:smoke`
2. `pnpm model:smoke`
3. `pnpm verify:supabase-project`
4. `pnpm typecheck`
5. `pnpm lint`
6. `pnpm exec supabase test db`

Operator smoke:

1. Connect or reconnect Google Calendar with write scope.
2. Open a ticket.
3. Fill Calendar hold form.
4. Confirm the exact account/title/time/description.
5. Click `Create calendar hold`.
6. Confirm the event appears in Google Calendar.
7. Confirm ticket page shows trace/packet evidence.
8. Confirm History shows the tool write trace if History supports trace rows.

If Google OAuth/write scope is not configured, mark operator acceptance pending and do not fabricate.

## Report Requirements

Write:

`docs/briefs/phase5_t6_controlled_tool_write_path_report.md`

Report must include:

1. Completion status.
2. Files changed.
3. Scope requested.
4. Confirmation contract.
5. External API called.
6. Trace/packet evidence written.
7. Validation output with exact pass lines.
8. Operator acceptance result or pending reason.
9. Caveats and non-claims.
10. Next recommended ticket: Phase 5 Closeout Acceptance.

After writing the report, immediately read it back and echo:

1. line count
2. first 3 non-empty lines
3. final completion status line

## Stop Conditions

Stop and report blocked if:

1. Google Calendar write scope is not approved by Felix.
2. User confirmation cannot show exact write details.
3. Token handling would expose secrets.
4. Service-role writes would happen before authorization.
5. The implementation drifts into autonomous scheduling or email sending.
