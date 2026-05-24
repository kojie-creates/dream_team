-- Phase 0 — narrow follow-up: workspace creation via SECURITY DEFINER RPC.
-- Motivation: PostgREST 14.10 + RLS WITH CHECK on the wrapped CTE INSERT
-- rejects authenticated direct inserts even though auth.uid() = created_by.
-- A SECURITY DEFINER RPC issues the same insert as the function owner and
-- preserves the workspace_self_insert intent (created_by = auth.uid()) inside
-- the function body.

create or replace function public.create_workspace(p_name text, p_slug text)
returns table (id uuid, slug citext)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  return query
    insert into public.workspaces (slug, name, created_by)
    values (p_slug, p_name, v_uid)
    returning public.workspaces.id, public.workspaces.slug;
end;
$$;

revoke all on function public.create_workspace(text, text) from public;
grant execute on function public.create_workspace(text, text) to authenticated;
