# Phase 1 T3 — Orchestrator Stub Round-Trip Report

**Date:** 2026-05-24
**Scope:** Deterministic Orchestrator stub for an open ticket: one `workflow_runs`, one `trace_events`, one `packets`, ticket → `done`. No model call.
**Status:** complete (with one operator-action item: interactive logged-in cloud smoke against `dream-team-dev`).

---

## 1. Completion status

`complete` for the build artifact and all automatable validation gates. Server-only service-role helper added; server action implements the round-trip; ticket detail page renders trace events + packets and exposes the Run button only when the ticket is `open`. Local gates all green:

- `verify:supabase-project` OK
- `typecheck` exit 0
- `lint` exit 0
- `supabase db reset` clean (migrations 0001–0005, unchanged)
- `supabase test db` 7 files / 57 tests PASS (no test set was added — existing RLS suite still covers the read-side; service-role inserts bypass RLS by design)

Interactive logged-in cloud smoke is pending Felix at the keyboard — repro in §6.

## 2. Files changed

New:
```
app/src/lib/supabase/service.ts                                     (18 lines)
app/src/app/actions/orchestration.ts                                (~140 lines)
app/src/components/tickets/RunOrchestratorStubButton.tsx            (46 lines)
docs/briefs/phase1_t3_orchestrator_stub_report.md                   (this file)
```

Modified:
```
app/src/app/w/[slug]/tickets/[ticketId]/page.tsx                    (now ~206 lines — added trace + packets render, Run button slot)
```

No schema migration. No tests added (no app-level test framework yet; pgtap unchanged). No edits to prompt-library agents, contracts, RPCs, auth/middleware, or briefs action.

## 3. Routes / actions added or changed

| Surface | Type | Notes |
|---|---|---|
| `runOrchestratorStub` | Server Action (`'use server'`) | New. Lives in `app/src/app/actions/orchestration.ts`. Auths user, RLS-resolves workspace by slug + ticket by id, then performs service-role writes. |
| `/w/[slug]/tickets/[ticketId]` | RSC page | Now reads `trace_events` + `packets` for the ticket and renders them. Shows "Run Orchestrator stub" only when ticket status is `open`. Honest copy retained: "Deterministic stub — no model call." |

No new route handler. No new middleware. No edit to `/w/[slug]/new/paste`.

## 4. Service-role helper

Added `app/src/lib/supabase/service.ts`. Single export `createSupabaseServiceRoleClient()` returning a cached `SupabaseClient` built from `env.NEXT_PUBLIC_SUPABASE_URL` + `env.SUPABASE_SERVICE_ROLE_KEY` with `persistSession: false`, `autoRefreshToken: false`.

File header is an explicit `SERVER-ONLY. Never import from a client component.` warning followed by the rule that callers must perform an RLS-gated authorization check via `createSupabaseServerClient()` first.

**Why no `import 'server-only'`:** the `server-only` package is not in the lockfile. Brief explicitly says "if not installed/available, stop and report before adding a package unless trivial and standard in Next." I chose not to add it in this ticket to keep the dependency surface stable; the comment + module placement under `src/lib/supabase/` (a server-imports-only path) + only-callsite being `app/src/app/actions/orchestration.ts` (a `'use server'` module) makes accidental client bundling implausible. Recommend a one-line follow-up to add `server-only` so the build fails loudly if the rule is ever broken.

`SUPABASE_SERVICE_ROLE_KEY` is read via `env.ts` (Zod-validated, server schema only — already gated). No client component imports the helper.

## 5. Exact writes performed by the stub

When invoked on an `open` ticket where no prior stub trace exists, per click:

1. `public.workflow_runs` — one row:
   - `workspace_id` = resolved workspace id
   - `ticket_id` = the ticket id
   - `run_kind = 'orchestrator'`
   - `agent_id = 'central-orchestrator'`
   - `model = 'stub'`
   - `input_tokens = 0`, `output_tokens = 0`, `cost_usd = 0`
   - `started_at = now()` (ISO), `ended_at = now()` (same value)
   - `status = 'done'`
2. `public.trace_events` — one row:
   - `workspace_id`, `ticket_id`
   - `seq = coalesce(max(seq) for ticket, 0) + 1`
   - `from_agent = 'user'`, `to_agent = 'central-orchestrator'`
   - `event_type = 'orchestrator_stub.classified'`
   - `payload =` `{ stub: true, classification: 'build', verdict: 'ready_for_coordinator_stub', reason: 'Deterministic Phase 1 stub; no model call performed.' }`
3. `public.packets` — one row:
   - `workspace_id`, `ticket_id`, `trace_event_id` = id of the trace row above
   - `packet_type = 'handoff'`
   - `body_raw` = multi-line plain text labeled `STUB HANDOFF PACKET` with from/to/classification/verdict/note fields; the note explicitly says "Deterministic Phase 1 stub; no model call performed."
   - `body_parsed` = `{ ...stubPayload, from: 'user', to: 'central-orchestrator', packet_kind: 'handoff' }`
4. `public.tickets` — update (always runs, even on the idempotent path):
   - `status = 'done'`
   - `layer = 'build'`
   - `current_agent = 'central-orchestrator'`
   - `updated_at` flipped by the existing `tickets_set_updated_at` trigger.

`revalidatePath('/w/[slug]/tickets/[ticketId]')` then `redirect()` back to the detail page.

## 6. Idempotence behavior

Chosen: **query-before-insert by `event_type`.** Before any service-role insert, the action does:

```ts
service
  .from('trace_events')
  .select('id')
  .eq('ticket_id', ticket.id)
  .eq('event_type', 'orchestrator_stub.classified')
  .limit(1)
  .maybeSingle();
```

If a row exists, the action skips the three inserts entirely and proceeds only to re-affirm `tickets.status='done'`, `layer='build'`, `current_agent='central-orchestrator'`. Re-clicking Run cannot duplicate the workflow_run, trace_event, or packet rows.

In practice the Run button is also hidden once `ticket.status !== 'open'`, so the user surface doesn't expose the second click in the first place. The server-side guard above remains the source of truth — a hand-crafted form POST would still be idempotent.

Caveat: no DB-level unique constraint enforces this — the guard is purely application-level. Adding a partial unique index `(ticket_id) where event_type = 'orchestrator_stub.classified'` would harden it but requires a migration, which is out of scope for T3.

## 7. Authorization order (security)

The action enforces this exact order:

1. `createSupabaseServerClient()` (anon/session cookie). `auth.getUser()` → redirect to `/signin` if no user.
2. `workspaces.select().eq('slug', slug).maybeSingle()` — RLS-gated. Returns `null` if the user is not a member (RLS hides the row).
3. `tickets.select().eq('id', ticketId).eq('workspace_id', workspace.id).maybeSingle()` — RLS-gated. Returns `null` if not a member or wrong workspace.
4. **Only after both reads succeed** is `createSupabaseServiceRoleClient()` instantiated and used for the writes + max-seq read.

If either RLS read fails, the action returns an error state without touching service-role. `SUPABASE_SERVICE_ROLE_KEY` is never read in a client bundle (it's not in the `clientSchema` in `src/env.ts`, and the helper is not imported from any client component).

## 8. Validation command outputs

### `pnpm verify:supabase-project`
```
verify-supabase-project: OK
  NEXT_PUBLIC_SUPABASE_URL = https://xmxozhibakbzsucvtucv.supabase.co
  Banned ref fwexgqktxdfiajpqlgvz not present.
```

### `pnpm typecheck`
```
> tsc --noEmit
```
(exit 0, no diagnostics)

### `pnpm lint`
```
> eslint
```
(exit 0, no diagnostics)

### `pnpm exec supabase db reset`
```
Applying migration 0001_phase0_foundation.sql...
Applying migration 0002_phase0_rls.sql...
Applying migration 0003_phase0_workspace_create_rpc.sql...
Applying migration 0004_phase0_invite_create_rpc.sql...
Applying migration 0005_phase1_workflow_foundation.sql...
Seeding data from supabase/seed.sql...
Restarting containers...
Finished supabase db reset on branch main.
```

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
Files=7, Tests=57,  Result: PASS
```

## 9. Browser/cloud smoke summary

**Automated (this session):** none beyond build gates. The new server action requires an authenticated cookie session against `dream-team-dev`, which is not safely scriptable from this shell.

**Interactive (operator-driven, pending) — repro:**

1. `pnpm dev` → `http://localhost:3000`, sign in as the smoke user.
2. Open an existing **Open** ticket (or create one via `Paste a brief`).
3. Detail page renders new `Orchestrator (Phase 1 stub)` panel above the brief.
4. Click **Run Orchestrator stub**. Button shows `Running stub…`, then the page re-renders.
5. Confirm:
   - Status pill now **Done** (`bg-emerald-950`).
   - Header shows `Layer: build` and `Agent: central-orchestrator`.
   - The Run panel is gone (status is no longer `open`).
   - **Trace** section now lists one event: `#1 orchestrator_stub.classified` from `user → central-orchestrator`, summary `classification: build · verdict: ready_for_coordinator_stub · reason: Deterministic Phase 1 stub; no model call performed.`
   - Under that event, one nested item: `packet:handoff` with the same summary fields.
6. Click the browser back arrow, re-open the ticket: state persists from DB (no localStorage).
7. (Optional) Manually POST the action again (e.g., via DevTools) to confirm no duplicate trace rows.

## 10. Database readback summary

Run from the Supabase dashboard SQL editor (or `psql` with service-role connection) after step 5 above:

```sql
-- The ticket and its generated rows
select
  t.id as ticket_id, t.status, t.layer, t.current_agent, t.updated_at,
  (select count(*) from public.workflow_runs where ticket_id = t.id) as runs,
  (select count(*) from public.trace_events where ticket_id = t.id) as events,
  (select count(*) from public.packets where ticket_id = t.id) as packets
  from public.tickets t
 where t.id = '<ticket uuid from URL>';

-- The stub event payload
select seq, from_agent, to_agent, event_type, payload
  from public.trace_events
 where ticket_id = '<ticket uuid>'
 order by seq;

-- The handoff packet
select packet_type, trace_event_id, body_parsed
  from public.packets
 where ticket_id = '<ticket uuid>';
```

Expected post-first-click: `runs=1`, `events=1`, `packets=1`, `status='done'`, `layer='build'`, `current_agent='central-orchestrator'`. After any number of additional Run clicks: counts unchanged.

## 11. No schema migration

Confirmed. `app/supabase/migrations/` contents unchanged from T1/T2:
```
0001_phase0_foundation.sql
0002_phase0_rls.sql
0003_phase0_workspace_create_rpc.sql
0004_phase0_invite_create_rpc.sql
0005_phase1_workflow_foundation.sql
```

## 12. No model API was called

Confirmed. No `@anthropic-ai/sdk` import, no `fetch` to `api.anthropic.com`, no environment variable for an Anthropic key was added or read. The stub is a deterministic write path with `model: 'stub'` recorded in `workflow_runs.model`.

## 13. Known caveats

- **Idempotence is app-level only.** A partial unique index (`(ticket_id) where event_type='orchestrator_stub.classified'`) would belt-and-braces this; deferred because it requires a migration.
- **No `server-only` package.** Service-role helper is fenced by convention + comments. Recommended one-line follow-up: `pnpm add server-only` and add `import 'server-only';` at the top of `service.ts` so accidental client imports become a build failure.
- **`workflow_runs` lacks an `agent_id`/`run_kind`/`ticket_id` unique constraint for stub idempotence.** Same reasoning as above — app-level guard via the `trace_events` query suffices.
- **Trace UI is intentionally plain.** No expandable JSON viewer, no diff visualization. T3 brief says operator surface, not marketing page; defer richer rendering until Phase 2 brings real traces.
- **No optimistic UI / live stream.** Clicking Run does a server action + `redirect()`. The page is fully refresh-driven for Phase 1, as the architecture brief intends.
- **`workflow_runs.started_at === ended_at`.** Stub does no real work; the equal timestamps are honest.

## 14. Next recommended ticket

**Phase 1 T4 — Home reads real recent work.** Replace the static empty panels on `/w/[slug]` with three RSC-rendered lists: recent briefs (last N from `briefs`), recent tickets (last N from `tickets` with status pill), and a small "workflow activity" strip (last N `trace_events` across the workspace). All reads are RLS-gated through the existing session client. No new writes, no migration, no service-role.
