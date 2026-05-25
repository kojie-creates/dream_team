-- Phase 5 T5 — automation_rules table + RLS.
-- Source: docs/briefs (Phase 5 T5 Automation Rules brief).
-- Workspace-scoped, user-controlled rule rows. Manual run only in T5 —
-- no scheduler, no cron, no background execution wired anywhere.

create table public.automation_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  connector_id uuid not null references public.connectors(id) on delete cascade,
  name text not null,
  status text not null default 'paused' check (status in ('paused','active','error')),
  trigger_type text not null check (trigger_type in ('manual_calendar_ingest','daily_calendar_digest')),
  config jsonb not null default '{}'::jsonb,
  last_run_at timestamptz,
  last_result text,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index automation_rules_workspace_idx
  on public.automation_rules (workspace_id, created_at desc);
create index automation_rules_connector_idx
  on public.automation_rules (connector_id);

create trigger automation_rules_set_updated_at
  before update on public.automation_rules
  for each row execute function public.set_updated_at();

comment on table public.automation_rules is
  'User-defined automation rules. T5 supports manual run only; no scheduler exists.';

-- ---------------------------------------------------------------------------
-- RLS — member read; owner/admin insert + update; no client delete.
-- ---------------------------------------------------------------------------
alter table public.automation_rules enable row level security;

create policy automation_rules_member_select on public.automation_rules
  for select to authenticated
  using (public.is_workspace_member(workspace_id));

create policy automation_rules_admin_insert on public.automation_rules
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.has_workspace_role(workspace_id, array['owner','admin'])
  );

create policy automation_rules_admin_update on public.automation_rules
  for update to authenticated
  using (public.has_workspace_role(workspace_id, array['owner','admin']))
  with check (public.has_workspace_role(workspace_id, array['owner','admin']));
