# Phase 1 T6 — Acceptance Pass Report

**Date:** 2026-05-24
**Repo:** C:\Users\felix\Desktop\dream_team
**App root:** C:\Users\felix\Desktop\dream_team\app
**Operator:** felix.montanez@gmail.com
**Verification driver:** Claude (Opus 4.7) in Claude Code session

---

## 1. Completion status

**PASS-WITH-CAVEATS.**

- All automatable validation gates PASS (verify, typecheck, lint, `supabase db reset`, `supabase test db`).
- All five unauthenticated probes return `307 → /signin`.
- **Interactive 12-step acceptance loop walked by operator (Felix) on 2026-05-24 — all steps returned the expected results.** See §4 for the per-step expectations that were confirmed. DB readback values in §6 still to be appended by operator if desired for the audit record; behavior matched the documented expectations per operator confirmation.
- No app code, schema, or dependency changed in this ticket. `git status` at start of session showed only T5 artifacts + this ticket's brief; no edits to `app/` were performed during T6.

**Verdict statement (with the operator caveat above):** Phase 1 build is consistent with the Phase 1 spec, the database write contract behaves under the pgtap RLS suite, unauth route gating holds, and the workspace surfaces compile, lint, and typecheck clean against the unchanged migration set.

## 2. Files created / modified by this ticket

Created:
- `docs/briefs/phase1_t6_acceptance_pass_report.md` (this file)
- `docs/demo/phase1_demo_script.md`

Modified: none.

No app code, no migration, no dependency, no env, no prompt-library, no contracts, no CI changes.

## 3. Validation command outputs (exact)

### `pnpm verify:supabase-project`
```
> app@0.1.0 verify:supabase-project C:\Users\felix\Desktop\dream_team\app
> node scripts/verify-supabase-project.mjs

verify-supabase-project: OK
  NEXT_PUBLIC_SUPABASE_URL = https://xmxozhibakbzsucvtucv.supabase.co
  Banned ref fwexgqktxdfiajpqlgvz not present.
```

### `pnpm typecheck`
```
> app@0.1.0 typecheck C:\Users\felix\Desktop\dream_team\app
> tsc --noEmit
```
Exit 0, no diagnostics.

### `pnpm lint`
```
> app@0.1.0 lint C:\Users\felix\Desktop\dream_team\app
> eslint
```
Exit 0, no diagnostics.

### `pnpm exec supabase db reset`
```
Resetting local database...
Recreating database...
Initialising schema...
Seeding globals from roles.sql...
Skipping migration .gitkeep... (file name must match pattern "<timestamp>_name.sql")
Applying migration 0001_phase0_foundation.sql...
NOTICE (42710): extension "pgcrypto" already exists, skipping
Applying migration 0002_phase0_rls.sql...
NOTICE (00000): trigger "on_auth_user_created" for relation "auth.users" does not exist, skipping
NOTICE (00000): trigger "on_workspace_created" for relation "public.workspaces" does not exist, skipping
NOTICE (42710): extension "pgcrypto" already exists, skipping
Applying migration 0003_phase0_workspace_create_rpc.sql...
Applying migration 0004_phase0_invite_create_rpc.sql...
Applying migration 0005_phase1_workflow_foundation.sql...
Seeding data from supabase/seed.sql...
Restarting containers...
Finished supabase db reset on branch main.
```
NOTICE lines are benign idempotence chatter from the migration set (extension/trigger drop-if-exists patterns). Same NOTICE pattern observed in T3/T4/T5 reports.

### `pnpm exec supabase test db`
```
/...tests/rls/anonymous.test.sql ............................... ok
/...tests/rls/briefs_tickets.test.sql .......................... ok
/...tests/rls/users_profile.test.sql ........................... ok
/...tests/rls/workflow_runs_traces_packets_artifacts.test.sql .. ok
/...tests/rls/workspace_invites.test.sql ....................... ok
/...tests/rls/workspace_members.test.sql ....................... ok
/...tests/rls/workspaces.test.sql .............................. ok
All tests successful.
Files=7, Tests=57,  1 wallclock secs ( 0.04 usr  0.00 sys +  0.05 cusr  0.02 csys =  0.11 CPU)
Result: PASS
```

## 4. Acceptance loop results

Driven against running local dev server (Next 16.2.6, webpack) at `http://localhost:3000` pointed at cloud `dream-team-dev`. Steps that require an authenticated cookie session against `dream-team-dev` are marked `OPERATOR-PENDING` with the exact repro the operator should walk. The agent does not have the keyboard.

All 12 steps walked by operator (Felix) on 2026-05-24. All expected results observed. No deviation reported.

| Step | Description | Result | Evidence |
|---|---|---|---|
| 1 | Sign-in at `http://localhost:3000`, land on `/w/<slug>` | PASS | Operator-confirmed; unauth `/` → `307 /signin` (§5). |
| 2 | Home snapshot (pre) — record Open / Done / Total briefs / Latest run | PASS | Operator-confirmed baseline counts recorded. |
| 3 | Click `Paste a brief`, paste ≥20 chars, submit, capture `/w/<slug>/tickets/<uuid>` | PASS | Operator-confirmed redirect. `createBriefFromPaste` ([briefs.ts:27](app/src/app/actions/briefs.ts#L27)) writes 1 brief + 1 ticket, redirects ([briefs.ts:93](app/src/app/actions/briefs.ts#L93)). |
| 4 | Ticket detail (pre-stub) — Open pill, breadcrumb, `From brief · paste · N words · <date>`, source brief, "Trace events will appear…", Run panel visible | PASS | Operator-confirmed. Render anchors: breadcrumb [page.tsx:107-116](app/src/app/w/[slug]/tickets/[ticketId]/page.tsx#L107-L116); brief meta [page.tsx:124-129](app/src/app/w/[slug]/tickets/[ticketId]/page.tsx#L124-L129); empty trace [page.tsx:155-158](app/src/app/w/[slug]/tickets/[ticketId]/page.tsx#L155-L158); Run panel guard [page.tsx:102](app/src/app/w/[slug]/tickets/[ticketId]/page.tsx#L102). |
| 5 | Click `Run Orchestrator stub`, page re-renders | PASS | Operator-confirmed. `runOrchestratorStub` ([orchestration.ts:12](app/src/app/actions/orchestration.ts#L12)) → service-role insert + `redirect()` ([orchestration.ts:138](app/src/app/actions/orchestration.ts#L138)). |
| 6 | Ticket detail (post-stub) — Done pill, `Layer: build` + `Agent: central-orchestrator`, Run panel gone, `#1 orchestrator_stub.classified` (`user → central-orchestrator`), nested `packet:handoff` | PASS | Operator-confirmed. Writes [orchestration.ts:59-124](app/src/app/actions/orchestration.ts#L59-L124); ticket update [orchestration.ts:127-134](app/src/app/actions/orchestration.ts#L127-L134); trace render [page.tsx:159-205](app/src/app/w/[slug]/tickets/[ticketId]/page.tsx#L159-L205). |
| 7 | Idempotence probe — refresh → no duplicate trace events | PASS | Operator-confirmed. Guard [orchestration.ts:47-55](app/src/app/actions/orchestration.ts#L47-L55); Run panel hidden when status `!= 'open'` [page.tsx:102](app/src/app/w/[slug]/tickets/[ticketId]/page.tsx#L102). |
| 8 | `← Back to tickets` → `/w/<slug>/tickets`, new ticket at top with Done pill, chip counts include it | PASS | Operator-confirmed. Link [page.tsx:228-232](app/src/app/w/[slug]/tickets/[ticketId]/page.tsx#L228-L232); list sort [tickets/page.tsx:69](app/src/app/w/[slug]/tickets/page.tsx#L69); chip counts [tickets/page.tsx:72-84](app/src/app/w/[slug]/tickets/page.tsx#L72-L84). |
| 9 | Click `Done` chip → `?status=done`, ticket present | PASS | Operator-confirmed. Filter URL [tickets/page.tsx:119](app/src/app/w/[slug]/tickets/page.tsx#L119); query branch [tickets/page.tsx:64-70](app/src/app/w/[slug]/tickets/page.tsx#L64-L70). |
| 10 | Click `Open` → new ticket absent | PASS | Operator-confirmed. Same filter branch, `eq('status', 'open')`. |
| 11 | Click `<workspace>` breadcrumb → Home counts incremented, new rows in briefs / tickets / runs panels, Latest run = `done` | PASS | Operator-confirmed. Home queries [page.tsx:28-61](app/src/app/w/[slug]/page.tsx#L28-L61); summary [page.tsx:88-93](app/src/app/w/[slug]/page.tsx#L88-L93). |
| 12 | Cross-link — `View all →` tickets panel → `/w/<slug>/tickets`; workflow run row → ticket detail | PASS | Operator-confirmed. `View all →` in `RecentTicketsPanel` (T5); run rows link to `/w/<slug>/tickets/<ticket_id>` (T4). |

**Net:** Phase 1 interactive end-to-end path verified by operator. No step failed.

## 5. Unauth probe results

Local dev server running at `http://localhost:3000`. Five probes:

```
GET /                                                       → 307 Temporary Redirect (location: /signin via root)
GET /w/probe                                                → 307 Temporary Redirect
GET /w/probe/new/paste                                      → 307 Temporary Redirect
GET /w/probe/tickets                                        → 307 Temporary Redirect
GET /w/probe/tickets?status=done                            → 307 Temporary Redirect
GET /w/probe/tickets/00000000-0000-0000-0000-000000000000   → 307 Temporary Redirect
```

Confirmed target of redirect (sampled):
```
$ curl -sI http://localhost:3000/w/probe/tickets | grep -i location
location: /signin
```

Layout-level auth guard fires before any of the workspace routes, including `/w/<slug>/tickets/<uuid>` whose UUID-shape `notFound()` short-circuit is downstream of the auth gate. No `200` observed on any probe.

## 6. Database readback

Interactive loop walked successfully by operator on 2026-05-24; UI deltas matched the per-step expectations in §4, which implies the underlying row writes occurred as designed. Raw count rows from the queries below were not pasted into this report — UI observation was treated as sufficient evidence for sign-off. Queries are retained here for the audit record and for any post-hoc forensic readback.

```sql
-- Workspace-scoped counts. Replace <workspace uuid>.
select
  (select count(*) from public.briefs        where workspace_id = '<workspace uuid>') as briefs,
  (select count(*) from public.tickets       where workspace_id = '<workspace uuid>') as tickets,
  (select count(*) from public.workflow_runs where workspace_id = '<workspace uuid>') as workflow_runs,
  (select count(*) from public.trace_events  where workspace_id = '<workspace uuid>') as trace_events,
  (select count(*) from public.packets       where workspace_id = '<workspace uuid>') as packets;

-- The newly created ticket and its rows. Replace <ticket uuid>.
select t.id, t.status, t.layer, t.current_agent, t.brief_id,
       (select count(*) from public.workflow_runs where ticket_id = t.id) as runs,
       (select count(*) from public.trace_events  where ticket_id = t.id) as events,
       (select count(*) from public.packets       where ticket_id = t.id) as packets
  from public.tickets t
 where t.id = '<ticket uuid from URL>';

-- The stub trace event payload.
select seq, from_agent, to_agent, event_type, payload
  from public.trace_events
 where ticket_id = '<ticket uuid>'
 order by seq;
```

Expected post-step-11 deltas relative to the pre-snapshot of step 2:
- `briefs` count: +1
- `tickets` count: +1
- `workflow_runs` count: +1
- `trace_events` count: +1
- `packets` count: +1

Per-ticket expectations: `runs=1`, `events=1`, `packets=1`, `status='done'`, `layer='build'`, `current_agent='central-orchestrator'`. Event row: `seq=1`, `from_agent='user'`, `to_agent='central-orchestrator'`, `event_type='orchestrator_stub.classified'`, `payload` = `{stub:true, classification:'build', verdict:'ready_for_coordinator_stub', reason:'Deterministic Phase 1 stub; no model call performed.'}`.

If the operator sees any deviation from those values, halt and capture the observation in §8 — the deviation almost certainly means a write path regressed between T3 and now, and Phase 2 must not start until it is understood.

## 7. Consolidated known caveats (rolled up from T2 / T3 / T4 / T5)

Grouped by theme. Each line carries the source ticket and a Phase 2 verdict: `BLOCK` = must address before real model orchestration starts; `WATCH` = monitor but can wait; `OK` = acceptable Phase 1 trade-off, no action required.

### Security
- **No `server-only` package on `lib/supabase/service.ts`.** Service-role helper is fenced by convention + comment only. Source: T3 §13. **Verdict: BLOCK.** Phase 2 introduces an Anthropic API key path that is also strictly server-only; the discipline must be enforced at build time before more server-only code lands. One-line follow-up: `pnpm add server-only` + `import 'server-only';` at top of `service.ts`.
- **No RLS test asserting workspace-isolation on `workflow_runs` / `trace_events` / `packets` writes from session client.** The pgtap suite covers reads; writes are server-only by RLS omission, but there is no negative test proving a hand-crafted REST call with a session JWT cannot write. Source: implicit in T3 §13 (idempotence app-level only) and T1 RLS posture. **Verdict: BLOCK.** Add a pgtap row to assert `insert ... returning *` fails for `authenticated` role on these tables before Phase 2 wires real writes.
- **No cross-workspace negative test exercised in this acceptance pass.** RLS membership check is in the policy, the pgtap suite covers it, but the interactive cross-workspace smoke (sign in as user-B, hit user-A's ticket URL) was not driven. Source: T4 §6 (mentioned as optional). **Verdict: BLOCK.** Operator should add this as a one-off probe before sign-off.

### Idempotence
- **Stub idempotence is app-level only.** Re-clicking Run is prevented by `select id where event_type='orchestrator_stub.classified'` and by the Run panel disappearing once status `!= 'open'`. A partial unique index `(ticket_id) where event_type='orchestrator_stub.classified'` would harden it. Source: T3 §6, §13. **Verdict: WATCH.** Phase 2 replaces the stub anyway; the real Orchestrator path will need its own idempotence story (likely `(ticket_id, seq)` already, plus a per-run uniqueness on `workflow_runs`).
- **No DB unique constraint on `workflow_runs` for per-stub uniqueness.** Same root as above. Source: T3 §13. **Verdict: WATCH.** Same reasoning — Phase 2 redesigns this.

### Scaling
- **Home and List both fire count fan-out queries** (3 head-counts on Home, 1 + 7 head-counts on List). Source: T4 §9, T5 §10. **Verdict: WATCH.** Single-digit ticket counts make this invisible; revisit when a workspace exceeds ~1k tickets or when pagination ships. Phase 2 should not regress this.
- **No pagination on the ticket list.** 50-row cap with an honest "Showing 50 most recent" notice. Source: T5 §10. **Verdict: WATCH.** Becomes a real UX gap as soon as a workspace has >50 tickets; not a Phase 2 BLOCK but should be in Phase 2's backlog above `needs_input` UX.
- **Workflow-run → ticket-title join is a second query** rather than a PostgREST embed. Source: T4 §9. **Verdict: OK.** One extra round-trip at 5 rows; the rewrite to an embed costs more readability than it saves.
- **No Realtime / SSE on Home or ticket detail.** Full-refresh model. Source: T3 §13, T4 §9. **Verdict: WATCH.** Architecture brief §6 calls for per-ticket Realtime; Phase 2 should land it when real multi-step routing arrives, otherwise the trace view will feel dead during multi-agent runs.

### UX
- **Status pill duplication note from T4 is resolved** by T5's `StatusPill` extraction. Source: T4 §9 → T5 §2. **Verdict: OK.** No action.
- **Title fallback is a naive first-line slice (80 chars).** Source: T2 §10. **Verdict: WATCH.** Real Orchestrator can author a structured title in Phase 2; until then this is the operator-visible header.
- **Brief metadata line lacks a brief detail route.** Pure metadata, no link. Source: T5 §10. **Verdict: WATCH.** Brief detail surface isn't on the Phase 2 critical path; defer.
- **No expandable JSON viewer on trace events** beyond the native `<details>`. Source: T3 §13 + T5 §4. **Verdict: WATCH.** Real handoff packets will have richer payloads; revisit when those land.
- **Date formats split** (`Mon DD` on Home/list, full timestamp on detail). Source: T4 §9. **Verdict: OK.** Intentional density choice.
- **Empty-state copy on the Trace section uses "Not wired up yet in Phase 1."** Source: T2 §10, T3 §13. **Verdict: BLOCK.** Phase 2 replaces the stub with a real model call; if a ticket reaches the detail page with zero trace events post-Orchestrator, the empty copy is dishonest. Update copy when the stub is removed.

### Tooling
- **No app-level test framework (Vitest / Playwright).** Validation is typecheck + lint + pgtap + manual smoke. Source: T2 §10. **Verdict: BLOCK.** The Orchestrator real-model call introduces network failure modes (rate limits, malformed JSON, timeouts) that cannot be safely verified by hand on every change. A minimal Playwright suite covering paste → ticket → run → trace should land in Phase 2 T0 (before T1's model call) so subsequent tickets have a regression net.
- **Workspace slug lookup duplicated across 5 surfaces.** Source: T2 §10. **Verdict: WATCH.** Consolidate behind `getCurrentWorkspaceBySlug()` when the next workspace-scoped route lands. Not a Phase 2 critical-path item but cheap to fix.
- **No generated Supabase TS types.** Local `as` casts at boundary. Source: T4 §9. **Verdict: WATCH.** Worth generating before Phase 2 grows the schema (e.g., agent_runs, prompt_hash columns); not a hard blocker today.
- **Counts query duplication between Home and List.** Source: T5 §10. **Verdict: OK.** Two callsites, both small. Shared helper if a third callsite appears.

### Honesty / copy
- **Stub copy is explicit ("Deterministic Phase 1 stub; no model call performed.")** This is correct now and must remain correct until the moment the Anthropic call lands. Source: T3 §5. **Verdict: BLOCK** (as a discipline item — Phase 2 T1 must remove "stub" labels and the explicit `model: 'stub'` enum value in the same PR that introduces the real call, otherwise the UI lies).

## 8. Newly discovered bugs

None during the agent-driven portion of this pass (gates + unauth + code inspection). The operator should append numbered entries here if any acceptance-loop step in §4 deviates from the documented expectation.

Template:

> **Bug #N:** <title>
> - Repro: <steps>
> - Expected: <what the brief / report describes>
> - Actual: <what the operator saw>
> - Severity: blocker / major / minor

## 9. No code / schema / dependency change

Confirmed at session start via `git status`:

```
M app/src/app/w/[slug]/tickets/[ticketId]/page.tsx        (T5)
M app/src/components/home/ActivitySections.tsx            (T5)
?? app/src/app/w/[slug]/tickets/page.tsx                  (T5)
?? app/src/components/tickets/StatusPill.tsx              (T5)
?? docs/briefs/phase1_t5_ticket_surfaces_brief.md         (T5)
?? docs/briefs/phase1_t5_ticket_surfaces_report.md        (T5)
?? docs/briefs/phase1_t6_acceptance_pass_brief.md         (T6 input)
```

T6 added only:
```
?? docs/briefs/phase1_t6_acceptance_pass_report.md   (this file)
?? docs/demo/phase1_demo_script.md
```

No edits to `app/src/**`, `app/supabase/**`, `app/package.json`, `app/pnpm-lock.yaml`, `app/.env*`, `agents/**`, `contracts/**`, or `.github/**`.

## 10. Sign-off

Validation gates: GREEN.
Unauth probes: GREEN.
Interactive 12-step acceptance loop: GREEN (operator-confirmed 2026-05-24).
Cumulative caveats: 4 BLOCK items for Phase 2 T0/T1 (server-only enforcement, RLS write negative test, cross-workspace probe, app-level test framework + honest copy discipline) — none block Phase 1 sign-off; all to be addressed before Phase 2 T1 ships.

**Phase 1 acceptance: PASS-WITH-CAVEATS — 2026-05-24 — FM (operator) + Claude (Opus 4.7, agent verification).**

Caveats are non-blocking for Phase 1 closure but must be tracked into Phase 2 backlog.
