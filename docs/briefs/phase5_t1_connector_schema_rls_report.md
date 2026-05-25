# Phase 5 T1 — Connector Schema and RLS — Report

Date: 2026-05-24
Status: COMPLETE

## Summary

Added the database foundation for workspace-scoped connectors. Two new tables
(`connectors`, `connector_tokens`), workspace-isolated RLS on metadata, and a
fully locked-down token vault accessible only to the service role. No OAuth,
no provider calls, no UI surface in this ticket.

## Files Changed

- `app/supabase/migrations/0006_phase5_connectors.sql` — new migration (tables,
  indexes, triggers, RLS policies).
- `app/supabase/tests/rls/connectors.test.sql` — new pgtap suite, 14 assertions.
- `app/src/lib/connectors/types.ts` — provider/status unions + display labels
  shared with the upcoming T2 settings UI. No runtime behavior.

## Tables Added

### `public.connectors`
Workspace-scoped metadata for each provider integration.

Columns: `id`, `workspace_id`, `provider`, `status`, `scopes`, `connected_by`,
`connected_at`, `last_sync_at`, `last_error`, `created_at`, `updated_at`.

Constraints:
- `provider` in `('google_calendar','google_drive','gmail','google_sheets','slack','notion')`
- `status` in `('disconnected','connecting','connected','error','revoked')`
- `unique (workspace_id, provider)`

Indexes: `(workspace_id, provider)`, `(workspace_id, status)`.

Trigger: `set_updated_at` on update (reuses Phase 0 helper).

### `public.connector_tokens`
Server-only token vault keyed 1:1 by `connector_id`.

Columns: `connector_id` (PK + FK cascade), `access_token_encrypted`,
`refresh_token_encrypted`, `expires_at`, `token_type`, `provider_account_id`,
`provider_account_email`, `created_at`, `updated_at`.

Trigger: `set_updated_at` on update.

## RLS Policy Summary

`connectors` — RLS enabled. Policies:
- `connectors_member_select` — any workspace member can read metadata for that
  workspace (`is_workspace_member(workspace_id)`).
- `connectors_admin_insert` — `owner`/`admin` only
  (`has_workspace_role(workspace_id, array['owner','admin'])`).
- `connectors_admin_update` — `owner`/`admin` only, with same `WITH CHECK`.
- No client delete policy. Disconnect flips `status` to `revoked` or
  `disconnected` via the admin update policy.

`connector_tokens` — RLS enabled. **Intentionally zero policies** for `anon`
and `authenticated`. All reads and writes go through service-role server
code, which bypasses RLS. Authenticated workspace owners cannot read or write
token rows from the browser client.

## Token Boundary Summary

- Token columns named `*_encrypted` make the at-rest expectation explicit.
- Encryption layer is **out of scope for T1**; columns currently accept any
  text. Until the encryption layer ships in a later ticket, real provider
  tokens must not be written to these columns — service-role code should
  store only `null` or opaque placeholder strings.
- Client SDK with the anon key cannot see `connector_tokens` at all (RLS deny
  by absence-of-policy), and any write attempt raises `42501`.
- This matches the brief's stop condition: token material is unreadable by
  anon and authenticated, RLS tests passed without weakening any existing
  policy, and no OAuth / provider calls were introduced.

## Test Assertions Added

`app/supabase/tests/rls/connectors.test.sql` — 14 tests:

1. RLS enabled on `connectors`.
2. RLS enabled on `connector_tokens`.
3. `anon` cannot read `connectors` (count 0).
4. `anon` cannot read `connector_tokens` (count 0).
5. `anon` cannot insert into `connectors` — raises `42501`.
6. `anon` cannot insert into `connector_tokens` — raises `42501`.
7. Workspace member reads own workspace's connector metadata.
8. Outsider cannot read foreign workspace's connector metadata.
9. Workspace admin inserts a connector for own workspace.
10. Workspace owner updates a connector for own workspace.
11. Non-admin member cannot insert a connector — raises `42501`.
12. Non-admin member's update is filtered out by RLS (row stays as owner left
    it). PostgREST/postgres returns success with zero affected rows for RLS
    `USING`-filtered updates, so this is asserted by reading back the value.
13. Authenticated workspace owner cannot read `connector_tokens` (count 0).
14. Authenticated workspace owner cannot insert into `connector_tokens` —
    raises `42501`.

## Validation Output

`pnpm verify:supabase-project`:
```
verify-supabase-project: OK
  NEXT_PUBLIC_SUPABASE_URL = https://xmxozhibakbzsucvtucv.supabase.co
  Banned ref fwexgqktxdfiajpqlgvz not present.
```

`pnpm typecheck` — exit 0, no errors.

`pnpm lint` — exit 0, no errors.

`pnpm exec supabase db reset` — all six migrations applied cleanly, including
`0006_phase5_connectors.sql`.

`pnpm exec supabase test db` — final line:

```
Files=8, Tests=73,  0 wallclock secs ( 0.07 usr  0.01 sys +  0.06 cusr  0.06 csys =  0.20 CPU)
Result: PASS
```

The pgtap baseline was 59 tests (7 files) before this ticket; the connectors
suite added 14 tests in a new file, taking the totals to 8 files / 73 tests.

## Caveats and Non-Claims

- No OAuth flow, no provider HTTP, no token storage code is included here.
- The `*_encrypted` columns are plain `text` — encryption-at-rest is a
  deliberate follow-up. Until that lands, real provider secrets must not be
  written into these columns by any code path.
- No service-role helper RPCs were added. The brief allowed adding them only
  if required by tests; tests passed without them.
- No client delete policy on `connectors`. If a future ticket needs hard
  delete it must add a policy or use the service role.
- `connector_tokens` has triggers (`set_updated_at`) but no client policies;
  the trigger runs under the writing role, which for now will always be the
  service role.
- This ticket does not modify any existing migration, RLS policy, helper
  function, or test.

## Next Recommended Ticket

Phase 5 T2 — Connector Settings Surface. The UI tile grid and disconnect /
status surface in workspace settings, consuming `public.connectors` via the
member select policy and using `CONNECTOR_PROVIDERS` / `CONNECTOR_STATUS_LABELS`
from `src/lib/connectors/types.ts`. Still no OAuth — that lands in T3.
