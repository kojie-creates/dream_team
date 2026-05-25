# CLAUDE BRIEF: Phase 3 T3 Agent Detail

Date: 2026-05-24
Repo: `C:\Users\felix\Desktop\dream_team`
App root: `C:\Users\felix\Desktop\dream_team\app`

## Purpose

Add read-only Agent Detail pages to the Phase 3 catalog.

Phase 3 T2 made the 28-agent catalog browsable from `agents/`. T3 should make each catalog entry inspectable on its own route, showing the agent's source-backed role, summary, group, source path, and readable markdown body.

This ticket is still read-only. Do not execute agents, edit prompts, or implement contract viewing beyond simple links or references.

## Operating Mode

This is a single-ticket implementation brief.

Work sequentially. After every file write, immediately read back enough of the changed file to prove it exists and contains the intended section. For any markdown report, echo the first 3 non-empty lines and the line count.

Do not report completion until all validation gates have been run or honestly marked blocked.

## Source Files To Read First

Read these before editing:

1. `app/AGENTS.md`
2. `docs/briefs/phase3_workspace_operating_surface_claude_brief.md`
3. `docs/briefs/phase3_t2_agent_catalog_report.md`
4. `app/src/lib/agents/catalog.ts`
5. `app/src/components/agents/AgentCatalog.tsx`
6. `app/src/app/w/[slug]/agents/page.tsx`
7. `app/src/components/workspace/WorkspaceNav.tsx`
8. `agents/orchestrator/central-orchestrator.md`
9. One specialist sample, such as `agents/specialists/build/architect.md`
10. `contracts/` directory listing

After each file read, echo the first 3 non-empty lines. For directories, echo the item count and first 10 names.

Use `Get-Content -LiteralPath` for dynamic route paths with `[slug]` or `[agentId]`.

## Goal

Add route:

`/w/[slug]/agents/[agentId]`

The page should show a single agent profile using only checked-in source data.

Minimum fields:

1. Agent title/name.
2. Agent slug.
3. Group.
4. Description/summary.
5. Source path.
6. Source-backed markdown content rendered safely.
7. Back link to Agent Catalog.
8. Honest note: read-only prompt source, no execution from this page.

## Implementation Scope

### Required

1. Extend the catalog loader so a detail page can load one agent by slug.
2. Preserve the T2 catalog behavior and counts.
3. Change catalog cards from disabled `Detail · T3` chips into real links.
4. Add `/w/[slug]/agents/[agentId]/page.tsx`.
5. Keep workspace lookup/RLS guard consistent with the existing agents page.
6. If an unknown agent ID is requested, return `notFound()`.
7. Render the markdown body safely:
   - plain text or controlled `<pre>` style is acceptable.
   - no `dangerouslySetInnerHTML`.
8. Keep the route read-only and non-executing.

### Optional If Small

1. Add previous/next links within the catalog order.
2. Surface related contract filenames as plain references if the agent markdown names them directly.
3. Add a compact metadata panel.

Only take optional items if they do not require a contract parser or broad markdown renderer.

## Suggested File Shape

Likely changes:

1. `app/src/lib/agents/catalog.ts`
   - include raw body or display body in `AgentEntry`
   - add `loadAgentBySlug(slug: string)`
2. `app/src/components/agents/AgentCatalog.tsx`
   - accept workspace slug or link prefix
   - render detail links
3. `app/src/components/agents/AgentDetail.tsx`
   - presentational component, if useful
4. `app/src/app/w/[slug]/agents/[agentId]/page.tsx`
   - route loader + notFound
5. `docs/briefs/phase3_t3_agent_detail_report.md`

Keep it simpler if fewer files are clearer.

## Detail Page UI Expectations

Use the same dark operator style as the catalog.

Recommended layout:

1. Top back link: `← Agents`
2. Header:
   - agent title
   - slug
   - group
3. Summary section.
4. Metadata row:
   - source path
   - source: `agents/`
   - read-only
5. Body section:
   - source markdown as safe text
   - scroll-capped if long
6. Footer note:
   - `This page displays checked-in prompt source. It does not execute the agent.`

Do not add "Run agent" or "Start workflow" buttons.

## Parsing And Safety Rules

1. Do not hallucinate fields not present in the agent file.
2. Keep existing T2 frontmatter/title/summary logic stable.
3. If body content includes markdown, render as text or simple controlled markdown.
4. Do not inject HTML from source files.
5. Do not rewrite source markdown.
6. Do not move files in `agents/`.

## Hard Boundaries

1. No schema migrations.
2. No model calls.
3. No connector/OAuth work.
4. No agent execution.
5. No prompt editing.
6. No Contract Viewer implementation. That is Phase 3 T4.
7. No History implementation. That is Phase 3 T5.
8. No broad catalog redesign.

## Tests And Validation

Run from `app/`:

1. `pnpm copy:smoke`
2. `pnpm model:smoke`
3. `pnpm verify:supabase-project`
4. `pnpm typecheck`
5. `pnpm lint`
6. `pnpm exec supabase test db`

Run browser or curl smoke:

1. `/w/<slug>/agents` still renders 28 agents.
2. Detail link for `central-orchestrator` opens `/w/<slug>/agents/central-orchestrator`.
3. Unknown agent route returns 404.
4. Agents nav remains active on detail route.
5. Unauthenticated `/w/<slug>/agents/central-orchestrator` redirects to `/signin`.

No `supabase db reset` is required unless schema changes happen. No schema change is expected.

## Report Requirements

Write:

`docs/briefs/phase3_t3_agent_detail_report.md`

Report must include:

1. Completion status.
2. Files changed.
3. Route added.
4. Catalog/source behavior preserved.
5. Detail page fields.
6. Safety/rendering choices.
7. Browser/curl smoke results.
8. Validation output with exact pass lines.
9. Next recommended ticket: Phase 3 T4 Contracts Viewer.

After writing the report, immediately read it back and echo:

1. line count
2. first 3 non-empty lines
3. final completion status line

## Stop Conditions

Stop and report blocked if:

1. Agent slug uniqueness is not reliable.
2. Source markdown cannot be rendered safely without adding a renderer dependency.
3. Detail routing would require changing workspace auth/layout behavior.
4. The implementation starts turning into prompt editing or agent execution.
