# CLAUDE BRIEF: Phase 3 T2 Agent Catalog

Date: 2026-05-24
Repo: `C:\Users\felix\Desktop\dream_team`
App root: `C:\Users\felix\Desktop\dream_team\app`

## Purpose

Replace the Phase 3 T1 Agents skeleton with a real read-only Agent Catalog.

The catalog should make the checked-in Dream Team roles browsable inside the app. This ticket is discovery and presentation only. It must not execute agents, edit prompts, run workflows, or build the Agent Detail page yet.

## Operating Mode

This is a single-ticket implementation brief.

Work sequentially. After every file write, immediately read back enough of the changed file to prove it exists and contains the intended section. For any markdown report, echo the first 3 non-empty lines and the line count.

Do not report completion until all validation gates have been run or honestly marked blocked.

## Source Files To Read First

Read or list these before editing:

1. `app/AGENTS.md`
2. `docs/briefs/phase3_workspace_operating_surface_claude_brief.md`
3. `docs/briefs/phase3_t1_navigation_route_skeleton_report.md`
4. `docs/design/dream_team_v1_architecture_brief.md`
5. `docs/design/dream_team_first_run_ux_brief.md`
6. `agents/` directory listing
7. `.claude/agents/` directory listing
8. `contracts/` directory listing
9. `app/src/app/w/[slug]/agents/page.tsx`
10. `app/src/components/workspace/WorkspaceNav.tsx`

After each file read, echo the first 3 non-empty lines. For directories, echo the item count and first 10 names.

Use `Get-Content -LiteralPath` for dynamic route paths with `[slug]`.

## Current Source Shape

Expected local source surfaces:

1. `agents/` has grouped folders such as `orchestrator`, `coordinators`, `specialists`, and `packager`.
2. `.claude/agents/` has markdown agent files such as `central-orchestrator.md`, `architect.md`, `marketing-strategy.md`, `qa` or review roles, and related specialists.
3. `contracts/` has canonical contract markdown files, but contract viewing is Phase 3 T4.

Treat `.claude/agents/` as the most direct catalog input for this ticket unless `agents/` contains a more canonical index. If there is ambiguity, document the source choice in the report and do not block.

## Goal

Build a read-only catalog at:

`/w/[slug]/agents`

The catalog should show:

1. Agent count.
2. Grouped roles by layer/category.
3. Agent name.
4. Agent ID or filename-derived slug.
5. Short summary derived from the markdown frontmatter or first meaningful paragraph.
6. Source file path.
7. Honest note that detail pages arrive in T3.

## Implementation Scope

### Required

1. Add a small server-side catalog loader.
2. Read checked-in agent markdown from disk at request/build time.
3. Parse only simple metadata:
   - filename/slug
   - title/name
   - group/category
   - short summary
   - source path
4. Render the catalog on `/w/[slug]/agents`.
5. Preserve existing T1 navigation and active state.
6. Keep the route under the existing workspace layout and RLS membership guard.
7. Do not add DB tables.
8. Do not add an editor.
9. Do not execute or import agent code as behavior.

### Optional If Small

1. Add simple search/filter by text.
2. Add simple group tabs or segmented filter.
3. Add disabled links to future detail pages if clearly marked.

Only take optional items if they do not require client-heavy state or new dependencies.

## Suggested File Shape

Prefer focused files:

1. `app/src/lib/agents/catalog.ts`
   - server-only helper
   - reads `.claude/agents/*.md` or canonical source
   - returns typed catalog entries
2. `app/src/components/agents/AgentCatalog.tsx`
   - presentational component
   - no file-system access
3. `app/src/app/w/[slug]/agents/page.tsx`
   - workspace lookup stays here
   - calls catalog loader
   - renders catalog

If fewer files are cleaner, keep it simpler. Do not split for its own sake.

## Parsing Rules

Keep parsing conservative:

1. If frontmatter exists, use it.
2. If no frontmatter exists, derive title from the first markdown heading.
3. If no heading exists, derive title from filename.
4. Summary should be the first non-empty paragraph after frontmatter/heading, trimmed to a reasonable length.
5. Group can come from folder, filename, known role mapping, or a small local classifier based on name. Keep this deterministic.
6. Never hallucinate capabilities not present in the file.

If parsing is imperfect, show the source path so the user can audit it.

## UI Expectations

Use the current dark operator style.

Recommended layout:

1. Header:
   - `Agents`
   - short subtitle
   - count summary
2. Group sections:
   - Orchestrator
   - Coordinators
   - Specialists
   - Review / QA / Truth
   - Packager / Distribution
   - Other, if needed
3. Each agent row/card:
   - name
   - agent ID
   - group
   - summary
   - source path
   - disabled or plain text `Detail in T3`

Avoid marketing copy. This is an operator catalog.

## Hard Boundaries

1. No schema migrations.
2. No model calls.
3. No connector/OAuth work.
4. No agent execution.
5. No prompt editing.
6. No Agent Detail route in this ticket unless it is only a disabled/placeholder link.
7. No Contract Viewer implementation. That is Phase 3 T4.
8. Do not move or rewrite agent markdown files.

## Tests And Validation

Run from `app/`:

1. `pnpm copy:smoke`
2. `pnpm model:smoke`
3. `pnpm verify:supabase-project`
4. `pnpm typecheck`
5. `pnpm lint`
6. `pnpm exec supabase test db`

Run browser or curl smoke:

1. `/w/<slug>/agents` as signed-in user renders catalog.
2. Agent count is non-zero.
3. At least `central-orchestrator` appears if sourced from `.claude/agents`.
4. Navigation highlights Agents.
5. Unauthenticated `/w/<slug>/agents` still redirects to `/signin`.

No `supabase db reset` is required unless schema changes happen. No schema change is expected.

## Report Requirements

Write:

`docs/briefs/phase3_t2_agent_catalog_report.md`

Report must include:

1. Completion status.
2. Files changed.
3. Catalog source selected and why.
4. Agent count and group counts.
5. Parsing rules used.
6. UI behavior.
7. Browser/curl smoke results.
8. Validation output with exact pass lines.
9. Next recommended ticket: Phase 3 T3 Agent Detail.

After writing the report, immediately read it back and echo:

1. line count
2. first 3 non-empty lines
3. final completion status line

## Stop Conditions

Stop and report blocked if:

1. There is no reliable checked-in agent source.
2. Agent files disagree so strongly that a catalog would mislead users.
3. Parsing requires broad prompt canonicalization.
4. The implementation starts turning into Agent Detail or Contract Viewer.
