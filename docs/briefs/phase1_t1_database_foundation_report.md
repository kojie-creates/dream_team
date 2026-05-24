# Phase 1 T1 — Database Foundation Report

**Date:** 2026-05-24
**Scope:** Phase 1 workflow foundation schema + RLS (local only)
**Status:** complete

---

## 1. Completion status

`complete` — migration `0005_phase1_workflow_foundation.sql` written, RLS policies applied, two pgtap test files added, local `db reset` clean, `supabase test db` green (7 files / 57 tests), `pnpm typecheck` exit 0, `pnpm lint` exit 0.

No cloud migration applied. No UI files touched. No Anthropic/Edge/Storage/Realtime work.

## 2. Files changed

```
app/supabase/migrations/0005_phase1_workflow_foundation.sql                       (new, 187 lines)
app/supabase/tests/rls/briefs_tickets.test.sql                                    (new, 179 lines)
app/supabase/tests/rls/workflow_runs_traces_packets_artifacts.test.sql            (new, 178 lines)
docs/briefs/phase1_t1_database_foundation_report.md                               (this file)
```

No edits to prompt-library agents, app routes, components, or any other source.

## 3. Tables created

All six tables created in schema `public`, all carry `workspace_id uuid not null references public.workspaces(id) on delete cascade`.

| Table | Notes |
|---|---|
| `briefs` | source ∈ paste/file/generate/connector; parsed_status ∈ pending/ready/failed; `word_count >= 0` |
| `tickets` | status ∈ open/in_progress/done/failed/looped/needs_input; `wq_id` unique; `set_updated_at` trigger |
| `workflow_runs` | run_kind ∈ orchestrator/coordinator/specialist/qa/truth; status ∈ pending/running/done/failed; non-negative tokens + cost |
| `trace_events` | `bigserial` pk; unique `(ticket_id, seq)`; `seq > 0`; append-only (no update/delete policy) |
| `packets` | packet_type ∈ handoff/failure/trace/truth/artifact; nullable `trace_event_id` on delete set null |
| `artifacts` | kind ∈ markdown/file/bundle/json; storage bucket integration deferred |

### Indexes

```
briefs_workspace_created_idx           (workspace_id, created_at desc)
tickets_workspace_status_updated_idx   (workspace_id, status, updated_at desc)
tickets_workspace_current_agent_idx    (workspace_id, current_agent)
workflow_runs_ticket_started_idx       (ticket_id, started_at)
trace_events_ticket_seq_idx            (ticket_id, seq)
packets_ticket_type_idx                (ticket_id, packet_type)
artifacts_ticket_created_idx           (ticket_id, created_at desc)
```

### Triggers

`tickets_set_updated_at` (before update) reuses existing `public.set_updated_at()` from migration 0001.

## 4. Policies created

RLS enabled on all six new tables.

**SELECT (all six tables):** `*_member_select` — `using (public.is_workspace_member(workspace_id))`.

**INSERT (briefs, tickets only):**
- `briefs_member_insert` — `with check (created_by = auth.uid() and is_workspace_member(workspace_id))`
- `tickets_member_insert` — same shape

**workflow_runs / packets / artifacts:** no client insert/update/delete policy. Server / service-role writes only in Phase 1 (service role bypasses RLS by design).

**trace_events:** no client insert / update / delete policy (append-only invariant preserved).

## 5. Tests added

`app/supabase/tests/rls/briefs_tickets.test.sql` — pgtap, 10 assertions:
1. RLS enabled on briefs
2. RLS enabled on tickets
3. Member B reads ws_a brief
4. Member B reads ws_a ticket
5. Outsider C cannot read ws_a brief
6. Outsider C cannot read ws_a ticket
7. Member B inserts own brief into ws_a
8. Outsider C cannot insert brief into ws_a (42501)
9. Member B inserts own ticket into ws_a
10. Outsider C cannot insert ticket into ws_a (42501)

`app/supabase/tests/rls/workflow_runs_traces_packets_artifacts.test.sql` — pgtap, 15 assertions:
1–4. RLS enabled on workflow_runs / trace_events / packets / artifacts
5–8. Member B reads each of the four tables (1 row each)
9. Non-member C reads zero rows across all four tables (summed)
10. Authenticated direct insert into trace_events denied (42501)
11. Authenticated update of trace_events affects 0 rows
12. trace_events row unchanged after blocked update
13. Authenticated delete of trace_events affects 0 rows
14. trace_events row still present after blocked delete
15. Unique `(ticket_id, seq)` on trace_events enforced (23505)

Total new assertions: 25. Combined with prior 32 → 57 across 7 files.

## 6. Command outputs

### `pnpm verify:supabase-project`

```
> app@0.1.0 verify:supabase-project C:\Users\felix\Desktop\dream_team\app
> node scripts/verify-supabase-project.mjs

verify-supabase-project: OK
  NEXT_PUBLIC_SUPABASE_URL = https://xmxozhibakbzsucvtucv.supabase.co
  Banned ref fwexgqktxdfiajpqlgvz not present.
```

Note: `NEXT_PUBLIC_SUPABASE_URL` points to the cloud `dream-team-dev` project (xmxozhibakbzsucvtucv), as documented in the brief. All DB commands below target the local stack via the Supabase CLI (`config.toml`) and do not touch cloud. No `supabase db push` invoked.

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

### `pnpm exec supabase test db`

```
Connecting to local database...
/...tests/rls/anonymous.test.sql ............................... ok
/...tests/rls/briefs_tickets.test.sql .......................... ok
/...tests/rls/users_profile.test.sql ........................... ok
/...tests/rls/workflow_runs_traces_packets_artifacts.test.sql .. ok
/...tests/rls/workspace_invites.test.sql ....................... ok
/...tests/rls/workspace_members.test.sql ....................... ok
/...tests/rls/workspaces.test.sql .............................. ok
All tests successful.
Files=7, Tests=57,  0 wallclock secs ( 0.04 usr  0.00 sys +  0.04 cusr  0.04 csys =  0.12 CPU)
Result: PASS
```

### `pnpm typecheck`

```
> app@0.1.0 typecheck C:\Users\felix\Desktop\dream_team\app
> tsc --noEmit
```

(exit 0, no diagnostics.)

### `pnpm lint`

```
> app@0.1.0 lint C:\Users\felix\Desktop\dream_team\app
> eslint
```

(exit 0, no diagnostics.)

## 7. Deviations from brief

None material. Notes:

- Brief listed `wq_id text unique` on tickets; Postgres allows multiple NULLs under a UNIQUE constraint, so unset `wq_id` is permitted on new client inserts. Matches the existing legacy-id intent.
- Brief specified "every new table needs coverage" — packets, artifacts, workflow_runs are covered by read-side member/non-member assertions in the second test file. No write-path test for those three because the brief instructs not to add broad authenticated insert policies "unless tests prove the exact need," and the spec is that they are server/service-role only in Phase 1.
- Reused existing `public.set_updated_at()` (defined in 0001) for the new `tickets.updated_at` trigger rather than redefining.
- Did not add the workspaces FK to `briefs.workspace_id` as a separate name; the inline `references public.workspaces(id) on delete cascade` is sufficient.

## 8. Cloud migration applied

No. Cloud (`dream-team-dev` / xmxozhibakbzsucvtucv) was not touched. No `supabase db push`, no `apply_migration`. Brief explicitly forbids cloud apply without explicit ask.

## 9. UI confirmation

No UI files were edited. Only files modified: the new migration, the two new pgtap test files, and this report. Verified by file enumeration in §2.

## 10. Stop conditions

None triggered. Phase 0 RLS suites still green; no cloud command issued; no security decision left ambiguous; no UI/auth/route change needed.
