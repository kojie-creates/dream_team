# CLAUDE BRIEF: Phase 3 T5 History Page

Date: 2026-05-24
Repo: `C:\Users\felix\Desktop\dream_team`
App root: `C:\Users\felix\Desktop\dream_team\app`

## Purpose

Replace the Phase 3 T1 History skeleton with a real read-only workspace history page.

The History page should let a user review recent briefs, tickets, workflow runs, trace events, packets, and artifacts without relying only on Home cards or a single ticket detail page.

This ticket is read-only. Do not add new workflow actions, retries, failure inspection, billing, or schema changes.

## Operating Mode

This is a single-ticket implementation brief.

Work sequentially. After every file write, immediately read back enough of the changed file to prove it exists and contains the intended section. For any markdown report, echo the first 3 non-empty lines and the line count.

Do not report completion until all validation gates have been run or honestly marked blocked.

## Source Files To Read First

Read these before editing:

1. `app/AGENTS.md`
2. `docs/briefs/phase3_workspace_operating_surface_claude_brief.md`
3. `docs/briefs/phase3_t4_contracts_viewer_report.md`
4. `docs/briefs/phase2_acceptance_report.md`
5. `app/src/app/w/[slug]/history/page.tsx`
6. `app/src/app/w/[slug]/page.tsx`
7. `app/src/components/home/ActivitySections.tsx`
8. `app/src/app/w/[slug]/tickets/page.tsx`
9. `app/src/app/w/[slug]/tickets/[ticketId]/page.tsx`
10. `app/src/components/tickets/StatusPill.tsx`
11. `app/supabase/migrations/0005_phase1_workflow_foundation.sql`

After each file read, echo the first 3 non-empty lines.

Use `Get-Content -LiteralPath` for dynamic route paths with `[slug]` or `[ticketId]`.

## Goal

Add a useful, read-only timeline at:

`/w/[slug]/history`

The page should show recent workspace activity from existing tables:

1. Tickets.
2. Briefs.
3. Workflow runs.
4. Trace events.
5. Packets/artifacts where useful.

Everything should be sourced through RLS-gated reads using the existing session client.

## Implementation Scope

### Required

1. Replace the placeholder History page with real data.
2. Query only existing tables.
3. Keep a reasonable limit, such as 25 to 50 history items.
4. Show a combined timeline sorted newest first.
5. Link timeline items back to ticket detail when a ticket ID exists.
6. Include a small summary/header:
   - total recent items shown
   - latest activity time
   - workspace name
7. Preserve the existing History nav active state.
8. Use existing status styling where appropriate.
9. Handle empty state honestly.

### Optional If Small

1. Add filters for item type:
   - All
   - Tickets
   - Runs
   - Trace
   - Packets
   - Artifacts
2. Add compact per-ticket grouping if it stays simple.
3. Add "View ticket" links on every item with `ticket_id`.

Only take optional items if they do not add client-heavy state or schema changes.

## Suggested Data Shape

Build a local typed array in the page or helper:

```ts
type HistoryItem = {
  id: string;
  kind: 'ticket' | 'brief' | 'run' | 'trace' | 'packet' | 'artifact';
  title: string;
  subtitle: string;
  timestamp: string;
  ticketId: string | null;
  href: string | null;
  meta?: string;
};
```

Suggested sources:

1. `tickets`: title, status, layer, current_agent, updated_at.
2. `briefs`: source, word_count, created_at.
3. `workflow_runs`: run_kind, agent_id, model, status, started_at.
4. `trace_events`: seq, event_type, from_agent, to_agent, created_at.
5. `packets`: packet_type, body_parsed.packet_kind, created_at.
6. `artifacts`: kind, mime_type, bytes, created_at.

Keep queries capped. Do not fetch huge raw packet bodies for the history list.

## UI Expectations

Use the current dark operator style.

Recommended layout:

1. Header:
   - workspace eyebrow
   - `History`
   - subtitle: `Recent workspace activity across briefs, tickets, runs, and evidence.`
2. Summary strip:
   - shown count
   - latest activity
   - source tables included
3. Timeline list:
   - icon or small kind pill
   - title
   - subtitle/meta
   - timestamp
   - link to ticket if present
4. Empty state:
   - point user to Paste or Upload brief

Avoid a decorative hero. Keep it dense, scannable, and operational.

## Hard Boundaries

1. No schema migrations.
2. No model calls.
3. No connector/OAuth work.
4. No retry/failure inspector actions. That is Phase 4.
5. No billing/usage meter. That is Phase 4 unless explicitly moved.
6. No service-role reads for normal history UI.
7. No raw large packet/artifact body rendering in the list.
8. No broad dashboard redesign.

## Tests And Validation

Run from `app/`:

1. `pnpm copy:smoke`
2. `pnpm model:smoke`
3. `pnpm verify:supabase-project`
4. `pnpm typecheck`
5. `pnpm lint`
6. `pnpm exec supabase test db`

Run browser or curl smoke:

1. `/w/<slug>/history` renders for signed-in user.
2. History nav item is active.
3. Recent Phase 2/3 activity appears if the workspace has test data.
4. At least one item links to a ticket detail page when data exists.
5. Unauthenticated `/w/<slug>/history` redirects to `/signin`.

No `supabase db reset` is required unless schema changes happen. No schema change is expected.

## Report Requirements

Write:

`docs/briefs/phase3_t5_history_page_report.md`

Report must include:

1. Completion status.
2. Files changed.
3. Data sources queried.
4. Query limits.
5. UI behavior.
6. Empty state behavior.
7. Browser/curl smoke results.
8. Validation output with exact pass lines.
9. Next recommended ticket: Phase 3 T6 Settings Polish.

After writing the report, immediately read it back and echo:

1. line count
2. first 3 non-empty lines
3. final completion status line

## Stop Conditions

Stop and report blocked if:

1. History cannot be built honestly from existing tables.
2. Required joins become broad enough to need a view or schema migration.
3. RLS-gated session reads cannot access the data needed.
4. The implementation starts turning into failure inspector, billing, or analytics dashboards.
