-- RLS smoke tests: public.workspace_members
-- Asserts: RLS enabled; client direct insert blocked; member sees workspace siblings; non-member blocked.

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

select set_config('test.uid_a', pg_temp.mk_user('a@wm.test')::text, true);
select set_config('test.uid_b', pg_temp.mk_user('b@wm.test')::text, true);
select set_config('test.uid_c', pg_temp.mk_user('c@wm.test')::text, true);

do $$
declare v_id uuid;
begin
  insert into public.workspaces (slug, name, created_by)
  values ('ws-m', 'WM Workspace', current_setting('test.uid_a')::uuid)
  returning id into v_id;
  perform set_config('test.ws', v_id::text, true);
end $$;

insert into public.workspace_members (workspace_id, user_id, role)
values (current_setting('test.ws')::uuid, current_setting('test.uid_b')::uuid, 'member');

-- 1. RLS enabled
select is(
  (select rowsecurity from pg_tables where schemaname='public' and tablename='workspace_members'),
  true,
  'RLS enabled on workspace_members'
);

-- 2. Owner A sees both members of workspace (self + B)
select pg_temp.act_as(current_setting('test.uid_a')::uuid);
set local role authenticated;
select is(
  (select count(*)::int from public.workspace_members where workspace_id = current_setting('test.ws')::uuid),
  2,
  'owner A sees both rows in workspace'
);
reset role;

-- 3. Member B sees own + owner row
select pg_temp.act_as(current_setting('test.uid_b')::uuid);
set local role authenticated;
select is(
  (select count(*)::int from public.workspace_members where workspace_id = current_setting('test.ws')::uuid),
  2,
  'member B sees both rows in workspace'
);
reset role;

-- 4. Non-member C sees zero
select pg_temp.act_as(current_setting('test.uid_c')::uuid);
set local role authenticated;
select is(
  (select count(*)::int from public.workspace_members where workspace_id = current_setting('test.ws')::uuid),
  0,
  'non-member C cannot see any rows in workspace'
);
reset role;

-- 5. Direct client insert into workspace_members denied (no INSERT policy)
select pg_temp.act_as(current_setting('test.uid_c')::uuid);
set local role authenticated;
select throws_ok(
  format(
    $sql$ insert into public.workspace_members (workspace_id, user_id, role) values (%L::uuid, %L::uuid, 'member') $sql$,
    current_setting('test.ws'),
    current_setting('test.uid_c')
  ),
  '42501',
  null,
  'C cannot directly insert workspace_members row'
);
reset role;

select * from finish();
rollback;
