# Phase 5 T5 — Automation Rules — Report

Date: 2026-05-24
Status: COMPLETE (automated gates) / OPERATOR LIVE SMOKE PENDING

## Summary

Adds a workspace-scoped `automation_rules` table, an RLS suite, a
settings page at `/w/<slug>/settings/automations`, and two server
actions (`createAutomationRule`, `runAutomationRuleNow`). T5 ships
**manual run only** — there is no cron, no queue worker, no background
job, and no scheduler. A rule does nothing until a workspace member
clicks **Run now**.

## Files Changed

Created:

- `app/supabase/migrations/0007_phase5_automation_rules.sql` — table
  `public.automation_rules` with check constraints on `status` and
  `trigger_type`, indices on `(workspace_id, created_at desc)` and
  `connector_id`, `set_updated_at` trigger, and RLS policies (member
  select, owner/admin insert + update, no client delete).
- `app/supabase/tests/rls/automation_rules.test.sql` — pgtap suite,
  8 assertions, asserts RLS enabled, anon locked (read + insert), member
  read of own workspace, outsider isolation, admin insert, plain member
  insert denied, plain member update filtered (row unchanged).
- `app/src/app/actions/automations.ts` — `createAutomationRule` and
  `runAutomationRuleNow` server actions.
- `app/src/components/automations/CreateAutomationRuleForm.tsx` — client
  form wrapping `createAutomationRule` with `useActionState`. Fields:
  name, match text (optional), window select (7 / 14 days). Disabled
  when Google Calendar is not connected.
- `app/src/components/automations/RunAutomationRuleForm.tsx` — client
  form wrapping `runAutomationRuleNow` per rule row.
- `app/src/app/w/[slug]/settings/automations/page.tsx` — RSC page.
  Breadcrumb, "Manual runs first" copy, create form, rule list with
  last run / last result, per-rule **Run now** button, and an explicit
  "Scheduling not enabled" footer card.

Modified:

- `app/src/app/w/[slug]/settings/page.tsx` — added an **Automations**
  card under "Areas" pointing at `/w/<slug>/settings/automations`.

## Schema Added

`public.automation_rules` columns:

1. `id uuid primary key default gen_random_uuid()`
2. `workspace_id uuid not null references workspaces(id) on delete cascade`
3. `connector_id uuid not null references connectors(id) on delete cascade`
4. `name text not null`
5. `status text not null default 'paused'`
   check `('paused','active','error')`
6. `trigger_type text not null`
   check `('manual_calendar_ingest','daily_calendar_digest')`
7. `config jsonb not null default '{}'::jsonb`
8. `last_run_at timestamptz null`
9. `last_result text null`
10. `created_by uuid not null references auth.users(id) on delete cascade`
11. `created_at timestamptz not null default now()`
12. `updated_at timestamptz not null default now()`

Indices: `(workspace_id, created_at desc)`, `(connector_id)`.
Trigger: `set_updated_at` (Phase 0 helper).

`config` payload used by the calendar rule:

```
{ "window_days": 7 | 14, "match_text"?: string }
```

`daily_calendar_digest` is a reserved trigger_type for a later ticket
and is not executable in T5 — the run action rejects it with
`Trigger type "daily_calendar_digest" cannot be run manually in T5.`

## RLS Assertions Added (8)

1. RLS enabled on `automation_rules`.
2. Anon cannot read `automation_rules` (count = 0).
3. Anon insert rejected with SQLSTATE `42501`.
4. Workspace member can read own workspace rule (count = 1).
5. Outsider cannot read foreign workspace rule (count = 0).
6. Workspace admin can insert a rule for own workspace.
7. Plain member insert rejected with SQLSTATE `42501`.
8. Plain member UPDATE is filtered by RLS — issuing
   `update automation_rules set status='active'` as the plain member
   leaves the seeded `status='paused'` value unchanged.

No policy weakening required.

## UI Route Added

`/w/[slug]/settings/automations` (RSC):

- Breadcrumb: workspace · Settings · Automations.
- Amber banner: **Manual runs first. Scheduled background execution is
  not enabled yet.** Plus: "Each rule only runs when you click Run now.
  Reloading this page does not run anything."
- Create-rule card (Google Calendar ingest). Disabled when Calendar is
  not connected; reason is surfaced inline.
- Rule list, newest first, with: name, trigger_type, status, window,
  match text, last run timestamp, last result.
- Per-rule **Run now** button (only when the calendar connector is
  currently `connected` and the trigger_type is `manual_calendar_ingest`;
  otherwise a `Later` badge replaces the button).
- Footer card explicitly notes no cron / queue / background job runs
  against these rules.

Settings landing page links to it under "Areas" with the **Manual only**
badge.

## Manual Run Behavior

`runAutomationRuleNow(prev, form)` server action. Order mirrors T4's
authorization model:

1. `createSupabaseServerClient()` → `auth.getUser()`. Missing user →
   `redirect('/signin')`.
2. RLS-gated `workspaces` read by slug.
3. RLS-gated `automation_rules` read by `(id, workspace_id)`. Rejects
   `daily_calendar_digest` triggers (reserved, not executable in T5).
4. RLS-gated `connectors` read by `id`. Requires `status = 'connected'`.
5. Server-only `listUpcomingCalendarEvents(workspace.id, 50)`. On
   provider error, the rule's `last_result` is set to `error: <code>:
   <msg>` and the action returns the error to the user.
6. Filter events to those starting within
   `now + window_days * 24h`; if `match_text` is set, require a
   case-insensitive substring hit in `title`, `location`, or
   `descriptionSnippet`. The first remaining event wins. No match →
   `last_result = "no match: <reason>"`, action returns an `ok` message,
   no rows created.
7. **Idempotence:** RLS-gated lookup against `trace_events` for an
   existing row with `event_type='brief_ingested'` and
   `payload->>provider_event_id = <event id>` in the same workspace.
   Hit → `last_result = "duplicate: event already ingested (ticket
   <id>)."`, action returns `ok`, no new rows created. Trace_events is
   member-readable but server/service-role-only on insert (Phase 1
   policy), so this marker cannot be spoofed by a browser client.
8. RLS-gated `briefs` insert (`source='connector'`, body =
   `eventToBriefText(event)`), then RLS-gated `tickets` insert
   (`status='open'`, `title` ≤ 120 chars). Both as `created_by =
   auth.uid()`.
9. Best-effort service-role: insert `trace_events` row
   (`from_agent='connector:google_calendar'`, `event_type='brief_ingested'`,
   payload includes `automation_rule_id`) and stamp `connectors.last_sync_at`.
   Same envelope as T4; failure is swallowed.
10. Service-role `automation_rules.update` of `last_run_at` and
    `last_result = "created ticket <ticketId>"`. Service-role is used
    here because the rule update policy gates on owner/admin while we
    permit any workspace member to run a rule; the rule was already
    authorization-checked by an RLS-gated select in step 3.
11. `revalidatePath('/w/<slug>')` + `…/settings/automations` and
    `redirect('/w/<slug>/tickets/<ticketId>')`.

`createAutomationRule(prev, form)` follows the same auth → workspace →
connector pattern and performs an RLS-gated insert into
`automation_rules` (owner/admin only by policy). A plain member who
attempts to create gets the RLS rejection surfaced inline.

## Explicit Non-Claim — No Scheduler

There is no cron, queue worker, scheduled function, or background job in
this ticket. Specifically:

- No `pg_cron`, `pg_net`, `supabase functions deploy`, edge-function
  schedule, `vercel.json` cron entry, `node-cron`, or process manager
  invocation was added.
- No middleware or route handler polls or fires rules on page load.
  The settings page renders a list and a button; it does not execute
  rules.
- `status='active'` and `trigger_type='daily_calendar_digest'` exist in
  the schema as forward compatibility only — nothing reads `status` to
  decide whether to run, and the daily digest trigger is rejected by
  the run action.

This must not be called "production automation" until scheduling
actually ships. T5 is a manual-run model with audit trail.

## Validation Output

Run from `app/`:

```
pnpm copy:smoke               → copy-smoke: OK (28 checks)
pnpm model:smoke              → model-smoke: OK (13 checks)
pnpm verify:supabase-project  → verify-supabase-project: OK
pnpm typecheck                → exit 0, no errors
pnpm lint                     → exit 0, no errors
pnpm exec supabase db reset   → migrations 0001..0007 applied, OK
pnpm exec supabase test db    → Files=9, Tests=81, Result: PASS
```

The pgtap suite grew from 73 → 81 tests (the 8 new assertions in
`automation_rules.test.sql`). All prior suites still pass; no existing
policy was modified.

## Operator Acceptance Notes

PENDING live operator smoke (requires the same Google Cloud Console
OAuth client + `.env.local` setup documented in the T3 report —
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`CONNECTOR_TOKEN_ENCRYPTION_KEY` — plus at least one upcoming event on
the operator's primary calendar within the next 7 or 14 days).

Recommended walkthrough:

1. From T3/T4 setup, ensure Google Calendar shows **Connected** at
   `/w/<slug>/settings/connectors`.
2. Open `/w/<slug>/settings/automations` (via the **Automations** card
   on Settings).
3. Create a new rule (e.g. name `Next standup`, match text `standup`,
   window `Next 7 days`). Confirm it appears with `status: paused`,
   `last run: —`.
4. Click **Run now**. Confirm redirect to `/w/<slug>/tickets/<id>` and
   that the brief body is the verbatim `eventToBriefText` output for
   the matched event.
5. Return to `/w/<slug>/settings/automations`. Confirm the rule now
   shows a `Last run:` timestamp and
   `last_result = "created ticket <uuid>"`.
6. Click **Run now** again immediately. Confirm the action does not
   create a new ticket and instead reports
   `duplicate: event already ingested (ticket <uuid>).` Refresh the
   page and confirm no additional rows were written.
7. Refresh the page several times without clicking **Run now**.
   Confirm no new briefs / tickets / trace events appear — i.e. no
   background execution.

If the calendar has no events in the configured window, the run reports
`No matching event. <reason>.` and no rows are created.

Acceptance ticket URL: not exercised in this session (no live OAuth
credentials configured).

## Next Recommended Ticket

Phase 5 T6 — Controlled Tool Write Path. With manual ingest proven and
the rule/audit model in place, T6 is the right place to introduce the
first scoped *write* surface (e.g. posting a single message to a Slack
channel or filing one row to a Sheet) behind explicit per-operation
consent, a dry-run preview, and the same trace-events audit envelope
that T4/T5 established. T6 should remain user-triggered; scheduling
remains out of scope until a separate scheduler ticket lands.
