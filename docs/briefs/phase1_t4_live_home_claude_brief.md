# CLAUDE BRIEF: Phase 1 T4 Live Workspace Home

Date: 2026-05-24
Repo: `C:\Users\felix\Desktop\dream_team`
App root: `C:\Users\felix\Desktop\dream_team\app`

## Purpose

Make the workspace Home page read real Phase 1 work.

The user should be able to return to `/w/[slug]` after pasting a brief and running the Orchestrator stub, and see recent work reflected on the Home screen.

This is a dashboard/read-surface ticket. Do not add schema, model calls, uploads, or orchestration behavior.

## Current State

Already complete:

1. Phase 1 T1 database foundation.
2. Phase 1 T2 paste brief flow:
   - `/w/[slug]/new/paste`
   - `briefs` row
   - `tickets` row
   - ticket detail page
3. Phase 1 T3 Orchestrator stub:
   - `workflow_runs` row
   - `trace_events` row
   - `packets` row
   - ticket status moves to `done`
4. Current Home page:
   - Reads workspace
   - Shows `HomeIntro`
   - Shows `StarterDomains`
   - Shows static `ActivitySections`
   - Shows `ConnectorsPanel`

## Source Files To Read First

Read these before editing:

1. `app/AGENTS.md`
2. `docs/design/dream_team_v1_architecture_brief.md`
3. `docs/briefs/phase1_t2_paste_brief_flow_report.md`
4. `docs/briefs/phase1_t3_orchestrator_stub_report.md`
5. `app/src/app/w/[slug]/page.tsx`
6. `app/src/components/home/HomeIntro.tsx`
7. `app/src/components/home/ActivitySections.tsx`
8. `app/src/components/home/EmptyPanel.tsx`
9. `app/src/app/w/[slug]/tickets/[ticketId]/page.tsx`
10. `app/supabase/migrations/0005_phase1_workflow_foundation.sql`

After each read, echo the first 3 non-empty lines.

## Hard Scope

In scope:

1. Update workspace Home to fetch real recent data for the current workspace.
2. Replace or extend `ActivitySections` so it renders real data when present.
3. Keep good empty states when no data exists.
4. Link tickets to `/w/[slug]/tickets/[ticketId]`.
5. Add small home components if helpful.
6. Write final report: `docs/briefs/phase1_t4_live_home_report.md`

Out of scope:

1. No schema migration.
2. No model API.
3. No new server action.
4. No Realtime/SSE.
5. No upload/generate/chat.
6. No connector work.
7. No changes to auth/RLS/service-role helpers.
8. No new orchestration behavior.

## Data To Show

Fetch through the normal authenticated server Supabase client. RLS should gate workspace rows.

On `/w/[slug]`, show:

1. Recent briefs:
   - latest 3 or 5 rows
   - source
   - word count
   - created date
   - short raw text preview
2. Tickets:
   - latest 5 rows
   - title
   - status
   - layer if present
   - current agent if present
   - link to ticket detail
3. Workflow runs:
   - latest 5 rows joined or correlated to ticket title if reasonable
   - run kind
   - agent id
   - status
   - model
   - started date

Also show lightweight summary counts:

1. Open tickets
2. Done tickets
3. Total briefs
4. Latest workflow run status if available

If counts require awkward/unsupported Supabase count syntax, keep it simple:

1. Fetch recent tickets and compute counts from fetched rows, or
2. Use separate simple count queries.

Do not over-engineer.

## UI Guidance

Keep the current dark operator-surface feel.

1. No marketing hero.
2. No nested cards inside cards.
3. Compact, scannable rows.
4. Use small status pills for ticket/run statuses.
5. Preserve the "Paste a brief" CTA.
6. Keep Upload and Generate disabled/deferred.
7. Empty states should remain honest:
   - `No briefs yet`
   - `No tickets yet`
   - `No workflow runs yet`

Suggested component shape:

1. `ActivitySections` accepts props:
   - `slug`
   - `briefs`
   - `tickets`
   - `workflowRuns`
   - maybe `summary`
2. Optional components:
   - `HomeSummaryStrip`
   - `RecentBriefsPanel`
   - `RecentTicketsPanel`
   - `RecentRunsPanel`

Keep file count reasonable.

## Query Guidance

In `app/src/app/w/[slug]/page.tsx`:

1. Resolve workspace by slug:
   - select `id, name, slug`
2. Query `briefs` by `workspace_id`, order `created_at desc`, limit 5.
3. Query `tickets` by `workspace_id`, order `created_at desc` or `updated_at desc`, limit 5.
4. Query `workflow_runs` by `workspace_id`, order `started_at desc`, limit 5.
5. Keep error handling simple:
   - workspace missing -> `notFound()`
   - data query errors -> render empty arrays and optionally a small non-blocking note, or report in final if there is a real issue.

For workflow run ticket title:

1. If Supabase relation inference works cleanly, use it.
2. If not, do a simple second query or omit ticket title.
3. Do not spend time fighting generated types; there are no generated Supabase TS types yet.

## Validation Requirements

Run:

1. `pnpm verify:supabase-project`
2. `pnpm typecheck`
3. `pnpm lint`
4. `pnpm exec supabase db reset`
5. `pnpm exec supabase test db`

Browser/cloud smoke:

1. Use local app pointed at `dream-team-dev`.
2. Use an existing workspace with Phase 1 smoke data, or create a new paste/ticket/run via existing UI/actions.
3. Visit `/w/[slug]`.
4. Confirm Home shows:
   - at least one recent brief
   - at least one ticket link
   - at least one workflow run if a stub has run
   - summary counts
5. Click a ticket link and confirm ticket detail opens.

If browser typing automation fails, use existing cloud smoke rows and document the limitation honestly.

## Required Readback After Each Write

After writing or editing each file, immediately read it back and echo:

1. Path
2. Line count
3. First 3 non-empty lines

This applies to:

1. Page files
2. Component files
3. Tests if any
4. Report file

## Expected Files

Likely files to modify:

1. `app/src/app/w/[slug]/page.tsx`
2. `app/src/components/home/ActivitySections.tsx`

Likely files to create if useful:

1. `app/src/components/home/HomeSummaryStrip.tsx`
2. `app/src/components/home/RecentBriefsPanel.tsx`
3. `app/src/components/home/RecentTicketsPanel.tsx`
4. `app/src/components/home/RecentRunsPanel.tsx`
5. `docs/briefs/phase1_t4_live_home_report.md`

Keep the component set small. If `ActivitySections.tsx` can stay readable with local helper components, that is acceptable.

## Stop Conditions

Stop and report if:

1. You need a schema migration.
2. You need service-role for Home reads.
3. RLS prevents the authenticated workspace member from reading their own rows.
4. Existing Supabase tests fail before your work.
5. You need to modify auth/middleware.
6. You need to add generated Supabase TS types to make this work.

## Final Report Must Include

Write `docs/briefs/phase1_t4_live_home_report.md` with:

1. Completion status: `complete`, `blocked`, or `partial`
2. Files changed
3. What Home now reads
4. Empty-state behavior
5. Exact validation command outputs
6. Browser/cloud smoke summary
7. Confirmation that no schema migration was added
8. Confirmation that no service-role path was used
9. Known caveats and next recommended ticket

## Next Ticket After This

If this ticket completes, the next likely ticket is:

Phase 1 T5: Phase 1 acceptance pass. End-to-end verification from sign-in through paste brief, ticket detail, Orchestrator stub, trace display, and live Home dashboard.
