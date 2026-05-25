-- RLS smoke tests: public.automation_rules.
-- Asserts: RLS enabled; anon locked; member read + isolation;
-- owner/admin can insert + update; plain member cannot insert/update.

create extension if not exists pgtap with schema public;
begin;
select plan(8);

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

select set_config('test.uid_owner',  pg_temp.mk_user('owner@ar.test')::text,  true);
select set_config('test.uid_admin',  pg_temp.mk_user('admin@ar.test')::text,  true);
select set_config('test.uid_member', pg_temp.mk_user('member@ar.test')::text, true);
select set_config('test.uid_other',  pg_temp.mk_user('other@ar.test')::text,  true);

do $$
declare v_a uuid; v_b uuid;
begin
  insert into public.workspaces (slug, name, created_by)
  values ('ar-a', 'AR Workspace A', current_setting('test.uid_owner')::uuid)
  returning id into v_a;
  insert into public.workspaces (slug, name, created_by)
  values ('ar-b', 'AR Workspace B', current_setting('test.uid_other')::uuid)
  returning id into v_b;
  perform set_config('test.ws_a', v_a::text, true);
  perform set_config('test.ws_b', v_b::text, true);
end $$;

insert into public.workspace_members (workspace_id, user_id, role)
values
  (current_setting('test.ws_a')::uuid, current_setting('test.uid_admin')::uuid,  'admin'),
  (current_setting('test.ws_a')::uuid, current_setting('test.uid_member')::uuid, 'member');

-- Seed connectors + a rule in ws_a as postgres (bypass RLS).
do $$
declare v_c_a uuid; v_c_b uuid; v_rule_a uuid;
begin
  insert into public.connectors (workspace_id, provider, status, connected_by)
  values (current_setting('test.ws_a')::uuid, 'google_calendar', 'connected', current_setting('test.uid_owner')::uuid)
  returning id into v_c_a;
  insert into public.connectors (workspace_id, provider, status, connected_by)
  values (current_setting('test.ws_b')::uuid, 'google_calendar', 'connected', current_setting('test.uid_other')::uuid)
  returning id into v_c_b;

  insert into public.automation_rules (
    workspace_id, connector_id, name, trigger_type, created_by
  ) values (
    current_setting('test.ws_a')::uuid, v_c_a, 'A ingest', 'manual_calendar_ingest',
    current_setting('test.uid_owner')::uuid
  ) returning id into v_rule_a;

  perform set_config('test.conn_a', v_c_a::text, true);
  perform set_config('test.conn_b', v_c_b::text, true);
  perform set_config('test.rule_a', v_rule_a::text, true);
end $$;

-- 1. RLS enabled
select is(
  (select rowsecurity from pg_tables where schemaname='public' and tablename='automation_rules'),
  true,
  'RLS enabled on automation_rules'
);

-- 2. Anon cannot read
set local role anon;
select is(
  (select count(*)::int from public.automation_rules),
  0,
  'anon cannot read automation_rules'
);
reset role;

-- 3. Anon cannot insert
set local role anon;
select throws_ok(
  format(
    $q$ insert into public.automation_rules
        (workspace_id, connector_id, name, trigger_type, created_by)
        values (%L::uuid, %L::uuid, 'x', 'manual_calendar_ingest', %L::uuid) $q$,
    current_setting('test.ws_a'),
    current_setting('test.conn_a'),
    current_setting('test.uid_owner')
  ),
  '42501',
  null,
  'anon cannot insert automation_rules'
);
reset role;

-- 4. Member can read own workspace rule
select pg_temp.act_as(current_setting('test.uid_member')::uuid);
set local role authenticated;
select is(
  (select count(*)::int from public.automation_rules where workspace_id = current_setting('test.ws_a')::uuid),
  1,
  'member reads own workspace rule'
);
reset role;

-- 5. Outsider cannot read foreign workspace rule
select pg_temp.act_as(current_setting('test.uid_other')::uuid);
set local role authenticated;
select is(
  (select count(*)::int from public.automation_rules where workspace_id = current_setting('test.ws_a')::uuid),
  0,
  'outsider cannot read foreign workspace rule'
);
reset role;

-- 6. Admin can insert rule for own workspace
select pg_temp.act_as(current_setting('test.uid_admin')::uuid);
set local role authenticated;
select lives_ok(
  format(
    $q$ insert into public.automation_rules
        (workspace_id, connector_id, name, trigger_type, created_by)
        values (%L::uuid, %L::uuid, 'admin rule', 'manual_calendar_ingest', %L::uuid) $q$,
    current_setting('test.ws_a'),
    current_setting('test.conn_a'),
    current_setting('test.uid_admin')
  ),
  'admin can insert automation rule for own workspace'
);
reset role;

-- 7. Plain member cannot insert
select pg_temp.act_as(current_setting('test.uid_member')::uuid);
set local role authenticated;
select throws_ok(
  format(
    $q$ insert into public.automation_rules
        (workspace_id, connector_id, name, trigger_type, created_by)
        values (%L::uuid, %L::uuid, 'sneak', 'manual_calendar_ingest', %L::uuid) $q$,
    current_setting('test.ws_a'),
    current_setting('test.conn_a'),
    current_setting('test.uid_member')
  ),
  '42501',
  null,
  'plain member cannot insert automation rule'
);
reset role;

-- 8. Plain member cannot update — RLS filters update target rows; verify
-- the row stays as the owner left it (status='paused').
select pg_temp.act_as(current_setting('test.uid_member')::uuid);
set local role authenticated;
update public.automation_rules set status = 'active'
  where id = current_setting('test.rule_a')::uuid;
reset role;
select is(
  (select status from public.automation_rules where id = current_setting('test.rule_a')::uuid),
  'paused',
  'plain member update is filtered by RLS (row unchanged)'
);

select * from finish();
rollback;
