# CLAUDE BRIEF: Phase 5 T1 Connector Schema And RLS

Date: 2026-05-24
Repo: `C:\Users\felix\Desktop\dream_team`
App root: `C:\Users\felix\Desktop\dream_team\app`

## Purpose

Add the database foundation for workspace-scoped connectors.

This ticket must make connector metadata visible to workspace members while keeping token material server-only and unreadable by browser clients. Do not build OAuth yet. Do not call any external provider yet.

## Operating Mode

This is a single-ticket implementation brief.

Work sequentially. After every file write, immediately read back enough of the changed file to prove it exists and contains the intended section. For markdown reports, echo the first 3 non-empty lines and the line count.

Do not report completion until all validation gates have been run or honestly marked blocked.

## Source Files To Read First

Read these before editing:

1. `app/AGENTS.md`
2. `docs/design/dream_team_v1_architecture_brief.md`
3. `docs/briefs/phase4_t6_basic_usage_meter_report.md`, if present
4. `app/supabase/migrations/0001_phase0_foundation.sql`
5. `app/supabase/migrations/0002_phase0_rls.sql`
6. `app/supabase/migrations/0005_phase1_workflow_foundation.sql`
7. `app/supabase/tests/rls/workspace_invites.test.sql`
8. `app/src/env.ts`

After each read, echo the first 3 non-empty lines.

## Goal

Create the Phase 5 connector tables and RLS tests:

1. `connectors`
2. `connector_tokens`
3. Optional helper RPCs only if needed for safe server-side writes
4. RLS tests proving workspace isolation and token unreadability

## Schema Requirements

Create a migration:

`app/supabase/migrations/0006_phase5_connectors.sql`

Tables:

### `connectors`

Columns:

1. `id uuid primary key default gen_random_uuid()`
2. `workspace_id uuid not null references public.workspaces(id) on delete cascade`
3. `provider text not null`
4. `status text not null default 'disconnected'`
5. `scopes text[] not null default '{}'::text[]`
6. `connected_by uuid null references auth.users(id) on delete set null`
7. `connected_at timestamptz null`
8. `last_sync_at timestamptz null`
9. `last_error text null`
10. `created_at timestamptz not null default now()`
11. `updated_at timestamptz not null default now()`

Constraints:

1. `provider in ('google_calendar','google_drive','gmail','google_sheets','slack','notion')`
2. `status in ('disconnected','connecting','connected','error','revoked')`
3. unique `(workspace_id, provider)`

Indexes:

1. `(workspace_id, provider)`
2. `(workspace_id, status)`

RLS:

1. Workspace members can select connector metadata.
2. Workspace owners/admins can insert/update connector metadata.
3. No client delete in this ticket unless disconnect requires it. Prefer status update.

### `connector_tokens`

Columns:

1. `connector_id uuid primary key references public.connectors(id) on delete cascade`
2. `access_token_encrypted text null`
3. `refresh_token_encrypted text null`
4. `expires_at timestamptz null`
5. `token_type text null`
6. `provider_account_id text null`
7. `provider_account_email text null`
8. `created_at timestamptz not null default now()`
9. `updated_at timestamptz not null default now()`

Token access rule:

1. Enable RLS.
2. Add no select policy for `anon` or `authenticated`.
3. Add no insert/update/delete client policy.
4. Token rows are only accessed through server-side service-role code in later tickets.

Important: token values must be encrypted or placeholder-empty. If encryption design cannot be implemented safely in T1, create the table with locked-down access but do not store real token values in later tickets until encryption lands.

## RLS Tests

Create:

`app/supabase/tests/rls/connectors.test.sql`

Assertions should prove:

1. RLS is enabled on `connectors`.
2. RLS is enabled on `connector_tokens`.
3. Anon cannot read either table.
4. Anon cannot write either table.
5. Workspace member can read connector metadata for own workspace.
6. Workspace member cannot read connector metadata for another workspace.
7. Workspace admin/owner can create/update connector metadata.
8. Workspace member cannot create/update connector metadata.
9. Authenticated client cannot read `connector_tokens`.
10. Authenticated client cannot write `connector_tokens`.

Use the existing pgtap helper style from Phase 0/1 tests. Do not weaken existing policies to make tests pass.

## App Surface

Do not build the settings UI in T1. Schema only, tests only, and optional TypeScript constants/types if they make the next ticket safer.

If adding constants, keep them small:

`app/src/lib/connectors/types.ts`

Allowed content:

1. provider union
2. status union
3. display labels
4. read-only scope labels

No provider calls.

## Hard Boundaries

1. No OAuth routes.
2. No external API calls.
3. No tokens in client-readable tables.
4. No service-role helper beyond existing patterns unless required by tests.
5. No provider credentials in code.
6. Do not touch Orin Supabase project references.
7. Do not use the forbidden project ref `fwexgqktxdfiajpqlgvz`.

## Validation

Run from `app/`:

1. `pnpm verify:supabase-project`
2. `pnpm typecheck`
3. `pnpm lint`
4. `pnpm exec supabase db reset`
5. `pnpm exec supabase test db`

Expected pgtap count should increase from the current baseline. Report the exact final `Files=..., Tests=..., Result: PASS` line.

## Report Requirements

Write:

`docs/briefs/phase5_t1_connector_schema_rls_report.md`

Report must include:

1. Completion status.
2. Files changed.
3. Tables added.
4. RLS policy summary.
5. Token boundary summary.
6. Test assertions added.
7. Exact validation output.
8. Caveats and non-claims.
9. Next recommended ticket: Phase 5 T2 Connector Settings Surface.

After writing the report, immediately read it back and echo:

1. line count
2. first 3 non-empty lines
3. final completion status line

## Stop Conditions

Stop and report blocked if:

1. Token material would be readable by `anon` or `authenticated`.
2. RLS tests require policy weakening.
3. The schema requires an encryption decision that cannot be made safely.
4. The implementation starts OAuth or provider calls.
