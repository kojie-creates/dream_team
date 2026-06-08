-- Executable-core T3 — atomic per-ticket trace seq via SECURITY DEFINER RPC.
-- Source: ADR-001 Decision 6 (append_trace_event RPC), Decision 4 (tool.executed payload).
--
-- trace_events is append-only with unique(ticket_id, seq) (migration 0005). The runtime
-- emits one trace row per gated tool execution; concurrent emits for the SAME ticket must
-- never collide on seq. This RPC assigns seq atomically:
--   1. a transaction-scoped advisory lock keyed on the ticket serializes the max()+1
--      compute for that ticket only (different tickets never contend);
--   2. the unique(ticket_id, seq) constraint remains the hard backstop — even if the lock
--      were bypassed, a duplicate seq raises 23505 rather than silently double-assigning.
--
-- SECURITY DEFINER + search_path='' mirrors 0003's create_workspace: trace_events has no
-- client INSERT policy (0005), so the runtime cannot insert directly; this RPC inserts as
-- the function owner. The caller must be authenticated AND a member of the target
-- workspace, and the ticket must belong to that workspace (no cross-workspace seq writes).

create or replace function public.append_trace_event(
  p_workspace_id uuid,
  p_ticket_id uuid,
  p_from_agent text,
  p_to_agent text,
  p_event_type text,
  p_payload jsonb
)
returns table (id bigint, seq bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_seq bigint;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'not a workspace member' using errcode = '42501';
  end if;

  -- The ticket must belong to the asserted workspace. Prevents a member of workspace A
  -- from appending events onto a ticket in workspace B by passing a foreign ticket id.
  if not exists (
    select 1 from public.tickets t
    where t.id = p_ticket_id and t.workspace_id = p_workspace_id
  ) then
    raise exception 'ticket % is not in workspace %', p_ticket_id, p_workspace_id
      using errcode = '23503';
  end if;

  -- Serialize seq assignment for THIS ticket only. The advisory lock is transaction
  -- scoped (released at commit/rollback), so two concurrent emits on the same ticket
  -- run the compute+insert one at a time; emits on other tickets are unaffected.
  perform pg_advisory_xact_lock(hashtextextended(p_ticket_id::text, 0));

  select coalesce(max(te.seq), 0) + 1
    into v_seq
    from public.trace_events te
    where te.ticket_id = p_ticket_id;

  return query
    insert into public.trace_events
      (workspace_id, ticket_id, seq, from_agent, to_agent, event_type, payload)
    values
      (p_workspace_id, p_ticket_id, v_seq, p_from_agent, p_to_agent,
       p_event_type, coalesce(p_payload, '{}'::jsonb))
    returning public.trace_events.id, public.trace_events.seq;
end;
$$;

revoke all on function public.append_trace_event(uuid, uuid, text, text, text, jsonb) from public;
grant execute on function public.append_trace_event(uuid, uuid, text, text, text, jsonb) to authenticated;
