# Phase 4 T6 — Basic Usage Meter — Report

Date: 2026-05-24
Status: COMPLETE

## Summary

Added a basic, RLS-gated usage page that surfaces token/cost aggregates from
existing `workflow_runs` rows. No schema changes. No billing-grade claims. No
budget enforcement.

## Files Changed

- `app/src/app/w/[slug]/settings/usage/page.tsx` — NEW. RSC usage page.
- `app/src/app/w/[slug]/settings/page.tsx` — replaced the placeholder
  "Billing — Phase 4" tile with a live "Usage" tile that links to the new
  page and shows a quick recorded-run count.

## Route Added

- `/w/[slug]/settings/usage`

Linked from `/w/[slug]/settings` via the new Usage tile (replaces the prior
disabled Billing tile). Not added to the top-level workspace nav (per brief —
usage belongs under Settings for now).

## Data Queried

All reads use the cookie-session Supabase client (`createSupabaseServerClient`).
Service role is not used.

- `workspaces.select(id, name, slug).eq(slug)` — resolve workspace.
- `workflow_runs.select(id, ticket_id, run_kind, agent_id, model, input_tokens,
  output_tokens, cost_usd, status, started_at, ended_at)`
  `.eq(workspace_id).order(started_at desc).limit(100)` — recent runs slice.
- `tickets.select(id, title).in(id, …ticketIds)` — title backfill for the
  Ticket column. Only IDs already present in the visible runs slice are
  queried.
- Settings landing also runs `workflow_runs.select(id, head, count: exact)
  .eq(workspace_id)` to show a recorded-run count in the tile.

RLS policy `workflow_runs_member_select` (migration 0005) gates these reads
to workspace members.

## Aggregation Logic

Computed in-process over the latest-100 slice:

- `totalRuns` = slice length.
- `totalInputTokens`, `totalOutputTokens`, `totalTokens` = sums.
- `totalCost` = sum of `cost_usd` (Number-coerced; the DB column is
  `numeric(10,4)` which arrives as string via PostgREST).
- `latest` = `runs[0].started_at` (slice is `order started_at desc`).
- `byKind` = per-kind buckets for `orchestrator | coordinator | specialist |
  qa | truth`, each with `runs`, `tokens`, `cost`.

Caveat baked into the page copy: this is an aggregate over the latest 100
runs, not lifetime totals. Honestly labeled as such.

## UI Behavior

- Breadcrumb: workspace · Settings · Usage.
- Header subtitle: "Approximate workflow usage from recorded runs. Not
  billing-grade."
- Summary cards: total runs, total tokens, total cost, latest run.
- Runs-by-kind table: 5 fixed rows (orchestrator, coordinator, specialist, qa,
  truth) with run count, token sum, cost sum.
- Recent runs table: time, kind badge, agent, model, status badge, input
  tokens, output tokens, cost, ticket link.
- Empty state when there are no recorded runs.
- Footer caveat: "Operational visibility only — not billing, not a budget
  enforcement. Capped at latest 100 runs. RLS-gated session reads only —
  no service-role bypass."
- Unauthenticated visitors are redirected to `/signin` (auth.getUser check
  before any data read).

## Caveats and Non-Claims

- Not billing. Not invoicing. Not budget enforcement. Not an alerting system.
- Aggregates cover the latest 100 runs only; lifetime totals are not claimed.
- `cost_usd` reflects whatever the workflow runner recorded; we do not
  recompute or attest to its accuracy.
- No model is called by the page.
- No schema migration was added.
- No connector or external integration was touched.
- No service-role reads.

## Validation Output

All commands run from `app/`.

```
$ pnpm copy:smoke
…
copy-smoke: OK (25 checks)

$ pnpm model:smoke
…
model-smoke: OK (13 checks)

$ pnpm verify:supabase-project
verify-supabase-project: OK
  NEXT_PUBLIC_SUPABASE_URL = https://xmxozhibakbzsucvtucv.supabase.co
  Banned ref fwexgqktxdfiajpqlgvz not present.

$ pnpm typecheck
> tsc --noEmit
(no output → pass)

$ pnpm lint
> eslint
(no output → pass)

$ pnpm exec supabase test db
…
All tests successful.
Files=7, Tests=59
Result: PASS
```

## Operator Acceptance Notes

To smoke-test in a browser:

1. Sign in and open `/w/<slug>/settings`.
2. The Settings landing now shows a live "Usage" tile (replacing the prior
   disabled Billing placeholder). The tile reports the workspace's recorded
   run count.
3. Click the Usage tile → lands on `/w/<slug>/settings/usage`.
4. Confirm the four summary cards render (total runs / total tokens / total
   cost / latest run).
5. Confirm the "Runs by kind" table renders all five kinds; rows with zero
   runs simply show 0.
6. If the workspace has Phase 2 run records, confirm they appear in the
   recent-runs table with model, tokens, status, and cost columns visible.
7. Confirm the footer caveat is present and reads "not billing, not a
   budget enforcement."
8. Sign out and visit `/w/<slug>/settings/usage` directly → redirected to
   `/signin`.

`supabase db reset` is not required (no schema changes).

## Next Recommended Step

Phase 4 closeout acceptance — bundle T1–T6 into the Phase 4 acceptance
report and verify the gates listed in
`docs/briefs/phase4_failure_governance_claude_brief.md`.
