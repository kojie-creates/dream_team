# CLAUDE BRIEF: Phase 5 T4 Calendar Read-Only Ingest Preview

Date: 2026-05-24
Repo: `C:\Users\felix\Desktop\dream_team`
App root: `C:\Users\felix\Desktop\dream_team\app`

## Purpose

Use the connected Google Calendar account to read upcoming events, preview one event, and create a Dream Team brief/ticket from that event only after user confirmation.

This ticket proves read-only connector ingest. It must not create, update, or delete external calendar events.

## Operating Mode

This is a single-ticket implementation brief.

Work sequentially. After every file write, immediately read back enough of the changed file to prove it exists and contains the intended section. For markdown reports, echo the first 3 non-empty lines and the line count.

Do not report completion until all validation gates have been run or honestly marked blocked.

## Source Files To Read First

Read these before editing:

1. `app/AGENTS.md`
2. `docs/briefs/phase5_t3_google_calendar_oauth_skeleton_report.md`
3. `app/src/app/actions/briefs.ts`
4. `app/src/app/w/[slug]/new/paste/page.tsx`
5. `app/src/components/briefs/PasteBriefForm.tsx`
6. `app/src/lib/connectors/tokenVault.ts`
7. `app/src/app/w/[slug]/settings/connectors/page.tsx`
8. `app/supabase/migrations/0005_phase1_workflow_foundation.sql`
9. `app/supabase/migrations/0006_phase5_connectors.sql`

After each read, echo the first 3 non-empty lines.

Use `Get-Content -LiteralPath` for dynamic route paths with `[slug]`.

## Goal

Add:

1. Calendar event list page.
2. Event preview.
3. Confirm-to-create brief/ticket action.

Preferred route:

`/w/[slug]/settings/connectors/google-calendar`

This page is connector-specific and should be linked from the Google Calendar card.

## Calendar Read Helper

Create server-only helper:

`app/src/lib/connectors/googleCalendar.ts`

Functions:

1. `listUpcomingCalendarEvents`
2. `getCalendarEvent`

Behavior:

1. Reads encrypted token server-side.
2. Refreshes token if needed only if T3 token model supports it.
3. Calls Google Calendar API with read-only scope.
4. Returns normalized events:
   - provider event id
   - title
   - start
   - end
   - description snippet
   - attendees count
   - meeting link presence

No write calls.

## UI Expectations

Connector detail page:

1. Header:
   - back to Connectors
   - title `Google Calendar`
   - connection status
2. Security copy:
   - `Dream Team reads event metadata only. It does not modify your calendar in this phase.`
3. Event list:
   - next 10 upcoming events
   - title
   - date/time
   - attendees count
   - `Preview as brief`
4. Preview:
   - generated brief text from event metadata
   - source marked `connector`
   - provider and event id shown
   - `Create brief and ticket` button

If not connected:

1. Show clear empty state.
2. Link back to Connectors page.

## Brief Creation

Create server action:

`createBriefFromCalendarEvent`

Requirements:

1. Authenticated session.
2. Workspace RLS read.
3. Connector status check.
4. Event fetched server-side.
5. Inserts `briefs` row with:
   - `source='connector'`
   - `raw_text` containing a readable event-derived brief
   - `created_by` current user
6. Inserts `tickets` row with:
   - `status='open'`
   - title from event
   - workspace id
   - brief id
7. Redirects to ticket detail.

Use the same security order as Phase 2 orchestration:

1. session user
2. RLS workspace read
3. RLS connector metadata read
4. server-only token/provider call
5. RLS session insert if possible

Use service-role only if unavoidable for token read, and only after authorization.

## Evidence

If the current schema supports it without migration, add a trace or packet showing connector ingest. If that requires a schema change or awkward fake trace, do not add it in T4. The created brief/ticket and report are sufficient for this ticket.

Do not fabricate an agent run.

## Hard Boundaries

1. No calendar writes.
2. No Gmail.
3. No broad event sync.
4. No background polling.
5. No cron.
6. No automatic brief creation without confirmation.
7. No storing full calendar body beyond the confirmed brief text.
8. No model call.

## Validation

Run from `app/`:

1. `pnpm copy:smoke`
2. `pnpm model:smoke`
3. `pnpm verify:supabase-project`
4. `pnpm typecheck`
5. `pnpm lint`
6. `pnpm exec supabase test db`

Operator smoke:

1. Connect Google Calendar from T3.
2. Open `/w/<slug>/settings/connectors/google-calendar`.
3. Confirm upcoming events render.
4. Preview one event as a brief.
5. Confirm preview copy is accurate and does not overclaim.
6. Click `Create brief and ticket`.
7. Confirm redirect to ticket detail.
8. Confirm Home and History show the new connector-sourced brief/ticket.

If there are no calendar events, create a harmless test event manually in Google Calendar and rerun.

## Report Requirements

Write:

`docs/briefs/phase5_t4_calendar_readonly_ingest_report.md`

Report must include:

1. Completion status.
2. Files changed.
3. Provider API used.
4. Scopes used.
5. Read-only guarantee.
6. Preview and confirmation behavior.
7. Brief/ticket insertion path.
8. Validation output with exact pass lines.
9. Operator acceptance ticket URL if exercised.
10. Next recommended ticket: Phase 5 T5 Automation Rules.

After writing the report, immediately read it back and echo:

1. line count
2. first 3 non-empty lines
3. final completion status line

## Stop Conditions

Stop and report blocked if:

1. Token decrypt/read is not server-only.
2. Google API requires write scopes for this workflow.
3. Event ingest would happen without user confirmation.
4. Cross-workspace access cannot be ruled out.
5. The implementation starts background sync.
