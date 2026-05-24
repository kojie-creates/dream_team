# CLAUDE BRIEF: Phase 1 T6 Acceptance Pass

**Date:** 2026-05-24
**Repo:** C:\Users\felix\Desktop\dream_team
**App root:** C:\Users\felix\Desktop\dream_team\app

## Purpose

Close Phase 1. Walk the full loop end-to-end against `dream-team-dev` and prove the v1 path holds: sign-in → paste brief → ticket created → Orchestrator stub run → trace + packet visible → ticket list filter shows the result → Home counts increment. Produce a written acceptance report and a short, stakeholder-ready demo script.

This is a verification + documentation ticket. Do not add features, refactor, change schema, or touch model APIs.

## Current State

Phase 1 implementation complete across T1–T5:

- T1: schema (briefs, tickets, workflow_runs, trace_events, packets, artifacts) + RLS.
- T2: paste brief flow — `/w/[slug]/new/paste`, briefs + tickets insert, ticket detail page.
- T3: Orchestrator stub server action — workflow_runs + trace_events + packets rows, ticket → done.
- T4: workspace Home reads real briefs/tickets/workflow_runs + summary counts.
- T5: `/w/[slug]/tickets` list + status filter chips, ticket detail polish, shared `StatusPill`.

Gap T6 closes:

- Nothing has been driven end-to-end inside one session with documented evidence.
- No demo script exists for a stakeholder walkthrough.
- Cumulative caveats from T2/T3/T4/T5 have never been collated.

## Source Files To Read First

Read these before doing anything. After each read, echo path + first 3 non-empty lines.

- `app/AGENTS.md`
- `docs/design/dream_team_v1_architecture_brief.md`
- `docs/briefs/phase1_t1_db_foundation_report.md` (if present; skip if absent)
- `docs/briefs/phase1_t2_paste_brief_flow_report.md`
- `docs/briefs/phase1_t3_orchestrator_stub_report.md`
- `docs/briefs/phase1_t4_live_home_report.md`
- `docs/briefs/phase1_t5_ticket_surfaces_report.md`
- `app/src/app/w/[slug]/page.tsx`
- `app/src/app/w/[slug]/new/paste/page.tsx`
- `app/src/app/w/[slug]/tickets/page.tsx`
- `app/src/app/w/[slug]/tickets/[ticketId]/page.tsx`
- `app/src/app/actions/briefs.ts`
- `app/src/app/actions/orchestration.ts`
- `app/supabase/migrations/0005_phase1_workflow_foundation.sql`

## Hard Scope

In scope:

- Run all automatable validation gates (verify, typecheck, lint, db reset, db test). Capture exact outputs.
- Drive an interactive logged-in cloud smoke against `dream-team-dev` (operator at keyboard). Record screenshots or DB readback for each step.
- Run a database readback after the smoke (counts of briefs, tickets, workflow_runs, trace_events, packets for the smoke workspace).
- Produce two documents:
  - `docs/briefs/phase1_t6_acceptance_pass_report.md` — full acceptance evidence.
  - `docs/demo/phase1_demo_script.md` — short stakeholder walkthrough (~10 min, numbered steps with what to say).
- Collate cumulative known caveats from T2–T5 into one consolidated list with phase-2 implications.
- File any newly discovered bugs as numbered entries in the report (do not fix in this ticket).

Out of scope:

- No schema migration.
- No code changes. Pure verification + docs. If a blocking bug is found, stop and report — do not patch.
- No model API.
- No new server actions, routes, components, or dependencies.
- No connector work.
- No prompt-library or contracts edits.
- No CI changes.

## Acceptance Loop

Drive in this exact order against `dream-team-dev` from a fresh browser session:

1. **Sign-in** — visit `http://localhost:3000`, sign in as the smoke user. Land on `/w/<slug>` (or last workspace).
2. **Home snapshot (pre)** — record summary counts (Open tickets / Done tickets / Total briefs / Latest run status). Screenshot or note counts.
3. **Paste brief** — click `Paste a brief`. Submit ≥20 chars. Capture the redirect URL `/w/<slug>/tickets/<uuid>`.
4. **Ticket detail (pre-stub)** — confirm:
   - Status pill = Open.
   - Breadcrumb `<workspace> · Tickets · Ticket` (Tickets link works).
   - `From brief · paste · N words · <date>` line below title.
   - Source brief panel shows pasted text.
   - Trace section says "Trace events will appear after the Orchestrator runs."
   - `Orchestrator (Phase 1 stub)` panel with Run button visible.
5. **Run stub** — click `Run Orchestrator stub`. Page re-renders.
6. **Ticket detail (post-stub)** — confirm:
   - Status pill = Done.
   - Header shows `Layer: build`, `Agent: central-orchestrator`.
   - Run panel gone.
   - Trace lists one event `#1 orchestrator_stub.classified` (`user → central-orchestrator`), summary line with classification/verdict/reason.
   - Nested `packet:handoff` under the event with same summary.
7. **Idempotence probe (optional)** — refresh the page. Confirm no duplicate trace events.
8. **Ticket list** — click `← Back to tickets`. Confirm:
   - On `/w/<slug>/tickets`.
   - Just-created ticket appears at top with `Done` pill.
   - Filter chip counts include the new ticket.
9. **Status filter** — click `Done`. URL becomes `?status=done`. Confirm ticket present.
10. **Click `Open`** — confirm ticket not in this filtered set.
11. **Back to home** — click `<workspace>` breadcrumb. Confirm:
    - Summary counts incremented (Done tickets +1, Total briefs +1, Latest run = `done`).
    - Recent briefs panel shows new brief.
    - Tickets panel shows new ticket.
    - Workflow runs panel shows new `orchestrator · central-orchestrator · stub` row with `Done` pill.
12. **Cross-link** — click `View all →` in tickets panel → lands on `/w/<slug>/tickets`. Click the run row in workflow runs panel → lands back on the same ticket detail.

If any step fails, halt the loop and capture the failure in the report. Do not attempt a fix in this ticket.

## Database Readback

After step 11, run the following from the Supabase dashboard SQL editor (or `psql` with service-role connection string):

```sql
-- Workspace-scoped counts
select
  (select count(*) from public.briefs        where workspace_id = '<workspace uuid>') as briefs,
  (select count(*) from public.tickets       where workspace_id = '<workspace uuid>') as tickets,
  (select count(*) from public.workflow_runs where workspace_id = '<workspace uuid>') as workflow_runs,
  (select count(*) from public.trace_events  where workspace_id = '<workspace uuid>') as trace_events,
  (select count(*) from public.packets       where workspace_id = '<workspace uuid>') as packets;

-- The newly created ticket and its rows
select t.id, t.status, t.layer, t.current_agent, t.brief_id,
       (select count(*) from public.workflow_runs where ticket_id = t.id) as runs,
       (select count(*) from public.trace_events  where ticket_id = t.id) as events,
       (select count(*) from public.packets       where ticket_id = t.id) as packets
  from public.tickets t
 where t.id = '<ticket uuid from URL>';

-- The stub trace event payload
select seq, from_agent, to_agent, event_type, payload
  from public.trace_events
 where ticket_id = '<ticket uuid>'
 order by seq;
```

Record exact returned values in the report.

## Unauth Probe

From a separate fresh browser (or `curl`), verify each of these returns `307 → /signin`:

- `GET /w/<slug>`
- `GET /w/<slug>/new/paste`
- `GET /w/<slug>/tickets`
- `GET /w/<slug>/tickets?status=done`
- `GET /w/<slug>/tickets/<uuid>`

Capture status lines.

## Demo Script Requirements

Write `docs/demo/phase1_demo_script.md`:

- Audience: a stakeholder unfamiliar with the codebase.
- Length: ~10 minutes of presenter time.
- Format: numbered steps. Each step has "what you click", "what they see", and "what to say" (≤2 sentences of narration).
- Cover: sign-in → paste → ticket detail → stub run → trace → list → filter → home counts → workflow-run cross-link.
- Honesty: every "what to say" line must match Phase 1 reality. No claims about real model orchestration, no implications that the trace shows agent reasoning. The script must say the stub is deterministic.
- End with a "What's next" slide-equivalent (2–3 sentences) pointing at Phase 2.

## Validation Requirements

Run, in order, and capture exact outputs:

- `pnpm verify:supabase-project`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm exec supabase db reset`
- `pnpm exec supabase test db`

These should all be green (no code changed). If any fails, halt and report — likely indicates a regression introduced outside this ticket.

## Required Readback After Each Write

After writing each report/demo file, echo:

- Path
- Line count
- First 3 non-empty lines

## Expected Files

To create:

- `docs/briefs/phase1_t6_acceptance_pass_report.md`
- `docs/demo/phase1_demo_script.md`

To modify: none. If you find yourself editing app code, stop and report.

## Stop Conditions

Stop and report if:

- Any validation gate fails.
- Any acceptance loop step fails or behaves differently than described.
- Database readback shows row counts that don't match the UI.
- An RLS hole is observed (a workspace member sees rows from another workspace).
- An unauth probe returns 200 instead of 307.
- You feel the urge to edit code — file the bug in the report instead.

## Final Report Must Include

`docs/briefs/phase1_t6_acceptance_pass_report.md`:

- Completion status: pass, pass-with-caveats, or blocked.
- Validation command outputs (verify, typecheck, lint, db reset, db test).
- Acceptance loop results — one row per numbered step with pass/fail + evidence (screenshot path, URL, or observed text).
- Database readback values from §"Database Readback".
- Unauth probe status lines.
- Consolidated known-caveats list rolled up from T2–T5 reports, grouped by theme (security, idempotence, scaling, UX, tooling).
- Phase 2 implications for each caveat (which must be addressed before real orchestration, which can wait).
- Any newly discovered bugs as numbered entries (title, repro, expected vs actual, severity).
- Confirmation that no app code, schema, or dependency changed.
- Sign-off line: "Phase 1 acceptance: PASS / PASS-WITH-CAVEATS / BLOCKED" with date and operator initial.

## Next Ticket After This

**Phase 2 T1 — Orchestrator real model call.** Replace the deterministic stub in `app/src/app/actions/orchestration.ts` with an Anthropic API call (Claude Opus 4.7) that classifies the brief into a layer and emits a real handoff packet. Adds `@anthropic-ai/sdk` dependency, `ANTHROPIC_API_KEY` env entry, server-only call site, cost+token capture into `workflow_runs`, and a failure path that marks the ticket `failed` with `failure_type` set. No coordinator/specialist routing yet — that lands in Phase 2 T2.
