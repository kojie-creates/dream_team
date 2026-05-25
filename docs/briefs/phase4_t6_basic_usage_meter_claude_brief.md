# CLAUDE BRIEF: Phase 4 T6 Basic Usage Meter

Date: 2026-05-24
Repo: `C:\Users\felix\Desktop\dream_team`
App root: `C:\Users\felix\Desktop\dream_team\app`

## Purpose

Add basic usage visibility from existing workflow run records.

Phase 2 records model/tokens/cost in `workflow_runs`. Phase 4 T6 should surface that information in the app so the user can inspect rough usage and cost. This is not billing-grade enforcement and not a payment system.

## Operating Mode

This is a single-ticket implementation brief.

Work sequentially. After every file write, immediately read back enough of the changed file to prove it exists and contains the intended section. For any markdown report, echo the first 3 non-empty lines and the line count.

Do not report completion until all validation gates have been run or honestly marked blocked.

## Source Files To Read First

Read these before editing:

1. `app/AGENTS.md`
2. `docs/briefs/phase4_failure_governance_claude_brief.md`
3. `docs/briefs/phase2_acceptance_report.md`
4. `docs/briefs/phase3_acceptance_report.md`
5. `app/src/app/w/[slug]/settings/page.tsx`
6. `app/src/app/w/[slug]/history/page.tsx`
7. `app/src/app/w/[slug]/page.tsx`
8. `app/supabase/migrations/0005_phase1_workflow_foundation.sql`

After each file read, echo the first 3 non-empty lines.

Use `Get-Content -LiteralPath` for dynamic route paths with `[slug]`.

## Goal

Show basic workspace usage from `workflow_runs`:

1. Total runs.
2. Runs by kind.
3. Total input tokens.
4. Total output tokens.
5. Total cost.
6. Recent runs table.

Label the feature as approximate operational usage, not billing.

## Route Decision

Preferred route:

`/w/[slug]/settings/usage`

Also add a card/link from `/w/[slug]/settings`.

Do not add a top-level nav item unless there is a strong reason. Usage belongs under Settings for now.

## Data Sources

Use only RLS-gated session reads.

Main table:

`workflow_runs`

Columns:

1. `id`
2. `ticket_id`
3. `run_kind`
4. `agent_id`
5. `model`
6. `input_tokens`
7. `output_tokens`
8. `cost_usd`
9. `status`
10. `started_at`
11. `ended_at`

Optional title backfill:

`tickets.id,title`

Do not use service-role.

## UI Expectations

Settings usage page:

1. Header:
   - breadcrumb back to Settings
   - title `Usage`
   - subtitle `Approximate workflow usage from recorded runs. Not billing-grade.`
2. Summary cards:
   - total runs
   - total tokens
   - total cost
   - latest run
3. Runs by kind:
   - orchestrator
   - coordinator
   - specialist
   - qa
   - truth
4. Recent runs table:
   - time
   - run kind
   - agent
   - model
   - status
   - tokens
   - cost
   - ticket link
5. Caveat:
   - `This is operational visibility, not billing or budget enforcement.`

Use a reasonable cap, such as latest 100 runs.

## Hard Boundaries

1. No schema migrations.
2. No billing/payment integration.
3. No budget enforcement.
4. No alerts.
5. No model calls.
6. No connector work.
7. No service-role reads.
8. Do not claim 1 percent billing accuracy unless implemented and verified.

## Tests And Validation

Run from `app/`:

1. `pnpm copy:smoke`
2. `pnpm model:smoke`
3. `pnpm verify:supabase-project`
4. `pnpm typecheck`
5. `pnpm lint`
6. `pnpm exec supabase test db`

Browser/operator smoke:

1. Open `/w/<slug>/settings`.
2. Click Usage.
3. Confirm usage page renders.
4. Confirm recent Phase 2 runs appear if workspace has run data.
5. Confirm costs/tokens are visible.
6. Confirm caveat says not billing-grade.
7. Confirm unauthenticated route redirects to `/signin`.

No `supabase db reset` is required unless schema changes happen.

## Report Requirements

Write:

`docs/briefs/phase4_t6_basic_usage_meter_report.md`

Report must include:

1. Completion status.
2. Files changed.
3. Route added.
4. Data queried.
5. Aggregation logic.
6. UI behavior.
7. Caveats and non-claims.
8. Validation output with exact pass lines.
9. Operator acceptance notes.
10. Next recommended step: Phase 4 closeout acceptance.

After writing the report, immediately read it back and echo:

1. line count
2. first 3 non-empty lines
3. final completion status line

## Stop Conditions

Stop and report blocked if:

1. Usage cannot be computed honestly from `workflow_runs`.
2. RLS-gated reads cannot access needed data.
3. The implementation starts turning into billing, enforcement, or payments.
4. The page needs schema changes to avoid misleading totals.
