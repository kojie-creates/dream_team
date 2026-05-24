-- RLS smoke tests: public.workspace_invites + accept_invite RPC.
-- Asserts: RLS enabled; admin/owner read; non-admin blocked; accept_invite happy path;
-- reuse and expiry fail safely.

create extension if not exists pgtap with schema public;
begin;
select plan(9);

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

select set_config('test.uid_a', pg_temp.mk_user('a@wi.test')::text, true);  -- owner
select set_config('test.uid_b', pg_temp.mk_user('b@wi.test')::text, true);  -- invitee
select set_config('test.uid_c', pg_temp.mk_user('c@wi.test')::text, true);  -- outsider

do $$
declare v_id uuid;
begin
  insert into public.workspaces (slug, name, created_by)
  values ('ws-i', 'WI Workspace', current_setting('test.uid_a')::uuid)
  returning id into v_id;
  perform set_config('test.ws', v_id::text, true);
end $$;

-- Create a valid and an expired invite as postgres (bypass RLS).
select set_config('test.tok_ok', 'tok-ok-' || gen_random_uuid()::text, true);
select set_config('test.tok_exp', 'tok-exp-' || gen_random_uuid()::text, true);

insert into public.workspace_invites (workspace_id, email, role, token_hash, invited_by, expires_at)
values (
  current_setting('test.ws')::uuid,
  'b@wi.test',
  'member',
  encode(extensions.digest(current_setting('test.tok_ok'), 'sha256'), 'hex'),
  current_setting('test.uid_a')::uuid,
  now() + interval '7 days'
);

insert into public.workspace_invites (workspace_id, email, role, token_hash, invited_by, expires_at)
values (
  current_setting('test.ws')::uuid,
  'b@wi.test',
  'member',
  encode(extensions.digest(current_setting('test.tok_exp'), 'sha256'), 'hex'),
  current_setting('test.uid_a')::uuid,
  now() - interval '1 day'
);

-- 1. RLS enabled
select is(
  (select rowsecurity from pg_tables where schemaname='public' and tablename='workspace_invites'),
  true,
  'RLS enabled on workspace_invites'
);

-- 2. Owner A sees both invites
select pg_temp.act_as(current_setting('test.uid_a')::uuid);
set local role authenticated;
select is(
  (select count(*)::int from public.workspace_invites where workspace_id = current_setting('test.ws')::uuid),
  2,
  'owner A sees both invites'
);
reset role;

-- 3. Outsider C cannot see invites
select pg_temp.act_as(current_setting('test.uid_c')::uuid);
set local role authenticated;
select is(
  (select count(*)::int from public.workspace_invites where workspace_id = current_setting('test.ws')::uuid),
  0,
  'outsider C cannot see invites'
);
reset role;

-- 4. accept_invite happy path — B accepts the valid token and becomes a member.
select pg_temp.act_as(current_setting('test.uid_b')::uuid);
set local role authenticated;
select public.accept_invite(current_setting('test.tok_ok'));
reset role;
select is(
  (select count(*)::int from public.workspace_members
     where workspace_id = current_setting('test.ws')::uuid
       and user_id = current_setting('test.uid_b')::uuid),
  1,
  'accept_invite created workspace_members row for B'
);

-- 5. accept_invite marks the invite accepted
select isnt(
  (select accepted_at from public.workspace_invites
     where token_hash = encode(extensions.digest(current_setting('test.tok_ok'), 'sha256'), 'hex')),
  null,
  'accept_invite stamped accepted_at'
);

-- 6. Reused token fails
select pg_temp.act_as(current_setting('test.uid_b')::uuid);
set local role authenticated;
select throws_ok(
  format($q$ select public.accept_invite(%L) $q$, current_setting('test.tok_ok')),
  null,
  null,
  'reusing accepted token raises'
);
reset role;

-- 7. Expired token fails
select pg_temp.act_as(current_setting('test.uid_b')::uuid);
set local role authenticated;
select throws_ok(
  format($q$ select public.accept_invite(%L) $q$, current_setting('test.tok_exp')),
  null,
  null,
  'expired token raises'
);
reset role;

-- 8. Owner A can create an invite via create_workspace_invite RPC.
select pg_temp.act_as(current_setting('test.uid_a')::uuid);
set local role authenticated;
select lives_ok(
  format(
    $q$ select public.create_workspace_invite(%L::uuid, 'newhire@wi.test', 'member', repeat('a', 64), now() + interval '7 days') $q$,
    current_setting('test.ws')
  ),
  'owner A can create_workspace_invite'
);
reset role;

-- 9. Non-member C cannot create an invite for that workspace.
select pg_temp.act_as(current_setting('test.uid_c')::uuid);
set local role authenticated;
select throws_ok(
  format(
    $q$ select public.create_workspace_invite(%L::uuid, 'sneak@wi.test', 'member', repeat('b', 64), now() + interval '7 days') $q$,
    current_setting('test.ws')
  ),
  '42501',
  null,
  'non-member C cannot create_workspace_invite'
);
reset role;

select * from finish();
rollback;
