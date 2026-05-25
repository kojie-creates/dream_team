# CLAUDE BRIEF: Phase 5 T5 Automation Rules

Date: 2026-05-24
Repo: `C:\Users\felix\Desktop\dream_team`
App root: `C:\Users\felix\Desktop\dream_team\app`

## Purpose

Add user-controlled automation rules for connector ingest.

This ticket should create an automation rule model and a manual run path. Do not add autonomous cron execution until the manual run is safe, traceable, and user-visible.

## Operating Mode

This is a single-ticket implementation brief.

Work sequentially. After every file write, immediately read back enough of the changed file to prove it exists and contains the intended section. For markdown reports, echo the first 3 non-empty lines and the line count.

Do not report completion until all validation gates have been run or honestly marked blocked.

## Source Files To Read First

Read these before editing:

1. `app/AGENTS.md`
2. `docs/briefs/phase5_t4_calendar_readonly_ingest_report.md`
3. `app/supabase/migrations/0005_phase1_workflow_foundation.sql`
4. `app/supabase/migrations/0006_phase5_connectors.sql`
5. `app/supabase/tests/rls/connectors.test.sql`
6. `app/src/app/w/[slug]/settings/connectors/google-calendar/page.tsx`
7. `app/src/app/actions/briefs.ts`
8. `app/src/lib/connectors/googleCalendar.ts`

After each read, echo the first 3 non-empty lines.

Use `Get-Content -LiteralPath` for dynamic route paths with `[slug]`.

## Goal

Create a minimal automation rule that can be run manually:

`Create a brief from the next matching Google Calendar event`

The rule must be workspace-scoped, user-controlled, and auditable.

## Schema

Create migration:

`app/supabase/migrations/0007_phase5_automation_rules.sql`

Table:

`automation_rules`

Columns:

1. `id uuid primary key default gen_random_uuid()`
2. `workspace_id uuid not null references public.workspaces(id) on delete cascade`
3. `connector_id uuid not null references public.connectors(id) on delete cascade`
4. `name text not null`
5. `status text not null default 'paused'`
6. `trigger_type text not null`
7. `config jsonb not null default '{}'::jsonb`
8. `last_run_at timestamptz null`
9. `last_result text null`
10. `created_by uuid not null references auth.users(id) on delete cascade`
11. `created_at timestamptz not null default now()`
12. `updated_at timestamptz not null default now()`

Constraints:

1. `status in ('paused','active','error')`
2. `trigger_type in ('manual_calendar_ingest','daily_calendar_digest')`

RLS:

1. Workspace members can select.
2. Workspace owners/admins can insert/update.
3. No client delete in T5.

Create pgtap tests:

`app/supabase/tests/rls/automation_rules.test.sql`

Assertions:

1. RLS enabled.
2. Anon cannot read/write.
3. Member can read own workspace rule.
4. Non-member cannot read foreign workspace rule.
5. Owner/admin can create/update.
6. Plain member cannot create/update.

## UI

Create:

`/w/[slug]/settings/automations`

Also link from Settings landing page.

Page should show:

1. Header with breadcrumb.
2. Honest phase copy: `Manual runs first. Scheduled background execution is not enabled yet.`
3. Rule list.
4. Create rule form for Google Calendar:
   - rule name
   - match text optional
   - event window select: next 7 days / next 14 days
   - status defaults to paused
5. Manual run button for existing rule.

Keep scheduling UI disabled or clearly marked `Later`.

## Manual Run Behavior

Server action:

`runAutomationRuleNow`

Requirements:

1. Authenticated session.
2. RLS workspace read.
3. RLS automation rule read.
4. Confirm connected Google Calendar connector.
5. Fetch upcoming events server-side.
6. Pick the first event matching rule config.
7. Create a `briefs` row and `tickets` row using the same connector source style from T4.
8. Update rule `last_run_at` and `last_result`.
9. Redirect to ticket detail or return the ticket URL.

No cron. No background execution. No repeated ingest loop.

Idempotence:

Use a simple config marker or raw_text marker to avoid creating duplicate tickets from the same provider event in the same workspace if possible. If the schema cannot represent this cleanly, do not overbuild. Report the duplicate risk honestly.

## Hard Boundaries

1. No autonomous cron execution.
2. No external writes.
3. No Gmail.
4. No model calls.
5. No hidden brief creation.
6. No service-role before RLS authorization.
7. Do not call this production automation unless scheduling is actually enabled.

## Validation

Run from `app/`:

1. `pnpm copy:smoke`
2. `pnpm model:smoke`
3. `pnpm verify:supabase-project`
4. `pnpm typecheck`
5. `pnpm lint`
6. `pnpm exec supabase db reset`
7. `pnpm exec supabase test db`

Operator smoke:

1. Open `/w/<slug>/settings/automations`.
2. Create a paused Google Calendar ingest rule.
3. Run it manually.
4. Confirm it creates one brief/ticket from one calendar event.
5. Confirm rule shows last run/result.
6. Confirm no background run happens on refresh.

## Report Requirements

Write:

`docs/briefs/phase5_t5_automation_rules_report.md`

Report must include:

1. Completion status.
2. Files changed.
3. Schema added.
4. RLS assertions added.
5. UI route added.
6. Manual run behavior.
7. Explicit non-claim: no scheduler/cron yet.
8. Validation output with exact pass lines.
9. Operator acceptance notes.
10. Next recommended ticket: Phase 5 T6 Controlled Tool Write Path.

After writing the report, immediately read it back and echo:

1. line count
2. first 3 non-empty lines
3. final completion status line

## Stop Conditions

Stop and report blocked if:

1. Rule execution would happen without user action.
2. Calendar ingest cannot avoid obvious duplicate creation.
3. RLS tests require policy weakening.
4. The implementation starts cron or background scheduling.
