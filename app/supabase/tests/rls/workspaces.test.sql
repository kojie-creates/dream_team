-- RLS smoke tests: public.workspaces
-- Asserts: RLS enabled; member can read; non-member blocked; owner can update; non-owner cannot.

create extension if not exists pgtap with schema public;
begin;
select plan(5);

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

select set_config('test.uid_a', pg_temp.mk_user('a@ws.test')::text, true);
select set_config('test.uid_b', pg_temp.mk_user('b@ws.test')::text, true);
select set_config('test.uid_c', pg_temp.mk_user('c@ws.test')::text, true);

-- A creates workspace 1 (trigger inserts owner row in workspace_members).
do $$
declare v_id uuid;
begin
  insert into public.workspaces (slug, name, created_by)
  values ('ws-1', 'Workspace 1', current_setting('test.uid_a')::uuid)
  returning id into v_id;
  perform set_config('test.ws_1', v_id::text, true);
end $$;

-- Add B as plain member (postgres bypasses RLS).
insert into public.workspace_members (workspace_id, user_id, role)
values (current_setting('test.ws_1')::uuid, current_setting('test.uid_b')::uuid, 'member');

-- 1. RLS enabled
select is(
  (select rowsecurity from pg_tables where schemaname='public' and tablename='workspaces'),
  true,
  'RLS enabled on workspaces'
);

-- 2. Member B sees workspace 1
select pg_temp.act_as(current_setting('test.uid_b')::uuid);
set local role authenticated;
select is(
  (select count(*)::int from public.workspaces where id = current_setting('test.ws_1')::uuid),
  1,
  'member B sees workspace 1'
);
reset role;

-- 3. Non-member C cannot see workspace 1
select pg_temp.act_as(current_setting('test.uid_c')::uuid);
set local role authenticated;
select is(
  (select count(*)::int from public.workspaces where id = current_setting('test.ws_1')::uuid),
  0,
  'non-member C cannot see workspace 1'
);
reset role;

-- 4. Owner A can update workspace name
select pg_temp.act_as(current_setting('test.uid_a')::uuid);
set local role authenticated;
update public.workspaces set name = 'Workspace 1 (renamed)' where id = current_setting('test.ws_1')::uuid;
reset role;
select is(
  (select name from public.workspaces where id = current_setting('test.ws_1')::uuid),
  'Workspace 1 (renamed)',
  'owner A can update workspace name'
);

-- 5. Non-owner member B cannot update
select pg_temp.act_as(current_setting('test.uid_b')::uuid);
set local role authenticated;
with upd as (
  update public.workspaces
     set name = 'should not happen'
   where id = current_setting('test.ws_1')::uuid
   returning 1
)
select is((select count(*)::int from upd), 0, 'non-owner B update affects 0 rows');

select * from finish();
rollback;
