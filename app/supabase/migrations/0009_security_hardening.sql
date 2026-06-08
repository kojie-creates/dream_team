-- Security hardening — clears database-linter WARNs on pre-existing functions.
-- Source: get_advisors(security) 2026-06-07. Grants + one search_path pin only;
-- NO schema, data, or RPC-contract change. Behavior is identical for every legit
-- caller (triggers fire in owner context; authenticated keeps its explicit grants).
--
-- 1. set_updated_at: pin search_path='' (lint 0011 function_search_path_mutable).
--    The body touches only now() (pg_catalog), so an empty search_path is safe.
-- 2. Trigger functions never need EXECUTE granted to a client role — a trigger fires
--    in the table-owner's context regardless of grants. Revoke the default PUBLIC
--    execute so anon/authenticated cannot invoke them as REST RPCs
--    (lints 0028/0029 *_security_definer_function_executable).
-- 3. SECURITY DEFINER RPC + RLS-helper functions: revoke anon EXECUTE. No anon code
--    path uses them — every member policy is `to authenticated` (verified), and each
--    RPC guards auth.uid(). The explicit `authenticated` grant from earlier migrations
--    is retained, so app behavior is unchanged. (Lint 0029 for authenticated remains
--    by design: these RPCs/helpers are meant to be callable by signed-in users.)
--
-- NOT addressed here (deliberate):
--   - citext-in-public (lint 0014): citext backs workspaces.slug and
--     workspace_invites.email; relocating a live, column-backing extension is high
--     risk for a cosmetic warn. Skipped.
--   - leaked-password protection (auth): a project Auth setting, not SQL — enable in
--     the Supabase dashboard (Authentication → Providers → Password).

-- 1 -- pin search_path on the one mutable trigger function ----------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- 2 -- trigger functions: no client role needs EXECUTE -------------------------
-- NOTE: revoke-from-public is INSUFFICIENT here — Supabase default privileges grant
-- EXECUTE to anon/authenticated explicitly per role, not via PUBLIC. Completed in
-- migration 0010 (revoke from anon, authenticated). Kept as-applied for provenance.
revoke execute on function public.set_updated_at() from public;
revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_workspace() from public;

-- 3 -- definer RPCs + RLS helpers: drop anon, keep explicit authenticated grant -
revoke execute on function public.is_workspace_member(uuid) from anon;
revoke execute on function public.has_workspace_role(uuid, text[]) from anon;
revoke execute on function public.create_workspace(text, text) from anon;
revoke execute on function public.create_workspace_invite(uuid, text, text, text, timestamptz) from anon;
revoke execute on function public.accept_invite(text) from anon;
revoke execute on function public.append_trace_event(uuid, uuid, text, text, text, jsonb) from anon;
revoke execute on function public.rls_auto_enable() from anon;
