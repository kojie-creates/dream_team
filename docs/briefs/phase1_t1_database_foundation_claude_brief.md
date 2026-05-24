# CLAUDE BRIEF: Phase 1 T1 Database Foundation

Date: 2026-05-24
Repo: `C:\Users\felix\Desktop\dream_team`
App root: `C:\Users\felix\Desktop\dream_team\app`

## Purpose

Build the Phase 1 database foundation only.

Phase 0 is complete and cloud-smoked against Supabase project `dream-team-dev` (`xmxozhibakbzsucvtucv`). Phase 1 begins with schema and RLS for the workflow objects that will support paste-brief submission, ticket generation, trace events, and packets/artifacts.

Do not build UI in this ticket.

## Source Of Truth

Read these files first:

1. `docs/design/dream_team_v1_architecture_brief.md`
2. `docs/design/phase0-acceptance-report.md`
3. `app/AGENTS.md`
4. Existing migrations under `app/supabase/migrations/`
5. Existing RLS tests under `app/supabase/tests/rls/`

After each read, echo the first 3 non-empty lines of the file you read.

## Hard Scope

In scope:

1. Add a new local migration: `app/supabase/migrations/0005_phase1_workflow_foundation.sql`
2. Add RLS tests for the new Phase 1 tables under `app/supabase/tests/rls/`
3. Run local Supabase reset/tests
4. Run TypeScript and lint gates
5. Write a final report under `docs/briefs/phase1_t1_database_foundation_report.md`

Out of scope:

1. No UI pages or components
2. No Anthropic/model API calls
3. No Edge Functions
4. No Realtime/SSE
5. No file/PDF upload
6. No connector tables
7. No cloud migration apply unless Felix explicitly asks after local validation passes
8. No edits to prompt-library agents unless a test requires none; it should not

## Required Tables

Create these tables:

1. `briefs`
2. `tickets`
3. `workflow_runs`
4. `trace_events`
5. `packets`
6. `artifacts`

Use the architecture brief as the starting point, with these Phase 1 simplifications:

1. `workflow_runs` is the Phase 1 name for the runner table. Do not create `agent_runs` yet.
2. Include `packets` now because Phase 1 needs a place to store the Orchestrator classification packet.
3. Include `artifacts` now, but do not create Supabase Storage buckets yet.
4. All six tables must include `workspace_id uuid not null references public.workspaces(id) on delete cascade`.

## Suggested Schema Shape

Use conservative Postgres types and checks.

`briefs`:

1. `id uuid primary key default gen_random_uuid()`
2. `workspace_id uuid not null references public.workspaces(id) on delete cascade`
3. `source text not null check (source in ('paste','file','generate','connector'))`
4. `storage_path text`
5. `raw_text text`
6. `word_count integer not null default 0 check (word_count >= 0)`
7. `parsed_status text not null default 'ready' check (parsed_status in ('pending','ready','failed'))`
8. `created_by uuid not null references auth.users(id) on delete restrict`
9. `created_at timestamptz not null default now()`

`tickets`:

1. `id uuid primary key default gen_random_uuid()`
2. `wq_id text unique`
3. `workspace_id uuid not null references public.workspaces(id) on delete cascade`
4. `brief_id uuid references public.briefs(id) on delete set null`
5. `title text not null`
6. `status text not null default 'open' check (status in ('open','in_progress','done','failed','looped','needs_input'))`
7. `layer text`
8. `current_agent text`
9. `failure_type text`
10. `loop_signature text`
11. `created_by uuid not null references auth.users(id) on delete restrict`
12. `created_at timestamptz not null default now()`
13. `updated_at timestamptz not null default now()`

`workflow_runs`:

1. `id uuid primary key default gen_random_uuid()`
2. `workspace_id uuid not null references public.workspaces(id) on delete cascade`
3. `ticket_id uuid not null references public.tickets(id) on delete cascade`
4. `run_kind text not null default 'orchestrator' check (run_kind in ('orchestrator','coordinator','specialist','qa','truth'))`
5. `agent_id text`
6. `model text`
7. `input_tokens integer not null default 0 check (input_tokens >= 0)`
8. `output_tokens integer not null default 0 check (output_tokens >= 0)`
9. `cost_usd numeric(10,4) not null default 0 check (cost_usd >= 0)`
10. `started_at timestamptz not null default now()`
11. `ended_at timestamptz`
12. `status text not null default 'pending' check (status in ('pending','running','done','failed'))`

`trace_events`:

1. `id bigserial primary key`
2. `workspace_id uuid not null references public.workspaces(id) on delete cascade`
3. `ticket_id uuid not null references public.tickets(id) on delete cascade`
4. `seq bigint not null check (seq > 0)`
5. `from_agent text`
6. `to_agent text`
7. `event_type text not null`
8. `payload jsonb not null default '{}'::jsonb`
9. `created_at timestamptz not null default now()`
10. Unique `(ticket_id, seq)`

`packets`:

1. `id uuid primary key default gen_random_uuid()`
2. `workspace_id uuid not null references public.workspaces(id) on delete cascade`
3. `ticket_id uuid not null references public.tickets(id) on delete cascade`
4. `trace_event_id bigint references public.trace_events(id) on delete set null`
5. `packet_type text not null check (packet_type in ('handoff','failure','trace','truth','artifact'))`
6. `body_raw text`
7. `body_parsed jsonb not null default '{}'::jsonb`
8. `created_at timestamptz not null default now()`

`artifacts`:

1. `id uuid primary key default gen_random_uuid()`
2. `workspace_id uuid not null references public.workspaces(id) on delete cascade`
3. `ticket_id uuid references public.tickets(id) on delete cascade`
4. `kind text not null check (kind in ('markdown','file','bundle','json'))`
5. `storage_path text`
6. `mime_type text`
7. `bytes integer check (bytes is null or bytes >= 0)`
8. `created_at timestamptz not null default now()`

Indexes:

1. `briefs(workspace_id, created_at desc)`
2. `tickets(workspace_id, status, updated_at desc)`
3. `tickets(workspace_id, current_agent)`
4. `workflow_runs(ticket_id, started_at)`
5. `trace_events(ticket_id, seq)`
6. `packets(ticket_id, packet_type)`
7. `artifacts(ticket_id, created_at desc)`

Add `set_updated_at` trigger to `tickets.updated_at`.

## RLS Requirements

Enable RLS on all six new tables.

Read policies:

1. Workspace members can read rows for their workspace on all six tables.
2. Use existing `public.is_workspace_member(workspace_id)`.

Client write policies:

1. Authenticated workspace members can insert `briefs` only when `created_by = auth.uid()` and they are a member of `workspace_id`.
2. Authenticated workspace members can insert `tickets` only when `created_by = auth.uid()` and they are a member of `workspace_id`.
3. No direct client updates or deletes for `trace_events`.
4. No direct client deletes for Phase 1 tables.

System/server write posture:

1. Service role bypasses RLS as designed.
2. Do not add broad `authenticated` insert policies for `workflow_runs`, `trace_events`, `packets`, or `artifacts` unless tests prove the exact need.
3. Prefer server/service-role writes for generated run/event/packet/artifact rows in later tickets.

Append-only invariant:

1. `trace_events` must have no update policy.
2. `trace_events` must have no delete policy.

## Tests Required

Create focused pgtap tests. You may split by table or group related tables, but every new table needs coverage.

Required assertions:

1. RLS enabled on all six new tables.
2. Member can read own workspace rows for each table.
3. Non-member cannot read another workspace's rows for each table.
4. Member can insert own `briefs` row.
5. Non-member cannot insert `briefs` row into foreign workspace.
6. Member can insert own `tickets` row.
7. Non-member cannot insert `tickets` row into foreign workspace.
8. Direct authenticated insert into `trace_events` is denied.
9. Direct authenticated update/delete of `trace_events` is denied.
10. Unique `(ticket_id, seq)` on `trace_events` is enforced.

Follow the existing helper style in `app/supabase/tests/rls/*.test.sql`.

After writing each test file, immediately read it back and echo:

1. Path
2. Line count
3. First 3 non-empty lines

## Work Sequence

1. Read source files listed above.
2. Write `0005_phase1_workflow_foundation.sql`.
3. Immediately read back the migration and echo path, line count, first 3 non-empty lines.
4. Write RLS test file(s).
5. Immediately read back each test file and echo path, line count, first 3 non-empty lines.
6. Run `pnpm verify:supabase-project`.
7. Run `pnpm exec supabase db reset`.
8. Run `pnpm exec supabase test db`.
9. Run `pnpm typecheck`.
10. Run `pnpm lint`.
11. Write `docs/briefs/phase1_t1_database_foundation_report.md`.
12. Immediately read back the report and echo path, line count, first 3 non-empty lines.

## Final Report Must Include

1. Completion status: `complete`, `blocked`, or `partial`
2. Files changed
3. Tables created
4. Policies created
5. Tests added
6. Exact command outputs for:
   - `pnpm verify:supabase-project`
   - `pnpm exec supabase db reset`
   - `pnpm exec supabase test db`
   - `pnpm typecheck`
   - `pnpm lint`
7. Any deviations from this brief
8. Whether cloud migration was applied: expected answer is `no`
9. Confirmation that no UI files were edited

## Stop Conditions

Stop and report if:

1. Existing Phase 0 RLS tests fail before your new migration logic is involved.
2. You find the cloud project is targeted by a command that should only hit local.
3. A required RLS policy would require a security decision not specified here.
4. You need to modify UI, auth, or app routes to make DB tests pass.

Do not widen scope.
