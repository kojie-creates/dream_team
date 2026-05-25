# CLAUDE BRIEF: Phase 3 Workspace Operating Surface

Date: 2026-05-24
Repo: `C:\Users\felix\Desktop\dream_team`
App root: `C:\Users\felix\Desktop\dream_team\app`

## Purpose

Turn Dream Team from a working loop into a usable workspace dashboard.

Phase 3 should make the system understandable and navigable:

1. Agent catalog.
2. Agent detail pages.
3. History view.
4. Settings/member management polish.
5. Better workspace navigation.

This phase is mostly product surface. Do not add connectors or failure-governance mechanics here unless explicitly routed.

## Operating Mode

This is a phase-level brief, not permission to implement the whole phase in one pass.

Start each ticket by narrowing scope, naming files, and confirming validation. After every file write, immediately read back the changed file enough to prove it exists and contains the intended section. For new markdown reports, echo the first 3 non-empty lines and the line count.

## Phase 3 Exit Criteria

All 28 agents are browsable, contracts are viewable, basic workspace settings are functional, and a user can review past work without going directly through Home cards.

## Source Files To Read First

Read:

1. `docs/design/dream_team_v1_architecture_brief.md`
2. `docs/design/dream_team_first_run_ux_brief.md`
3. `docs/briefs/phase1_t6_acceptance_pass_report.md`
4. `agents/` directory listing
5. `.claude/agents/` directory listing, if present
6. `contracts/` directory listing
7. `app/src/components/workspace/WorkspaceFrame.tsx`
8. `app/src/components/workspace/WorkspaceSwitcher.tsx`
9. `app/src/app/w/[slug]/settings/members/page.tsx`
10. Existing ticket/home routes under `app/src/app/w/[slug]/`

After each file read, echo the first 3 non-empty lines. For directories, echo the item count and first 10 names.

## Recommended Ticket Sequence

### Phase 3 T1: Navigation + Route Skeleton

Goal: add the main workspace navigation for Home, Tickets, Agents, History, Settings.

Scope:

1. Update `WorkspaceFrame`.
2. Add route skeletons if missing.
3. Use current dark operator style.
4. No new DB tables.

Exit:

1. User can navigate core areas from the shell.

### Phase 3 T2: Agent Catalog

Goal: list the available agents by layer/category.

Scope:

1. Read checked-in agent files or a generated static registry.
2. Show agent name, layer, role, short summary.
3. Link to agent detail.

Exit:

1. All agents are visible and grouped.

### Phase 3 T3: Agent Detail

Goal: show a single agent profile.

Scope:

1. Route: `/w/[slug]/agents/[agentId]`
2. Show role, responsibilities, inputs, outputs, boundaries.
3. Link related contracts where relevant.
4. No execution from this page.

Exit:

1. Stakeholder can inspect what each agent is supposed to do.

### Phase 3 T4: Contracts Viewer

Goal: make canonical contracts inspectable in the UI.

Scope:

1. Show trace-emitter, failure-packet, loop-termination contracts.
2. Use read-only display.
3. Do not let UI edits mutate contracts.

Exit:

1. Governance artifacts are visible from the product.

### Phase 3 T5: History Page

Goal: workspace-wide recent work history.

Scope:

1. List briefs, tickets, runs, trace events in reverse chronological order.
2. Link back to ticket detail.
3. Use RLS-backed reads.

Exit:

1. User can review past work without relying on Home.

### Phase 3 T6: Settings Polish

Goal: make workspace members/settings usable enough for demo.

Scope:

1. Improve members page.
2. Show pending invites.
3. Keep email sender caveat honest.
4. Do not add billing yet unless explicitly routed.

Exit:

1. Owner/admin can inspect members and invite state.

## Hard Boundaries

1. No connector OAuth.
2. No billing meter unless moved from Phase 4.
3. No model execution from Agent Catalog.
4. No schema migration unless a specific surface requires it and RLS tests are included.
5. No service-role reads for normal UI surfaces.

## Validation Stack

Every ticket:

1. `pnpm verify:supabase-project`
2. `pnpm typecheck`
3. `pnpm lint`
4. `pnpm exec supabase db reset`
5. `pnpm exec supabase test db`
6. Browser smoke for the new route.

## Reports

Each ticket writes a report under `docs/briefs/` with:

1. Files changed.
2. Routes added.
3. Data sources used.
4. Validation output.
5. Known caveats.
6. Next recommended ticket.

## Stop Conditions

Stop if:

1. A route needs privileged data not available through RLS.
2. Agent docs are inconsistent enough to require canonicalization before display.
3. A page starts becoming an editor instead of a read surface.
4. Navigation changes require a broader IA decision.
