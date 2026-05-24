-- RLS smoke tests: public.briefs + public.tickets.
-- Asserts: RLS enabled; member read; non-member blocked;
-- member can insert own; non-member cannot insert into foreign workspace.

create extension if not exists pgtap with schema public;
begin;
select plan(10);

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

select set_config('test.uid_a', pg_temp.mk_user('a@bt.test')::text, true);  -- ws A owner
select set_config('test.uid_b', pg_temp.mk_user('b@bt.test')::text, true);  -- ws A member
select set_config('test.uid_c', pg_temp.mk_user('c@bt.test')::text, true);  -- outsider, owns ws B

-- Workspaces (postgres bypasses RLS).
do $$
declare v_a uuid; v_b uuid;
begin
  insert into public.workspaces (slug, name, created_by)
  values ('bt-a', 'BT Workspace A', current_setting('test.uid_a')::uuid)
  returning id into v_a;
  insert into public.workspaces (slug, name, created_by)
  values ('bt-b', 'BT Workspace B', current_setting('test.uid_c')::uuid)
  returning id into v_b;
  perform set_config('test.ws_a', v_a::text, true);
  perform set_config('test.ws_b', v_b::text, true);
end $$;

insert into public.workspace_members (workspace_id, user_id, role)
values (current_setting('test.ws_a')::uuid, current_setting('test.uid_b')::uuid, 'member');

-- Seed one brief + one ticket in ws_a as postgres for read tests.
do $$
declare v_brief uuid; v_ticket uuid;
begin
  insert into public.briefs (workspace_id, source, raw_text, created_by)
  values (current_setting('test.ws_a')::uuid, 'paste', 'seed brief', current_setting('test.uid_a')::uuid)
  returning id into v_brief;
  insert into public.tickets (workspace_id, brief_id, title, created_by)
  values (current_setting('test.ws_a')::uuid, v_brief, 'seed ticket', current_setting('test.uid_a')::uuid)
  returning id into v_ticket;
  perform set_config('test.brief_seed', v_brief::text, true);
  perform set_config('test.ticket_seed', v_ticket::text, true);
end $$;

-- 1. RLS enabled on briefs
select is(
  (select rowsecurity from pg_tables where schemaname='public' and tablename='briefs'),
  true,
  'RLS enabled on briefs'
);

-- 2. RLS enabled on tickets
select is(
  (select rowsecurity from pg_tables where schemaname='public' and tablename='tickets'),
  true,
  'RLS enabled on tickets'
);

-- 3. Member B reads ws_a brief
select pg_temp.act_as(current_setting('test.uid_b')::uuid);
set local role authenticated;
select is(
  (select count(*)::int from public.briefs where id = current_setting('test.brief_seed')::uuid),
  1,
  'member B reads ws_a brief'
);
reset role;

-- 4. Member B reads ws_a ticket
select pg_temp.act_as(current_setting('test.uid_b')::uuid);
set local role authenticated;
select is(
  (select count(*)::int from public.tickets where id = current_setting('test.ticket_seed')::uuid),
  1,
  'member B reads ws_a ticket'
);
reset role;

-- 5. Outsider C cannot read ws_a brief
select pg_temp.act_as(current_setting('test.uid_c')::uuid);
set local role authenticated;
select is(
  (select count(*)::int from public.briefs where id = current_setting('test.brief_seed')::uuid),
  0,
  'outsider C cannot read ws_a brief'
);
reset role;

-- 6. Outsider C cannot read ws_a ticket
select pg_temp.act_as(current_setting('test.uid_c')::uuid);
set local role authenticated;
select is(
  (select count(*)::int from public.tickets where id = current_setting('test.ticket_seed')::uuid),
  0,
  'outsider C cannot read ws_a ticket'
);
reset role;

-- 7. Member B inserts own brief into ws_a
select pg_temp.act_as(current_setting('test.uid_b')::uuid);
set local role authenticated;
select lives_ok(
  format(
    $q$ insert into public.briefs (workspace_id, source, raw_text, created_by)
        values (%L::uuid, 'paste', 'B own brief', %L::uuid) $q$,
    current_setting('test.ws_a'), current_setting('test.uid_b')
  ),
  'member B inserts own brief into ws_a'
);
reset role;

-- 8. Outsider C cannot insert brief into ws_a (foreign workspace)
select pg_temp.act_as(current_setting('test.uid_c')::uuid);
set local role authenticated;
select throws_ok(
  format(
    $q$ insert into public.briefs (workspace_id, source, raw_text, created_by)
        values (%L::uuid, 'paste', 'sneak', %L::uuid) $q$,
    current_setting('test.ws_a'), current_setting('test.uid_c')
  ),
  '42501',
  null,
  'outsider C cannot insert brief into ws_a'
);
reset role;

-- 9. Member B inserts own ticket into ws_a
select pg_temp.act_as(current_setting('test.uid_b')::uuid);
set local role authenticated;
select lives_ok(
  format(
    $q$ insert into public.tickets (workspace_id, title, created_by)
        values (%L::uuid, 'B own ticket', %L::uuid) $q$,
    current_setting('test.ws_a'), current_setting('test.uid_b')
  ),
  'member B inserts own ticket into ws_a'
);
reset role;

-- 10. Outsider C cannot insert ticket into ws_a
select pg_temp.act_as(current_setting('test.uid_c')::uuid);
set local role authenticated;
select throws_ok(
  format(
    $q$ insert into public.tickets (workspace_id, title, created_by)
        values (%L::uuid, 'sneak', %L::uuid) $q$,
    current_setting('test.ws_a'), current_setting('test.uid_c')
  ),
  '42501',
  null,
  'outsider C cannot insert ticket into ws_a'
);
reset role;

select * from finish();
rollback;
