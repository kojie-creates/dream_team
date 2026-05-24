-- Phase 0 — invite creation via SECURITY DEFINER RPC.
-- Motivation: same PostgREST WITH CHECK quirk that 0003 worked around for
-- workspaces — direct REST inserts into workspace_invites are rejected.
-- Function preserves the workspace_invites_admin_insert intent inside its body
-- (auth.uid() must hold owner/admin role on the workspace) and additionally
-- validates role + uniqueness inputs.

create or replace function public.create_workspace_invite(
  p_workspace_id uuid,
  p_email text,
  p_role text,
  p_token_hash text,
  p_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  if not public.has_workspace_role(p_workspace_id, array['owner', 'admin']) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_role not in ('admin', 'member') then
    raise exception 'invalid role' using errcode = '22023';
  end if;

  if length(coalesce(p_token_hash, '')) < 32 then
    raise exception 'token_hash too short' using errcode = '22023';
  end if;

  if p_expires_at <= now() then
    raise exception 'expires_at must be in the future' using errcode = '22023';
  end if;

  insert into public.workspace_invites (
    workspace_id, email, role, token_hash, invited_by, expires_at
  ) values (
    p_workspace_id, p_email, p_role, p_token_hash, v_uid, p_expires_at
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.create_workspace_invite(uuid, text, text, text, timestamptz) from public;
grant execute on function public.create_workspace_invite(uuid, text, text, text, timestamptz) to authenticated;
