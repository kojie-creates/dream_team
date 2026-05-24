-- RLS smoke tests: anonymous (anon role) cannot read or write any Phase 0 table.

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

-- Seed: a workspace + invite owned by user A so there is data to (not) leak.
select set_config('test.uid_a', pg_temp.mk_user('a@anon.test')::text, true);

do $$
declare v_id uuid;
begin
  insert into public.workspaces (slug, name, created_by)
  values ('ws-anon', 'Anon Workspace', current_setting('test.uid_a')::uuid)
  returning id into v_id;
  perform set_config('test.ws', v_id::text, true);
end $$;

insert into public.workspace_invites (workspace_id, email, role, token_hash, invited_by, expires_at)
values (
  current_setting('test.ws')::uuid,
  'someone@anon.test',
  'member',
  encode(extensions.digest('anon-tok-' || gen_random_uuid()::text, 'sha256'), 'hex'),
  current_setting('test.uid_a')::uuid,
  now() + interval '7 days'
);

-- Switch to anon role.
set local role anon;

-- 1-4: anon reads return zero rows (RLS hides everything).
select is((select count(*)::int from public.users_profile),     0, 'anon cannot read users_profile');
select is((select count(*)::int from public.workspaces),        0, 'anon cannot read workspaces');
select is((select count(*)::int from public.workspace_members), 0, 'anon cannot read workspace_members');
select is((select count(*)::int from public.workspace_invites), 0, 'anon cannot read workspace_invites');

-- 5-8: anon writes are denied (42501 — RLS violation).
select throws_ok(
  $sql$ insert into public.users_profile (id) values (gen_random_uuid()) $sql$,
  '42501', null, 'anon insert into users_profile denied'
);

select throws_ok(
  $sql$ insert into public.workspaces (slug, name, created_by) values ('x','x',gen_random_uuid()) $sql$,
  '42501', null, 'anon insert into workspaces denied'
);

select throws_ok(
  format(
    $sql$ insert into public.workspace_members (workspace_id, user_id, role) values (%L::uuid, gen_random_uuid(), 'member') $sql$,
    current_setting('test.ws')
  ),
  '42501', null, 'anon insert into workspace_members denied'
);

select throws_ok(
  format(
    $sql$ insert into public.workspace_invites (workspace_id, email, role, token_hash, invited_by, expires_at)
          values (%L::uuid, 'x@x.test', 'member', 'deadbeef', gen_random_uuid(), now() + interval '1 day') $sql$,
    current_setting('test.ws')
  ),
  '42501', null, 'anon insert into workspace_invites denied'
);

reset role;
select * from finish();
rollback;
