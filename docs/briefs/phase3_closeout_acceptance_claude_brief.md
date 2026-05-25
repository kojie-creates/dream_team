# CLAUDE BRIEF: Phase 3 Closeout Acceptance

Date: 2026-05-24
Repo: `C:\Users\felix\Desktop\dream_team`
App root: `C:\Users\felix\Desktop\dream_team\app`

## Purpose

Close Phase 3 honestly before Phase 4 begins.

Phase 3 added the workspace operating surface:

1. Navigation + route skeleton.
2. Agent Catalog.
3. Agent Detail.
4. Contracts Viewer.
5. History Page.
6. Settings Polish.

This is an acceptance/reporting pass. Do not add product features unless a small documentation correction is required to make the closeout truthful.

## Operating Mode

This is a closeout verification brief.

Work sequentially. After every file write, immediately read back enough of the changed file to prove it exists and contains the intended section. For the final markdown report, echo the first 3 non-empty lines and the line count.

Do not report completion until all validation gates have been run or honestly marked blocked.

## Source Files To Read First

Read these before editing:

1. `app/AGENTS.md`
2. `docs/briefs/phase3_workspace_operating_surface_claude_brief.md`
3. `docs/briefs/phase3_t1_navigation_route_skeleton_report.md`
4. `docs/briefs/phase3_t2_agent_catalog_report.md`
5. `docs/briefs/phase3_t3_agent_detail_report.md`
6. `docs/briefs/phase3_t4_contracts_viewer_report.md`
7. `docs/briefs/phase3_t5_history_page_report.md`
8. `docs/briefs/phase3_t6_settings_polish_report.md`
9. `docs/briefs/phase2_acceptance_report.md`
10. `app/src/components/workspace/WorkspaceNav.tsx`

After each file read, echo the first 3 non-empty lines.

Use `Get-Content -LiteralPath` for dynamic route paths with `[slug]`.

## Goal

Produce a Phase 3 acceptance report that answers:

1. What workspace surfaces work now?
2. What was verified by automated gates?
3. What did Felix verify manually in the browser?
4. What does Phase 3 explicitly not claim?
5. What should Phase 4 start with?

## Required Verification

Run these gates from `app/`:

1. `pnpm copy:smoke`
2. `pnpm model:smoke`
3. `pnpm verify:supabase-project`
4. `pnpm typecheck`
5. `pnpm lint`
6. `pnpm exec supabase test db`

Do not run `supabase db reset` unless a schema change exists. No schema change is expected in closeout.

## Manual / Operator Acceptance Script

Write an operator script inside the report for Felix to walk in the browser.

Minimum script:

1. Open `/w/<slug>`.
2. Confirm nav items: Home, Tickets, Agents, Contracts, History, Settings.
3. Open Tickets and one ticket detail.
4. Open Agents.
5. Open `central-orchestrator` detail.
6. Open one specialist detail.
7. Open Contracts.
8. Open `trace-emitter-contract`.
9. Open History and test one filter.
10. Click a history item that links to a ticket.
11. Open Settings.
12. Open Members.
13. Confirm no execution/edit/admin-destructive controls appear outside the existing invite form.

Do not claim this script was completed unless Felix explicitly reports it or reports per-ticket browser passes.

## Acceptance Evidence Already Reported

Felix already reported browser passes for:

1. T1 route/nav shell.
2. T2 Agent Catalog.
3. T3 Agent Detail.
4. T4 Contracts Viewer.
5. T5 History Page.
6. T6 Settings Polish.

Use those as operator evidence, but state that they came from Felix's browser walk reports, not from automated browser tooling.

## Acceptance Report

Write:

`docs/briefs/phase3_acceptance_report.md`

Report sections:

1. Completion status.
2. Phase 3 scope recap.
3. T1-T6 summary table.
4. Automated gates and exact pass lines.
5. Operator browser acceptance summary.
6. Route inventory.
7. Claims Phase 3 supports.
8. Claims Phase 3 does not support.
9. Known caveats.
10. Recommended next step: Phase 4 T1 Failure Packet UI.

After writing the report, immediately read it back and echo:

1. line count
2. first 3 non-empty lines
3. final completion status line

## Claims Phase 3 May Support

Use careful wording:

1. `Dream Team has a navigable workspace shell.`
2. `Agents are browsable from checked-in source files.`
3. `Agent detail pages show read-only prompt source.`
4. `Contracts are viewable from checked-in contract files.`
5. `History shows recent workspace activity from existing RLS-gated tables.`
6. `Settings shows workspace/member/invite state with honest caveats.`

## Claims Phase 3 Must Not Make

Do not claim:

1. Agent execution from catalog/detail pages.
2. Prompt editing.
3. Contract editing or governance amendment workflow.
4. Production email delivery.
5. Billing or token-budget enforcement.
6. Connector/OAuth support.
7. Failure inspector or retry/resolution workflows.
8. Playwright/e2e automated coverage unless actually added.

## Hard Boundaries

1. Do not add features during closeout.
2. Do not introduce schema migrations during closeout.
3. Do not mutate tickets, briefs, members, or invites.
4. Do not print API keys.
5. Do not overstate manual acceptance.

## Stop Conditions

Stop and report blocked if:

1. Automated gates fail and the failure is not clearly unrelated.
2. Reports contradict code behavior.
3. Phase 3 claims cannot be supported by current evidence.
4. There are uncommitted code changes unrelated to closeout.
