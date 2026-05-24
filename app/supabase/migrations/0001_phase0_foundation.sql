-- Phase 0 — foundational tables
-- Source: docs/design/dream_team_v1_architecture_brief.md §2
-- Tables: users_profile, workspaces, workspace_members, workspace_invites
-- RLS is enabled in 0002. This migration only defines structure.

create extension if not exists "citext";
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- users_profile — 1:1 with auth.users
-- ---------------------------------------------------------------------------
create table public.users_profile (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  default_workspace_id uuid,
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.users_profile is 'Per-user profile + onboarding state. 1:1 with auth.users.';

-- ---------------------------------------------------------------------------
-- workspaces — tenant boundary
-- ---------------------------------------------------------------------------
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  slug citext not null unique,
  name text not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  plan text not null default 'free' check (plan in ('free', 'pro', 'enterprise')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index workspaces_created_by_idx on public.workspaces (created_by);

comment on table public.workspaces is 'Tenant boundary. Every workspace-scoped row in the schema must carry workspace_id.';

-- FK from users_profile.default_workspace_id (deferred to avoid circular create-order issues)
alter table public.users_profile
  add constraint users_profile_default_workspace_fk
  foreign key (default_workspace_id) references public.workspaces(id) on delete set null;

-- ---------------------------------------------------------------------------
-- workspace_members — membership + role
-- ---------------------------------------------------------------------------
create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member')),
  invited_by uuid references auth.users(id) on delete set null,
  joined_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index workspace_members_user_id_idx on public.workspace_members (user_id);

comment on table public.workspace_members is 'Workspace membership and role. Inserts are gated by RLS to the accept_invite RPC only.';

-- ---------------------------------------------------------------------------
-- workspace_invites — single-use, tokenized invite
-- ---------------------------------------------------------------------------
create table public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email citext not null,
  role text not null check (role in ('admin', 'member')),
  token_hash text not null unique,
  invited_by uuid not null references auth.users(id) on delete restrict,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index workspace_invites_workspace_id_idx on public.workspace_invites (workspace_id);
create index workspace_invites_email_idx on public.workspace_invites (email);

comment on table public.workspace_invites is 'Single-use invite tokens. token_hash is sha256 of the unguessable token; raw token never stored.';

-- ---------------------------------------------------------------------------
-- updated_at trigger helper
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger users_profile_set_updated_at
  before update on public.users_profile
  for each row execute function public.set_updated_at();

create trigger workspaces_set_updated_at
  before update on public.workspaces
  for each row execute function public.set_updated_at();
