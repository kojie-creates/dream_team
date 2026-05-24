-- RLS smoke tests: public.users_profile
-- Asserts: RLS enabled; self read/update; other users invisible.

create extension if not exists pgtap with schema public;
begin;
select plan(5);

-- helpers (transaction-scoped) -----------------------------------------------
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

-- setup: store UUIDs in transaction-local GUCs so any role can read them.
select set_config('test.uid_a', pg_temp.mk_user('a@x.test')::text, true);
select set_config('test.uid_b', pg_temp.mk_user('b@x.test')::text, true);

-- 1. RLS enabled
select is(
  (select rowsecurity from pg_tables where schemaname='public' and tablename='users_profile'),
  true,
  'RLS enabled on users_profile'
);

-- act as A
select pg_temp.act_as(current_setting('test.uid_a')::uuid);
set local role authenticated;

-- 2. A sees exactly own row
select is(
  (select count(*)::int from public.users_profile),
  1,
  'A sees exactly own users_profile row'
);

-- 3. A can update own display_name
update public.users_profile set display_name = 'Alpha' where id = current_setting('test.uid_a')::uuid;
select is(
  (select display_name from public.users_profile where id = current_setting('test.uid_a')::uuid),
  'Alpha',
  'A can update own display_name'
);

-- 4. A cannot read B's row
select is(
  (select count(*)::int from public.users_profile where id = current_setting('test.uid_b')::uuid),
  0,
  'A cannot read B row'
);

-- 5. A's update of B's row affects 0 rows
with upd as (
  update public.users_profile
     set display_name = 'hack'
   where id = current_setting('test.uid_b')::uuid
   returning 1
)
select is((select count(*)::int from upd), 0, 'A update of B row affects 0 rows');

select * from finish();
rollback;
