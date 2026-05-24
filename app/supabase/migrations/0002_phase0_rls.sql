-- Phase 0 — RLS, helper functions, owner-on-create trigger, accept_invite RPC.
-- Source: docs/design/dream_team_v1_architecture_brief.md §2 + plan T0.8.
-- Default posture: deny-all to authenticated; service role bypasses RLS.

-- ---------------------------------------------------------------------------
-- Helper: is_workspace_member(workspace_id) — SECURITY DEFINER to avoid
-- recursive RLS on workspace_members when used in workspaces/workspace_members policies.
-- ---------------------------------------------------------------------------
create or replace function public.is_workspace_member(p_workspace_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.workspace_members m
    where m.workspace_id = p_workspace_id
      and m.user_id = auth.uid()
  );
$$;

revoke all on function public.is_workspace_member(uuid) from public;
grant execute on function public.is_workspace_member(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Helper: has_workspace_role(workspace_id, roles[]) — same pattern, role-gated.
-- ---------------------------------------------------------------------------
create or replace function public.has_workspace_role(p_workspace_id uuid, p_roles text[])
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.workspace_members m
    where m.workspace_id = p_workspace_id
      and m.user_id = auth.uid()
      and m.role = any (p_roles)
  );
$$;

revoke all on function public.has_workspace_role(uuid, text[]) from public;
grant execute on function public.has_workspace_role(uuid, text[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Trigger: on auth.users insert -> create users_profile row.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users_profile (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Trigger: on workspaces insert -> add creator as owner in workspace_members.
-- Bypasses workspace_members insert RLS by running as table owner via SECURITY DEFINER.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_workspace()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.workspace_members (workspace_id, user_id, role)
  values (new.id, new.created_by, 'owner');
  return new;
end;
$$;

drop trigger if exists on_workspace_created on public.workspaces;
create trigger on_workspace_created
  after insert on public.workspaces
  for each row execute function public.handle_new_workspace();

-- ---------------------------------------------------------------------------
-- accept_invite(token text) — single-use, transaction-safe, security definer.
-- Caller must be authenticated. Token is hashed and matched against
-- workspace_invites.token_hash. On success, inserts workspace_members row
-- and marks the invite accepted.
-- ---------------------------------------------------------------------------
create or replace function public.accept_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_hash text;
  v_invite public.workspace_invites%rowtype;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  v_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');

  select * into v_invite
    from public.workspace_invites
    where token_hash = v_hash
    for update;

  if not found then
    raise exception 'invalid invite' using errcode = 'P0002';
  end if;

  if v_invite.accepted_at is not null then
    raise exception 'invite already used' using errcode = 'P0002';
  end if;

  if v_invite.expires_at < now() then
    raise exception 'invite expired' using errcode = 'P0002';
  end if;

  insert into public.workspace_members (workspace_id, user_id, role, invited_by)
  values (v_invite.workspace_id, v_uid, v_invite.role, v_invite.invited_by)
  on conflict (workspace_id, user_id) do nothing;

  update public.workspace_invites
    set accepted_at = now(),
        accepted_by = v_uid
    where id = v_invite.id;

  return v_invite.workspace_id;
end;
$$;

revoke all on function public.accept_invite(text) from public;
grant execute on function public.accept_invite(text) to authenticated;

-- pgcrypto's digest() lives under the extensions schema in Supabase.
-- Ensure it is available for the SECURITY DEFINER body above.
create extension if not exists "pgcrypto" with schema extensions;

-- ---------------------------------------------------------------------------
-- Enable RLS on all four foundation tables.
-- ---------------------------------------------------------------------------
alter table public.users_profile     enable row level security;
alter table public.workspaces        enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_invites enable row level security;

-- ---------------------------------------------------------------------------
-- users_profile — self read/write only.
-- ---------------------------------------------------------------------------
create policy users_profile_self_select on public.users_profile
  for select to authenticated
  using (id = auth.uid());

create policy users_profile_self_update on public.users_profile
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- No insert policy: rows are created by the on_auth_user_created trigger.
-- No delete policy: account deletion is service-role only.

-- ---------------------------------------------------------------------------
-- workspaces — member can read; authenticated user can create (created_by must be self);
-- only owner can update; deletes are service-role only.
-- ---------------------------------------------------------------------------
create policy workspaces_member_select on public.workspaces
  for select to authenticated
  using (public.is_workspace_member(id));

create policy workspaces_self_insert on public.workspaces
  for insert to authenticated
  with check (created_by = auth.uid());

create policy workspaces_owner_update on public.workspaces
  for update to authenticated
  using (public.has_workspace_role(id, array['owner']))
  with check (public.has_workspace_role(id, array['owner']));

-- ---------------------------------------------------------------------------
-- workspace_members — read own row + rows of workspaces I belong to.
-- No client insert / update / delete: handled by trigger + accept_invite RPC.
-- ---------------------------------------------------------------------------
create policy workspace_members_select on public.workspace_members
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_workspace_member(workspace_id)
  );

-- ---------------------------------------------------------------------------
-- workspace_invites — workspace admin/owner can read + insert for their workspace.
-- Anon token-based lookup happens via a future SECURITY DEFINER RPC, not via
-- direct table reads, so no anon policy is added here.
-- ---------------------------------------------------------------------------
create policy workspace_invites_admin_select on public.workspace_invites
  for select to authenticated
  using (public.has_workspace_role(workspace_id, array['owner', 'admin']));

create policy workspace_invites_admin_insert on public.workspace_invites
  for insert to authenticated
  with check (
    invited_by = auth.uid()
    and public.has_workspace_role(workspace_id, array['owner', 'admin'])
  );

create policy workspace_invites_admin_update on public.workspace_invites
  for update to authenticated
  using (public.has_workspace_role(workspace_id, array['owner', 'admin']))
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin']));
