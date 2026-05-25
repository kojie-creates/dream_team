-- Phase 5 T1 — connector schema + RLS.
-- Source: docs/briefs/phase5_t1_connector_schema_rls_claude_brief.md
-- Tables: connectors (workspace-scoped metadata), connector_tokens (server-only token vault).
--
-- Token boundary: connector_tokens has RLS enabled with NO client policies (anon and
-- authenticated cannot select / insert / update / delete). All token row access goes
-- through service-role server code in later tickets. Token *values* are stored in
-- columns named *_encrypted; the encryption layer is out of scope for T1. Until that
-- lands, those columns must remain null or hold opaque placeholder strings only.

-- ---------------------------------------------------------------------------
-- connectors — per-workspace integration record (metadata only).
-- ---------------------------------------------------------------------------
create table public.connectors (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null check (provider in (
    'google_calendar','google_drive','gmail','google_sheets','slack','notion'
  )),
  status text not null default 'disconnected' check (status in (
    'disconnected','connecting','connected','error','revoked'
  )),
  scopes text[] not null default '{}'::text[],
  connected_by uuid references auth.users(id) on delete set null,
  connected_at timestamptz,
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, provider)
);

create index connectors_workspace_provider_idx on public.connectors (workspace_id, provider);
create index connectors_workspace_status_idx on public.connectors (workspace_id, status);

create trigger connectors_set_updated_at
  before update on public.connectors
  for each row execute function public.set_updated_at();

comment on table public.connectors is
  'Workspace-scoped connector metadata. Token material lives in connector_tokens and is service-role only.';

-- ---------------------------------------------------------------------------
-- connector_tokens — server-only token vault. RLS enabled, no client policies.
-- ---------------------------------------------------------------------------
create table public.connector_tokens (
  connector_id uuid primary key references public.connectors(id) on delete cascade,
  access_token_encrypted text,
  refresh_token_encrypted text,
  expires_at timestamptz,
  token_type text,
  provider_account_id text,
  provider_account_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger connector_tokens_set_updated_at
  before update on public.connector_tokens
  for each row execute function public.set_updated_at();

comment on table public.connector_tokens is
  'OAuth/refresh token vault. RLS enabled with no client policies; service-role access only. Token columns are encrypted-at-rest placeholders until the encryption layer ships.';

-- ---------------------------------------------------------------------------
-- Enable RLS.
-- ---------------------------------------------------------------------------
alter table public.connectors       enable row level security;
alter table public.connector_tokens enable row level security;

-- ---------------------------------------------------------------------------
-- connectors policies — member read; owner/admin write (insert + update).
-- No client delete: disconnect flips status to 'revoked' or 'disconnected'.
-- ---------------------------------------------------------------------------
create policy connectors_member_select on public.connectors
  for select to authenticated
  using (public.is_workspace_member(workspace_id));

create policy connectors_admin_insert on public.connectors
  for insert to authenticated
  with check (public.has_workspace_role(workspace_id, array['owner','admin']));

create policy connectors_admin_update on public.connectors
  for update to authenticated
  using (public.has_workspace_role(workspace_id, array['owner','admin']))
  with check (public.has_workspace_role(workspace_id, array['owner','admin']));

-- ---------------------------------------------------------------------------
-- connector_tokens — RLS enabled, intentionally NO policies for anon or
-- authenticated. All access via service-role server code only.
-- ---------------------------------------------------------------------------
-- (no create policy ... here on purpose)
