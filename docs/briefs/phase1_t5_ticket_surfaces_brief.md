# CLAUDE BRIEF: Phase 1 T5 Ticket List + Detail Polish

**Date:** 2026-05-24
**Repo:** C:\Users\felix\Desktop\dream_team
**App root:** C:\Users\felix\Desktop\dream_team\app

## Purpose

Give the workspace a real ticket surface. Home shows the 5 newest tickets; this ticket adds the full list, simple status filters, brief↔ticket linking, and small polish on the existing detail page. Sets up Phase 1 T6 acceptance to actually have something to walk through.

This is a read/surface ticket. Do not add schema, model calls, uploads, orchestration behavior, or connectors.

## Current State

Already complete:

- Phase 1 T1: database foundation (briefs, tickets, workflow_runs, trace_events, packets, artifacts).
- Phase 1 T2: paste brief flow → `/w/[slug]/new/paste` → briefs + tickets row → ticket detail page.
- Phase 1 T3: Orchestrator stub → workflow_runs + trace_events + packets rows → ticket status moves to done.
- Phase 1 T4: workspace Home reads real briefs/tickets/workflow_runs + summary counts.

Gaps T5 fixes:

- No way to see tickets beyond the 5 on Home.
- No status filter; no way to find open vs done quickly.
- Ticket detail page does not show which brief it came from beyond inline source text — no link back to a brief surface (none exists yet).
- Trace section is plain — payload JSON is summarized only by 3 keys (classification/verdict/reason); other event types render empty body.
- No "back to tickets list" navigation from detail page (only "back to workspace home").

## Source Files To Read First

Read these before editing. After each read, echo the first 3 non-empty lines.

- `app/AGENTS.md`
- `docs/design/dream_team_v1_architecture_brief.md`
- `docs/briefs/phase1_t2_paste_brief_flow_report.md`
- `docs/briefs/phase1_t3_orchestrator_stub_report.md`
- `docs/briefs/phase1_t4_live_home_report.md`
- `app/src/app/w/[slug]/page.tsx`
- `app/src/app/w/[slug]/tickets/[ticketId]/page.tsx`
- `app/src/components/home/ActivitySections.tsx`
- `app/supabase/migrations/0005_phase1_workflow_foundation.sql`

## Hard Scope

In scope:

- New route `/w/[slug]/tickets` — full ticket list, paginated or capped, with status filter chips.
- Brief → ticket link on ticket detail page (small breadcrumb-style header line).
- Extract shared `StatusPill` component (currently duplicated between detail page and `ActivitySections`).
- Trace event rendering: show full `payload` JSON in a collapsed `<details>` when `payloadSummary` returns null, so non-stub events do not look empty.
- "View all tickets" link from Home tickets panel into `/w/[slug]/tickets`.
- "Back to tickets" link on ticket detail page in addition to the existing back-to-workspace link.
- Status filter chips: All / Open / In progress / Needs input / Done / Failed / Looped. URL-driven via `?status=` query param so links are shareable.
- Final report: `docs/briefs/phase1_t5_ticket_surfaces_report.md`.

Out of scope:

- No schema migration.
- No model API call.
- No new server action.
- No Realtime/SSE.
- No upload / generate / chat surfaces.
- No connector work.
- No changes to auth / RLS / middleware / service-role helpers.
- No new orchestration behavior.
- No agent catalog / agent detail page (that's Phase 3).
- No history page.
- No search box (filter chips are enough for T5).

## Data + Surfaces

### `/w/[slug]/tickets`

Authenticated RSC. Resolve workspace by slug (RLS-gated). 404 if missing.

Read query string `status` (string | undefined). Validate against the 6 known statuses; treat invalid as `all`.

Query:

- `tickets` filtered by `workspace_id`, optionally by `status`, order `updated_at desc`, limit 50.
- Per-status counts (6 total + `all`) via `head: true, count: 'exact'` queries — parallel `Promise.all`. Acceptable to fan out; the table is small in Phase 1.

Render:

- Page header: workspace name + "Tickets" heading + count of currently filtered set.
- Filter chip row: All / Open / In progress / Needs input / Done / Failed / Looped. Each chip is a `<Link href="/w/[slug]/tickets?status=...">` (`all` strips the param). Active chip has a bright border/background.
- List of rows. Each row: status pill, title (clickable into detail), `layer`, `current_agent`, updated date. Empty state when zero rows match the filter — honest copy ("No tickets with status X yet.").
- If `tickets.length === 50`, render a small "Showing 50 most recent. Older tickets will appear once pagination ships." note. Do not implement pagination.

### `/w/[slug]/tickets/[ticketId]` polish

- Add a header crumb: `<workspace> · Tickets · <ticket title>` where `Tickets` links to `/w/[slug]/tickets`.
- Add brief metadata line under the title: when `ticket.brief_id` is set, show `From brief · paste · 142 words · May 24` (no separate brief detail page; the source text already renders below).
- Trace event rows: when `payloadSummary(ev.payload)` is null AND the payload has keys, render a `<details><summary>payload</summary><pre>{JSON.stringify}</pre></details>` block instead of nothing. Keep the existing summary path untouched when present.
- Add `Back to tickets` link alongside the existing `Back to <workspace>` link at the bottom.

### Home polish

- `ActivitySections` tickets panel header gets a small `View all →` link to `/w/[slug]/tickets`. No other Home changes.

### Shared component

- Extract `StatusPill` to `app/src/components/tickets/StatusPill.tsx`. Use it from both `ActivitySections` and ticket detail page. Keep the same tone palette already in use; do not invent new colors.

## UI Guidance

- Match existing dark operator-surface feel — no marketing hero, no nested cards in cards.
- Filter chips: small, rounded, single row that wraps. Active chip: `bg-neutral-100 text-neutral-900`. Inactive: `border-neutral-800 text-neutral-300 hover:border-neutral-600`.
- List rows: same density as Home `RecentTicketsPanel`. Reuse the layout pattern; do not redesign.
- Breadcrumb: muted `text-xs text-neutral-500`, separators `·`.
- `<details>` payload block: `text-[11px] font-mono`, padded, same neutral-900 bg as surrounding trace cards.

## Query Guidance

- All reads through `createSupabaseServerClient()`. No service-role anywhere on this surface.
- Validate the `status` query param against an explicit allowlist before passing to `.eq('status', ...)`. Defense-in-depth even though RLS is the real gate.
- Parallelize the filter-counts query with the row-list query via `Promise.all`.
- Do not fight generated types — local `as` casts at the boundary, mirroring T4.

## Validation Requirements

Run:

- `pnpm verify:supabase-project`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm exec supabase db reset`
- `pnpm exec supabase test db`

Browser/cloud smoke (operator-driven, document honestly):

- Visit `/w/[slug]/tickets` — confirm list renders, chips visible, counts match Home summary.
- Click each chip — URL updates, list re-filters, count badge updates.
- Click a ticket → detail page shows breadcrumb, brief metadata line, back-to-tickets link.
- On a ticket where the stub has run, expand any `<details>` payload block.
- From Home, click "View all →" — lands on `/w/[slug]/tickets`.
- Unauth probe of `/w/probe/tickets` → expect redirect to `/signin`.

## Required Readback After Each Write

After writing or editing each file, immediately read it back and echo:

- Path
- Line count
- First 3 non-empty lines

Applies to: page files, component files, tests if any, report file.

## Expected Files

Likely to create:

- `app/src/app/w/[slug]/tickets/page.tsx` — list route.
- `app/src/components/tickets/StatusPill.tsx` — shared pill.
- `app/src/components/tickets/TicketFilterChips.tsx` — filter chip row (or inline in page if small enough).
- `app/src/components/tickets/TicketListRow.tsx` — optional row component.
- `docs/briefs/phase1_t5_ticket_surfaces_report.md` — final report.

Likely to modify:

- `app/src/app/w/[slug]/tickets/[ticketId]/page.tsx` — breadcrumb, brief meta line, details payload, back link, swap to shared `StatusPill`.
- `app/src/components/home/ActivitySections.tsx` — `View all →` link in tickets panel header; swap inline pill for shared `StatusPill`.

Keep file count reasonable. Inline small helpers if extracting is overkill.

## Stop Conditions

Stop and report if:

- You need a schema migration.
- You need service-role for any read on this surface.
- RLS prevents the authenticated workspace member from reading their own tickets.
- Existing Supabase tests fail before your work.
- You need to modify auth/middleware.
- You need to add generated Supabase TS types.
- You need to add new dependencies (no new packages in T5).

## Final Report Must Include

Write `docs/briefs/phase1_t5_ticket_surfaces_report.md`:

- Completion status: complete, blocked, or partial.
- Files changed (new + modified) with line counts and first-3-non-empty-lines readback per file.
- New routes + their guards.
- Exact validation command outputs (verify, typecheck, lint, db reset, db test).
- Browser/cloud smoke summary (interactive steps + what was/wasn't driven).
- Confirmation that no schema migration was added.
- Confirmation that no service-role path was used on this surface.
- Confirmation that no new dependency was added.
- Known caveats and next recommended ticket (Phase 1 T6 acceptance pass).

## Next Ticket After This

**Phase 1 T6 — Phase 1 acceptance pass.** End-to-end interactive verification from sign-in → paste brief → ticket detail → Orchestrator stub click → trace render → ticket list filter → Home dashboard live counts. Produces a written acceptance report plus a short demo script suitable for a stakeholder walkthrough. Exit criterion for Phase 1 before Phase 2 begins wiring the real model API.
