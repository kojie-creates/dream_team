-- Executable-core slice 2 — RLS-safe append RPCs for artifacts + packets.
-- Source: ADR-001 Decision 7 (user-session writes via SECURITY DEFINER RPCs, never
-- a service-role key) + Decision 6 pattern (the proven append_trace_event recipe).
--
-- artifacts and packets (migration 0005) are append-only for members with NO client
-- INSERT policy — only service-role could write them. To let the desktop runtime
-- persist them AS the logged-in user under RLS, these SECURITY DEFINER RPCs insert
-- as the function owner after asserting the caller is authenticated, is a member of
-- the target workspace, and (where a ticket is referenced) the ticket belongs to
-- that workspace. Mirrors create_workspace (0003) / append_trace_event (0008):
-- search_path='', revoke anon, grant authenticated.

-- append_artifact -------------------------------------------------------------
-- artifacts.ticket_id is NULLABLE; validate it only when supplied.
create or replace function public.append_artifact(
  p_workspace_id uuid,
  p_ticket_id uuid,
  p_kind text,
  p_storage_path text,
  p_mime_type text,
  p_bytes integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'not a workspace member' using errcode = '42501';
  end if;
  if p_ticket_id is not null and not exists (
    select 1 from public.tickets t
    where t.id = p_ticket_id and t.workspace_id = p_workspace_id
  ) then
    raise exception 'ticket % is not in workspace %', p_ticket_id, p_workspace_id
      using errcode = '23503';
  end if;

  insert into public.artifacts
    (workspace_id, ticket_id, kind, storage_path, mime_type, bytes)
  values
    (p_workspace_id, p_ticket_id, p_kind, p_storage_path, p_mime_type, p_bytes)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.append_artifact(uuid, uuid, text, text, text, integer) from public;
revoke execute on function public.append_artifact(uuid, uuid, text, text, text, integer) from anon;
grant execute on function public.append_artifact(uuid, uuid, text, text, text, integer) to authenticated;

-- append_packet ---------------------------------------------------------------
-- packets.ticket_id is NOT NULL; always validate ticket-in-workspace.
create or replace function public.append_packet(
  p_workspace_id uuid,
  p_ticket_id uuid,
  p_trace_event_id bigint,
  p_packet_type text,
  p_body_raw text,
  p_body_parsed jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'not a workspace member' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.tickets t
    where t.id = p_ticket_id and t.workspace_id = p_workspace_id
  ) then
    raise exception 'ticket % is not in workspace %', p_ticket_id, p_workspace_id
      using errcode = '23503';
  end if;

  insert into public.packets
    (workspace_id, ticket_id, trace_event_id, packet_type, body_raw, body_parsed)
  values
    (p_workspace_id, p_ticket_id, p_trace_event_id, p_packet_type,
     p_body_raw, coalesce(p_body_parsed, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.append_packet(uuid, uuid, bigint, text, text, jsonb) from public;
revoke execute on function public.append_packet(uuid, uuid, bigint, text, text, jsonb) from anon;
grant execute on function public.append_packet(uuid, uuid, bigint, text, text, jsonb) to authenticated;
