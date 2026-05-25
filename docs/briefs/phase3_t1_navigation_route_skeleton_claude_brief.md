# CLAUDE BRIEF: Phase 3 T1 Navigation + Route Skeleton

Date: 2026-05-24
Repo: `C:\Users\felix\Desktop\dream_team`
App root: `C:\Users\felix\Desktop\dream_team\app`

## Purpose

Start Phase 3 by making Dream Team feel like a coherent workspace application.

Phase 2 proved the first real workflow loop. Phase 3 begins by giving users stable navigation and predictable route destinations before adding agent catalog, history, contract viewing, or settings polish.

This ticket should add the main workspace navigation and route skeletons only.

## Operating Mode

This is a single-ticket implementation brief.

Work sequentially. After every file write, immediately read back enough of the changed file to prove it exists and contains the intended section. For any markdown report, echo the first 3 non-empty lines and the line count.

Do not report completion until all validation gates have been run or honestly marked blocked.

## Source Files To Read First

Read these before editing:

1. `app/AGENTS.md`
2. `docs/briefs/phase3_workspace_operating_surface_claude_brief.md`
3. `docs/briefs/phase2_acceptance_report.md`
4. `docs/design/dream_team_v1_architecture_brief.md`
5. `docs/design/dream_team_first_run_ux_brief.md`
6. `app/src/components/workspace/WorkspaceFrame.tsx`
7. `app/src/components/workspace/WorkspaceSwitcher.tsx`
8. `app/src/app/w/[slug]/page.tsx`
9. `app/src/app/w/[slug]/tickets/page.tsx`
10. `app/src/app/w/[slug]/settings/members/page.tsx`
11. Existing route folders under `app/src/app/w/[slug]/`

After each file read, echo the first 3 non-empty lines. For directories, echo the item count and first 10 names.

Use `Get-Content -LiteralPath` for dynamic route paths with `[slug]`.

## Goal

Add stable shell navigation for:

1. Home
2. Tickets
3. Agents
4. History
5. Settings

Add route skeletons where missing so every nav item resolves to a real page.

## Expected User Flow

1. User opens `/w/kojie-san-workspace`.
2. Header includes the workspace switcher and a compact workspace navigation.
3. User clicks `Home` and remains on the workspace home.
4. User clicks `Tickets` and sees the existing tickets page.
5. User clicks `Agents` and sees an honest Phase 3 placeholder/skeleton page.
6. User clicks `History` and sees an honest Phase 3 placeholder/skeleton page.
7. User clicks `Settings` and reaches a settings landing page that links to Members.
8. User can still sign out.

## Implementation Scope

### Required

1. Update `WorkspaceFrame` to render workspace navigation.
2. Highlight the active route.
3. Preserve the existing workspace switcher.
4. Preserve the existing sign-out control.
5. Add missing route skeletons:
   - `/w/[slug]/agents`
   - `/w/[slug]/history`
   - `/w/[slug]/settings`
6. Ensure `/w/[slug]/settings` links to the existing `/w/[slug]/settings/members`.
7. Use the current quiet dark operator style.
8. Keep skeleton pages honest: no fake data, no "coming soon" marketing hero, no claims that features are complete.
9. Ensure all route skeletons remain behind the existing workspace layout and RLS membership guard.

### Optional If Small

1. Add a minimal browser-smoke document or script for the five routes.
2. Add Playwright only if the dependency/setup is already present or can be added without slowing T1.

Do not let Playwright setup dominate this ticket. If it looks bigger than a small smoke, document it as Phase 3 defensive follow-up.

## Suggested Route Skeleton Content

### Agents

Purpose: future Agent Catalog.

Show:

1. Page title: `Agents`
2. Short honest subtitle: `Browse Dream Team roles and contracts.`
3. Three static placeholder rows or panels:
   - `Orchestrator`
   - `Specialists`
   - `Review agents`
4. Note: `Catalog wiring starts in Phase 3 T2.`

### History

Purpose: future workspace activity history.

Show:

1. Page title: `History`
2. Short honest subtitle: `Review completed briefs, tickets, runs, and evidence.`
3. Link back to Tickets.
4. Note: `Timeline wiring starts in Phase 3 T5.`

### Settings

Purpose: settings landing.

Show:

1. Page title: `Settings`
2. Link card to `Members`
3. Optional small card for `Workspace` marked as not yet configurable.
4. No billing, connector, or token settings yet.

## Navigation Rules

1. Nav must be workspace-scoped.
2. Use slug-aware links:
   - `/w/${slug}`
   - `/w/${slug}/tickets`
   - `/w/${slug}/agents`
   - `/w/${slug}/history`
   - `/w/${slug}/settings`
3. Active state should work for nested routes:
   - `/tickets/[ticketId]` keeps Tickets active.
   - `/settings/members` keeps Settings active.
4. Text must fit on mobile.
5. Do not use decorative hero sections.
6. Do not hide existing primary Home actions.

## Hard Boundaries

1. No schema migrations.
2. No model calls.
3. No connector/OAuth work.
4. No billing or usage meter.
5. No agent catalog parsing yet. That is Phase 3 T2.
6. No contract viewer yet. That is Phase 3 T4.
7. No history data wiring yet unless it is already trivial and does not expand scope.
8. Do not change Phase 2 workflow actions.

## Tests And Validation

Run from `app/`:

1. `pnpm copy:smoke`
2. `pnpm model:smoke`
3. `pnpm verify:supabase-project`
4. `pnpm typecheck`
5. `pnpm lint`

Run these if practical and non-disruptive:

1. `pnpm exec supabase test db`
2. Route smoke via browser or curl:
   - `/w/<slug>`
   - `/w/<slug>/tickets`
   - `/w/<slug>/agents`
   - `/w/<slug>/history`
   - `/w/<slug>/settings`
   - `/w/<slug>/settings/members`

Do not run destructive database reset unless needed. No schema change is expected.

## Browser Smoke Expectations

For a signed-in workspace member:

1. All five nav links render.
2. Each nav link reaches a page with a matching title.
3. Active state follows the current section.
4. Existing ticket detail routes still work.
5. Sign out remains available.

For unauthenticated access:

1. Existing middleware redirects `/w/<slug>/agents`, `/history`, and `/settings` to `/signin`.

## Report Requirements

Write:

`docs/briefs/phase3_t1_navigation_route_skeleton_report.md`

Report must include:

1. Completion status.
2. Files changed.
3. Routes added or modified.
4. Navigation behavior.
5. Browser/curl smoke results.
6. Validation output with exact pass lines.
7. Whether Playwright was added or deferred.
8. Next recommended ticket: Phase 3 T2 Agent Catalog.

After writing the report, immediately read it back and echo:

1. line count
2. first 3 non-empty lines
3. final completion status line

## Stop Conditions

Stop and report blocked if:

1. Workspace navigation requires changing auth or RLS behavior.
2. Active state needs a broad router refactor.
3. Route skeletons require schema/data work.
4. The task starts becoming Agent Catalog or History implementation rather than route structure.
