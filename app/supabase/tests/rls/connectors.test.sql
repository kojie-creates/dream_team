-- RLS smoke tests: public.connectors + public.connector_tokens.
-- Asserts: RLS enabled on both; workspace member read + isolation;
-- owner/admin write; non-admin member cannot write; connector_tokens
-- is fully locked down to anon and authenticated (no read, no write).

create extension if not exists pgtap with schema public;
begin;
select plan(14);

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

select set_config('test.uid_owner',  pg_temp.mk_user('owner@cn.test')::text,  true);  -- ws_a owner
select set_config('test.uid_admin',  pg_temp.mk_user('admin@cn.test')::text,  true);  -- ws_a admin
select set_config('test.uid_member', pg_temp.mk_user('member@cn.test')::text, true);  -- ws_a member
select set_config('test.uid_other',  pg_temp.mk_user('other@cn.test')::text,  true);  -- ws_b owner (outsider to ws_a)

do $$
declare v_a uuid; v_b uuid;
begin
  insert into public.workspaces (slug, name, created_by)
  values ('cn-a', 'CN Workspace A', current_setting('test.uid_owner')::uuid)
  returning id into v_a;
  insert into public.workspaces (slug, name, created_by)
  values ('cn-b', 'CN Workspace B', current_setting('test.uid_other')::uuid)
  returning id into v_b;
  perform set_config('test.ws_a', v_a::text, true);
  perform set_config('test.ws_b', v_b::text, true);
end $$;

insert into public.workspace_members (workspace_id, user_id, role)
values
  (current_setting('test.ws_a')::uuid, current_setting('test.uid_admin')::uuid,  'admin'),
  (current_setting('test.ws_a')::uuid, current_setting('test.uid_member')::uuid, 'member');

-- Seed connector + token row in ws_a as postgres (bypass RLS).
do $$
declare v_c uuid;
begin
  insert into public.connectors (workspace_id, provider, status, connected_by)
  values (current_setting('test.ws_a')::uuid, 'google_calendar', 'connected', current_setting('test.uid_owner')::uuid)
  returning id into v_c;
  insert into public.connector_tokens (connector_id, access_token_encrypted, refresh_token_encrypted, expires_at)
  values (v_c, 'enc-access-placeholder', 'enc-refresh-placeholder', now() + interval '1 hour');
  perform set_config('test.conn_a', v_c::text, true);
end $$;

-- 1. RLS enabled on connectors
select is(
  (select rowsecurity from pg_tables where schemaname='public' and tablename='connectors'),
  true,
  'RLS enabled on connectors'
);

-- 2. RLS enabled on connector_tokens
select is(
  (select rowsecurity from pg_tables where schemaname='public' and tablename='connector_tokens'),
  true,
  'RLS enabled on connector_tokens'
);

-- 3. Anon cannot read connectors
set local role anon;
select is(
  (select count(*)::int from public.connectors),
  0,
  'anon cannot read connectors'
);
reset role;

-- 4. Anon cannot read connector_tokens
set local role anon;
select is(
  (select count(*)::int from public.connector_tokens),
  0,
  'anon cannot read connector_tokens'
);
reset role;

-- 5. Anon cannot insert connector
set local role anon;
select throws_ok(
  format(
    $q$ insert into public.connectors (workspace_id, provider)
        values (%L::uuid, 'slack') $q$,
    current_setting('test.ws_a')
  ),
  '42501',
  null,
  'anon cannot insert connector'
);
reset role;

-- 6. Anon cannot insert connector_tokens
set local role anon;
select throws_ok(
  format(
    $q$ insert into public.connector_tokens (connector_id, access_token_encrypted)
        values (%L::uuid, 'sneak') $q$,
    current_setting('test.conn_a')
  ),
  '42501',
  null,
  'anon cannot insert connector_tokens'
);
reset role;

-- 7. Workspace member can read own workspace connector metadata
select pg_temp.act_as(current_setting('test.uid_member')::uuid);
set local role authenticated;
select is(
  (select count(*)::int from public.connectors where workspace_id = current_setting('test.ws_a')::uuid),
  1,
  'member reads own workspace connector'
);
reset role;

-- 8. Outsider cannot read connector metadata for foreign workspace
select pg_temp.act_as(current_setting('test.uid_other')::uuid);
set local role authenticated;
select is(
  (select count(*)::int from public.connectors where workspace_id = current_setting('test.ws_a')::uuid),
  0,
  'outsider cannot read foreign workspace connector'
);
reset role;

-- 9. Admin can insert connector for own workspace
select pg_temp.act_as(current_setting('test.uid_admin')::uuid);
set local role authenticated;
select lives_ok(
  format(
    $q$ insert into public.connectors (workspace_id, provider)
        values (%L::uuid, 'slack') $q$,
    current_setting('test.ws_a')
  ),
  'admin can insert connector for own workspace'
);
reset role;

-- 10. Owner can update connector status for own workspace
select pg_temp.act_as(current_setting('test.uid_owner')::uuid);
set local role authenticated;
select lives_ok(
  format(
    $q$ update public.connectors set status = 'revoked'
        where workspace_id = %L::uuid and provider = 'google_calendar' $q$,
    current_setting('test.ws_a')
  ),
  'owner can update connector for own workspace'
);
reset role;

-- 11. Non-admin member cannot insert connector
select pg_temp.act_as(current_setting('test.uid_member')::uuid);
set local role authenticated;
select throws_ok(
  format(
    $q$ insert into public.connectors (workspace_id, provider)
        values (%L::uuid, 'notion') $q$,
    current_setting('test.ws_a')
  ),
  '42501',
  null,
  'non-admin member cannot insert connector'
);
reset role;

-- 12. Non-admin member cannot update connector
select pg_temp.act_as(current_setting('test.uid_member')::uuid);
set local role authenticated;
-- Update returning zero rows must be the behavior — RLS filters the row out
-- of the UPDATE target set. Verify the row stayed as the owner left it.
update public.connectors set status = 'connected'
  where workspace_id = current_setting('test.ws_a')::uuid and provider = 'google_calendar';
reset role;
select is(
  (select status from public.connectors
     where workspace_id = current_setting('test.ws_a')::uuid and provider = 'google_calendar'),
  'revoked',
  'non-admin member update is filtered by RLS (row unchanged)'
);

-- 13. Authenticated workspace owner CANNOT read connector_tokens
select pg_temp.act_as(current_setting('test.uid_owner')::uuid);
set local role authenticated;
select is(
  (select count(*)::int from public.connector_tokens where connector_id = current_setting('test.conn_a')::uuid),
  0,
  'authenticated owner cannot read connector_tokens'
);
reset role;

-- 14. Authenticated workspace owner CANNOT insert/update connector_tokens
select pg_temp.act_as(current_setting('test.uid_owner')::uuid);
set local role authenticated;
select throws_ok(
  format(
    $q$ insert into public.connector_tokens (connector_id, access_token_encrypted)
        values (%L::uuid, 'sneak') $q$,
    current_setting('test.conn_a')
  ),
  '42501',
  null,
  'authenticated owner cannot write connector_tokens'
);
reset role;

select * from finish();
rollback;
