-- Security hardening, follow-up to 0009. Completes the EXECUTE-revoke that 0009
-- missed: Supabase's default privileges grant EXECUTE to anon/authenticated
-- EXPLICITLY per role on every new public function (not via PUBLIC), so 0009's
-- `revoke ... from public` was a no-op for the trigger functions, and a lone
-- `revoke ... from anon` left rls_auto_enable's PUBLIC grant intact. This revokes
-- the actual grant holders, clearing lints 0028/0029 for these functions.
--
-- Safety: trigger functions execute via the trigger mechanism regardless of any
-- role's EXECUTE privilege (verified empirically against this DB: with EXECUTE
-- revoked from public/anon/authenticated, a member UPDATE still fired
-- set_updated_at and advanced updated_at). postgres (owner) + service_role retain
-- EXECUTE, so server-side paths are unaffected. No behavior change.

-- Trigger functions — no client role needs (or should hold) EXECUTE.
revoke execute on function public.set_updated_at() from anon, authenticated;
revoke execute on function public.handle_new_user() from anon, authenticated;
revoke execute on function public.handle_new_workspace() from anon, authenticated;

-- rls_auto_enable — utility, not user-callable. Held via PUBLIC + explicit
-- authenticated; drop both (anon is covered by the PUBLIC revoke).
revoke execute on function public.rls_auto_enable() from public, authenticated;
