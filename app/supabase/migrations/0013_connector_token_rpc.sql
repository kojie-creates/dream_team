-- 0013_connector_token_rpc.sql
-- Lets the governed runtime read a workspace's connector token AS the user, so a
-- runtime tool (calendar_read/write, gmail_send) can act on the user's behalf
-- without a service-role key. connector_tokens has RLS enabled with NO client
-- policies (migration 0006), so the user-session client cannot read it directly.
--
-- This SECURITY DEFINER RPC is the only door: it checks auth.uid() + workspace
-- membership (identical guard shape to append_trace_event, 0008) and returns the
-- ENCRYPTED token material. Decryption happens in the runtime with the connector
-- encryption key — never in Postgres. Membership is the authorization boundary.

create or replace function public.get_connector_token(
  p_workspace_id uuid,
  p_provider text
)
returns table (
  connector_id uuid,
  status text,
  access_token_encrypted text,
  refresh_token_encrypted text,
  expires_at timestamptz,
  token_type text
)
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
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'not a workspace member' using errcode = '42501';
  end if;

  return query
    select c.id, c.status,
           t.access_token_encrypted, t.refresh_token_encrypted,
           t.expires_at, t.token_type
    from public.connectors c
    join public.connector_tokens t on t.connector_id = c.id
    where c.workspace_id = p_workspace_id
      and c.provider = p_provider;
end;
$$;

revoke all on function public.get_connector_token(uuid, text) from public;
grant execute on function public.get_connector_token(uuid, text) to authenticated;

comment on function public.get_connector_token(uuid, text) is
  'Returns ENCRYPTED connector token material for a workspace the caller is a member of. SECURITY DEFINER; auth.uid() + is_workspace_member guard. Decryption happens in the runtime, never here.';
