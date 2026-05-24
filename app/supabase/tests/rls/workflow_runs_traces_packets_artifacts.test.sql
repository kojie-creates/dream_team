-- RLS smoke tests: public.workflow_runs, trace_events, packets, artifacts.
-- Asserts: RLS enabled on all four; member can read own workspace rows;
-- non-member cannot read; direct authenticated insert/update/delete denied on
-- trace_events; trace_events (ticket_id, seq) uniqueness enforced.

create extension if not exists pgtap with schema public;
begin;
select plan(15);

create or replace function pg_temp.mk_user(p_email text) returns uuid as $$
declare v_id uuid := gen_random_uuid();
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id,
    'authenticated', 'authenticated', p_email, '',
    now(), '{}', '{}', now(), now()
  );
  return v_id;
end $$ language plpgsql;

create or replace function pg_temp.act_as(p_uid uuid) returns void as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text,
    true
  );
end $$ language plpgsql;

select set_config('test.uid_a', pg_temp.mk_user('a@wt.test')::text, true);  -- ws A owner
select set_config('test.uid_b', pg_temp.mk_user('b@wt.test')::text, true);  -- ws A member
select set_config('test.uid_c', pg_temp.mk_user('c@wt.test')::text, true);  -- outsider

do $$
declare v_a uuid; v_brief uuid; v_ticket uuid; v_evt bigint;
begin
  insert into public.workspaces (slug, name, created_by)
  values ('wt-a', 'WT Workspace A', current_setting('test.uid_a')::uuid)
  returning id into v_a;
  perform set_config('test.ws_a', v_a::text, true);

  insert into public.briefs (workspace_id, source, raw_text, created_by)
  values (v_a, 'paste', 'wt brief', current_setting('test.uid_a')::uuid)
  returning id into v_brief;

  insert into public.tickets (workspace_id, brief_id, title, created_by)
  values (v_a, v_brief, 'wt ticket', current_setting('test.uid_a')::uuid)
  returning id into v_ticket;
  perform set_config('test.ticket', v_ticket::text, true);

  insert into public.workflow_runs (workspace_id, ticket_id, run_kind, agent_id)
  values (v_a, v_ticket, 'orchestrator', 'central-orchestrator');

  insert into public.trace_events (workspace_id, ticket_id, seq, event_type)
  values (v_a, v_ticket, 1, 'classify')
  returning id into v_evt;
  perform set_config('test.evt', v_evt::text, true);

  insert into public.packets (workspace_id, ticket_id, trace_event_id, packet_type, body_raw)
  values (v_a, v_ticket, v_evt, 'handoff', 'seed packet');

  insert into public.artifacts (workspace_id, ticket_id, kind, storage_path)
  values (v_a, v_ticket, 'markdown', 'seed/path.md');
end $$;

insert into public.workspace_members (workspace_id, user_id, role)
values (current_setting('test.ws_a')::uuid, current_setting('test.uid_b')::uuid, 'member');

-- 1-4. RLS enabled on all four tables
select is(
  (select rowsecurity from pg_tables where schemaname='public' and tablename='workflow_runs'),
  true, 'RLS enabled on workflow_runs');
select is(
  (select rowsecurity from pg_tables where schemaname='public' and tablename='trace_events'),
  true, 'RLS enabled on trace_events');
select is(
  (select rowsecurity from pg_tables where schemaname='public' and tablename='packets'),
  true, 'RLS enabled on packets');
select is(
  (select rowsecurity from pg_tables where schemaname='public' and tablename='artifacts'),
  true, 'RLS enabled on artifacts');

-- 5-8. Member B reads each table in ws_a
select pg_temp.act_as(current_setting('test.uid_b')::uuid);
set local role authenticated;
select is((select count(*)::int from public.workflow_runs where ticket_id = current_setting('test.ticket')::uuid),
  1, 'member B reads workflow_runs');
select is((select count(*)::int from public.trace_events where ticket_id = current_setting('test.ticket')::uuid),
  1, 'member B reads trace_events');
select is((select count(*)::int from public.packets where ticket_id = current_setting('test.ticket')::uuid),
  1, 'member B reads packets');
select is((select count(*)::int from public.artifacts where ticket_id = current_setting('test.ticket')::uuid),
  1, 'member B reads artifacts');
reset role;

-- 9. Non-member C reads zero rows across the four tables
select pg_temp.act_as(current_setting('test.uid_c')::uuid);
set local role authenticated;
select is(
  (select
     (select count(*) from public.workflow_runs where ticket_id = current_setting('test.ticket')::uuid)
   + (select count(*) from public.trace_events where ticket_id = current_setting('test.ticket')::uuid)
   + (select count(*) from public.packets        where ticket_id = current_setting('test.ticket')::uuid)
   + (select count(*) from public.artifacts      where ticket_id = current_setting('test.ticket')::uuid)
  )::int,
  0,
  'non-member C reads zero rows across workflow_runs/trace_events/packets/artifacts'
);
reset role;

-- 10. Authenticated direct insert into trace_events denied (member B, own workspace).
select pg_temp.act_as(current_setting('test.uid_b')::uuid);
set local role authenticated;
select throws_ok(
  format(
    $q$ insert into public.trace_events (workspace_id, ticket_id, seq, event_type)
        values (%L::uuid, %L::uuid, 999, 'sneak') $q$,
    current_setting('test.ws_a'), current_setting('test.ticket')
  ),
  '42501',
  null,
  'authenticated direct insert into trace_events denied'
);
reset role;

-- 11. Authenticated update of trace_events affects 0 rows (no update policy).
select pg_temp.act_as(current_setting('test.uid_b')::uuid);
set local role authenticated;
with upd as (
  update public.trace_events
     set event_type = 'mutated'
   where id = current_setting('test.evt')::bigint
   returning 1
)
select is((select count(*)::int from upd), 0, 'authenticated update of trace_events affects 0 rows');
reset role;

-- 12. trace_events unchanged after attempted update
select is(
  (select event_type from public.trace_events where id = current_setting('test.evt')::bigint),
  'classify',
  'trace_events row unchanged after blocked update'
);

-- 13. Authenticated delete of trace_events affects 0 rows (no delete policy).
select pg_temp.act_as(current_setting('test.uid_b')::uuid);
set local role authenticated;
with del as (
  delete from public.trace_events where id = current_setting('test.evt')::bigint returning 1
)
select is((select count(*)::int from del), 0, 'authenticated delete of trace_events affects 0 rows');
reset role;

-- 14. trace_events row still present after attempted delete
select is(
  (select count(*)::int from public.trace_events where id = current_setting('test.evt')::bigint),
  1,
  'trace_events row still present after blocked delete'
);

-- 15. (ticket_id, seq) uniqueness on trace_events enforced (as postgres, bypass RLS).
select throws_ok(
  format(
    $q$ insert into public.trace_events (workspace_id, ticket_id, seq, event_type)
        values (%L::uuid, %L::uuid, 1, 'dupe') $q$,
    current_setting('test.ws_a'), current_setting('test.ticket')
  ),
  '23505',
  null,
  'unique (ticket_id, seq) on trace_events enforced'
);

select * from finish();
rollback;
