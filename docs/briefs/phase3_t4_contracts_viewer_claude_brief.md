# CLAUDE BRIEF: Phase 3 T4 Contracts Viewer

Date: 2026-05-24
Repo: `C:\Users\felix\Desktop\dream_team`
App root: `C:\Users\felix\Desktop\dream_team\app`

## Purpose

Make the checked-in governance contracts inspectable inside the workspace UI.

Phase 3 T2 made agents browsable. T3 made each agent inspectable. T4 should add a read-only Contracts Viewer for the canonical markdown files under `contracts/`.

This ticket is read-only. Do not edit contracts, generate contracts, add contract governance workflows, or wire contracts into runtime behavior.

## Operating Mode

This is a single-ticket implementation brief.

Work sequentially. After every file write, immediately read back enough of the changed file to prove it exists and contains the intended section. For any markdown report, echo the first 3 non-empty lines and the line count.

Do not report completion until all validation gates have been run or honestly marked blocked.

## Source Files To Read First

Read or list these before editing:

1. `app/AGENTS.md`
2. `docs/briefs/phase3_workspace_operating_surface_claude_brief.md`
3. `docs/briefs/phase3_t3_agent_detail_report.md`
4. `contracts/` directory listing
5. `contracts/trace-emitter-contract.md`
6. `contracts/failure-packet-contract.md`
7. `contracts/loop-termination-contract.md`
8. `app/src/components/workspace/WorkspaceNav.tsx`
9. `app/src/app/w/[slug]/agents/page.tsx`
10. `app/src/lib/agents/catalog.ts`

After each file read, echo the first 3 non-empty lines. For directories, echo the item count and first 10 names.

Use `Get-Content -LiteralPath` for dynamic route paths with `[slug]` or `[contractId]`.

## Goal

Add read-only contract routes:

1. `/w/[slug]/contracts`
2. `/w/[slug]/contracts/[contractId]`

The viewer should show the three current contracts:

1. `trace-emitter-contract.md`
2. `failure-packet-contract.md`
3. `loop-termination-contract.md`

## Navigation Decision

T1 nav did not include `Contracts` as a top-level item. For T4, add a route link without overcrowding the shell.

Preferred option:

1. Add `Contracts` to the workspace nav only if the nav still fits cleanly on mobile.
2. If adding a sixth nav item makes the shell feel crowded, add Contracts as a visible link/card from Agents and Settings instead, and document the choice.

Do not redesign the whole shell for this ticket.

## Implementation Scope

### Required

1. Add a server-side contract loader.
2. Read checked-in markdown files from `contracts/`.
3. Parse conservative metadata:
   - slug/contract ID from filename
   - title from first `#` heading
   - status line if present
   - short purpose excerpt if easy
   - source path
   - raw markdown body
4. Add a contracts list page.
5. Add a contract detail page.
6. Render markdown safely as text or controlled source view.
7. Keep the pages behind the existing workspace layout and membership guard.
8. Keep contracts read-only.

### Optional If Small

1. Add direct contract references from Agent Detail pages if an agent body mentions a contract filename.
2. Add simple anchor links for major headings in contract detail.
3. Add a compact "used by Phase 2 evidence" note, if backed by actual code/report references.

Only take optional items if they stay small and source-backed.

## Suggested File Shape

Likely files:

1. `app/src/lib/contracts/catalog.ts`
   - server-only helper
   - loads `contracts/*.md`
   - exposes `loadContractCatalog()` and `loadContractBySlug(slug)`
2. `app/src/components/contracts/ContractCatalog.tsx`
   - presentational list component
3. `app/src/components/contracts/ContractDetail.tsx`
   - presentational detail component, if useful
4. `app/src/app/w/[slug]/contracts/page.tsx`
5. `app/src/app/w/[slug]/contracts/[contractId]/page.tsx`
6. Maybe `app/src/components/workspace/WorkspaceNav.tsx` if adding Contracts to nav.

Keep it simpler if fewer files are clearer.

## UI Expectations

### Contracts List

Show:

1. Page title: `Contracts`
2. Subtitle: `Read-only governance contracts used by Dream Team workflows.`
3. Count: `3 contracts`
4. One card per contract:
   - title
   - status if parsed
   - source path
   - short excerpt
   - link to detail

### Contract Detail

Show:

1. Back link to Contracts.
2. Title.
3. Source path.
4. Status if parsed.
5. Read-only badge.
6. Full contract source in a safe text block.
7. Footer note: `Contract source is read-only in this UI. Amendments require repository review.`

Do not add edit buttons.

## Parsing And Safety Rules

1. Do not hallucinate contract metadata.
2. Do not inject raw markdown as HTML.
3. Do not use `dangerouslySetInnerHTML`.
4. Do not rewrite contract files.
5. Unknown contract slug returns `notFound()`.
6. File lookup must not accept arbitrary paths. Load the directory once and match by known slug.

## Hard Boundaries

1. No schema migrations.
2. No model calls.
3. No connector/OAuth work.
4. No contract editing.
5. No governance amendment workflow.
6. No runtime enforcement changes.
7. No history page implementation. That is Phase 3 T5.
8. No broad navigation redesign.

## Tests And Validation

Run from `app/`:

1. `pnpm copy:smoke`
2. `pnpm model:smoke`
3. `pnpm verify:supabase-project`
4. `pnpm typecheck`
5. `pnpm lint`
6. `pnpm exec supabase test db`

Run browser or curl smoke:

1. `/w/<slug>/contracts` renders 3 contracts for a signed-in user.
2. `/w/<slug>/contracts/trace-emitter-contract` opens detail.
3. Unknown contract route returns 404 for signed-in user.
4. Unauthenticated `/w/<slug>/contracts` redirects to `/signin`.
5. If Contracts nav item is added, active state works on list and detail.

No `supabase db reset` is required unless schema changes happen. No schema change is expected.

## Report Requirements

Write:

`docs/briefs/phase3_t4_contracts_viewer_report.md`

Report must include:

1. Completion status.
2. Files changed.
3. Routes added.
4. Contract count and source files.
5. Navigation decision.
6. Safety/rendering choices.
7. Browser/curl smoke results.
8. Validation output with exact pass lines.
9. Next recommended ticket: Phase 3 T5 History Page.

After writing the report, immediately read it back and echo:

1. line count
2. first 3 non-empty lines
3. final completion status line

## Stop Conditions

Stop and report blocked if:

1. Contract slugs cannot be made path-safe.
2. Contract source cannot be rendered safely without adding a markdown renderer dependency.
3. Adding Contracts to nav causes layout problems that require broad shell redesign.
4. The implementation starts turning into a contract editor or governance workflow.
