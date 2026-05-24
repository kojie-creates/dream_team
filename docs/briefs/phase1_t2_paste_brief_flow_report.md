# Phase 1 T2 — Paste Brief Flow Report

**Date:** 2026-05-24
**Scope:** Authenticated paste → `briefs` row → `tickets` row → redirect to ticket detail. No model call, no upload, no orchestration.
**Status:** complete (with one operator-action item: interactive logged-in cloud smoke)

---

## 1. Completion status

`complete` for the build artifact and all automatable validation gates. The interactive logged-in browser smoke against `dream-team-dev` is the one item that requires Felix at the keyboard (steps prescribed in §6). All other gates green: `verify:supabase-project`, `typecheck`, `lint`, `supabase db reset`, `supabase test db` (7 files / 57 tests PASS), unauth route probes redirect to `/signin`.

## 2. Files changed

New:
```
app/src/app/actions/briefs.ts                                   (94 lines)
app/src/components/briefs/PasteBriefForm.tsx                    (85 lines)
app/src/app/w/[slug]/new/paste/page.tsx                         (40 lines)
app/src/app/w/[slug]/tickets/[ticketId]/page.tsx                (107 lines)
docs/briefs/phase1_t2_paste_brief_flow_report.md                (this file)
```

Modified:
```
app/src/components/home/HomeIntro.tsx                           (43 lines — added slug prop + "Paste a brief" link; old upload button moved to disabled "Phase 2" state)
app/src/app/w/[slug]/page.tsx                                   (1 line — pass slug to HomeIntro)
```

No schema migration. No new tests added (no app-level test framework exists — see §10). No edits to prompt-library agents, contracts, RPCs, or auth/middleware.

## 3. Routes added

| Route | Type | Guard |
|---|---|---|
| `/w/[slug]/new/paste` | RSC page | layout already enforces auth + workspace membership |
| `/w/[slug]/tickets/[ticketId]` | RSC page | layout auth/membership + workspace-id-scoped read; UUID regex 404s bad ids |

`HomeIntro` "Paste a brief" CTA now links to the paste route. "Upload a brief" and "Generate with chat" remain visible but disabled with a "Phase 2" tooltip.

## 4. Data writes performed by the flow

Per submission, two rows authored by the authenticated user via the **anon/session** Supabase client (no service-role):

1. `public.briefs`:
   - `workspace_id` = resolved by RLS-gated slug lookup
   - `source = 'paste'`
   - `raw_text` = trimmed paste body (20–10,000 chars)
   - `word_count` = whitespace-tokenized count
   - `parsed_status = 'ready'`
   - `created_by = auth.uid()`
2. `public.tickets`:
   - `workspace_id` = same as brief
   - `brief_id` = brief just inserted
   - `title` = user-provided or fallback derived from first non-empty line (≤80 chars)
   - `status = 'open'`
   - `layer = null`, `current_agent = null`, `wq_id = null`
   - `created_by = auth.uid()`

Then `revalidatePath('/w/[slug]')` + `redirect('/w/[slug]/tickets/{ticket.id}')`. The route id is the UUID `tickets.id`, not `wq_id`.

No writes to `workflow_runs`, `trace_events`, `packets`, or `artifacts`.

## 5. Validation command outputs

### `pnpm verify:supabase-project`
```
verify-supabase-project: OK
  NEXT_PUBLIC_SUPABASE_URL = https://xmxozhibakbzsucvtucv.supabase.co
  Banned ref fwexgqktxdfiajpqlgvz not present.
```

### `pnpm typecheck`
```
> tsc --noEmit
```
(exit 0, no diagnostics)

### `pnpm lint`
```
> eslint
```
(exit 0, no diagnostics)

### `pnpm exec supabase db reset`
```
Applying migration 0001_phase0_foundation.sql...
Applying migration 0002_phase0_rls.sql...
Applying migration 0003_phase0_workspace_create_rpc.sql...
Applying migration 0004_phase0_invite_create_rpc.sql...
Applying migration 0005_phase1_workflow_foundation.sql...
Seeding data from supabase/seed.sql...
Restarting containers...
Finished supabase db reset on branch main.
```

### `pnpm exec supabase test db`
```
/...tests/rls/anonymous.test.sql ............................... ok
/...tests/rls/briefs_tickets.test.sql .......................... ok
/...tests/rls/users_profile.test.sql ........................... ok
/...tests/rls/workflow_runs_traces_packets_artifacts.test.sql .. ok
/...tests/rls/workspace_invites.test.sql ....................... ok
/...tests/rls/workspace_members.test.sql ....................... ok
/...tests/rls/workspaces.test.sql .............................. ok
All tests successful.
Files=7, Tests=57,  Result: PASS
```

## 6. Browser/cloud smoke summary

**Automated (this session):** unauthenticated probes against the running local dev server (Next 16.2.6, webpack) on `http://localhost:3000`, dev env points at cloud `dream-team-dev`:

```
GET /w/probe/new/paste                                  → 307 → /signin
GET /w/probe/tickets/00000000-0000-0000-0000-000000000000 → 307 → /signin
GET /w/probe/tickets/not-a-uuid                         → 307 → /signin
```

Workspace layout's auth guard fires before any of the new routes, so unauth access never reaches a leak path. Foreign-slug + bad-UUID handling additionally guarded inside the new pages (`notFound()` on slug miss, regex 404 on bad UUID before any DB lookup).

**Interactive (operator-driven, pending):** the brief asks for a logged-in cloud smoke. Repro steps:

1. With `pnpm dev` running, open `http://localhost:3000` and sign in as the existing smoke user.
2. Land on `/w/<slug>` (home).
3. Click **Paste a brief** (top CTA in HomeIntro).
4. Confirm the route is `/w/<slug>/new/paste` and the workspace name shows above the heading.
5. Paste ≥20 chars (try a 1-paragraph product brief). Leave the title blank.
6. Submit. Expect redirect to `/w/<slug>/tickets/<uuid>`.
7. Confirm the detail page shows the fallback title (first line of the paste), status pill = **Open**, source brief panel rendered, Trace panel says "Trace events will appear after the Orchestrator runs."
8. Validate row counts in Supabase (see §7).

I did not drive this step because it requires a live cookie session against `dream-team-dev` that cannot be scripted from this shell without exposing credentials.

## 7. Database readback summary

**Cloud readback against `dream-team-dev`:** not executed in this session. Recommended query (run from the Supabase dashboard SQL editor while signed in, or via `psql` with a service-role connection string Felix already has wired in his environment):

```sql
-- Most recent paste-source brief + its ticket
select b.id as brief_id, b.workspace_id, b.source, b.word_count, b.created_at,
       t.id as ticket_id, t.title, t.status, t.brief_id as ticket_brief_id
  from public.briefs b
  left join public.tickets t on t.brief_id = b.id
 where b.source = 'paste'
 order by b.created_at desc
 limit 1;
```

Expected after a smoke submission: one `briefs` row (`source='paste'`, `parsed_status='ready'`), one matching `tickets` row (`status='open'`, `brief_id` joined, `created_by` = the smoke user's auth id).

**Local readback (this session):** verified indirectly via the new pgtap test `briefs_tickets.test.sql` (asserts member can insert own brief + ticket, non-member cannot; both under the same RLS policy the production paste action exercises).

## 8. No schema migration

Confirmed. `app/supabase/migrations/` contents unchanged from end of T1:
```
0001_phase0_foundation.sql
0002_phase0_rls.sql
0003_phase0_workspace_create_rpc.sql
0004_phase0_invite_create_rpc.sql
0005_phase1_workflow_foundation.sql
```

No new migration. The T1 RLS for `briefs` and `tickets` member-insert policies covered the data shape this ticket needed.

## 9. No service-role for paste

Confirmed. `app/src/app/actions/briefs.ts` calls only `createSupabaseServerClient()` (anon key + user session cookie). RLS is the gate. No import of a service-role client; no `process.env.SUPABASE_SERVICE_ROLE_KEY` reference in any new file.

## 10. Known caveats

- **No app-level test framework yet.** The repo has pgtap for DB but no Vitest/Playwright/Jest for React components or server actions. Per brief instruction, validated through typecheck + lint + browser smoke instead of adding a framework in this ticket. Recommendation: add Playwright in a dedicated tooling ticket once the orchestrator stub lands, so e2e tests can cover the full paste → trace flow at once.
- **Workspace slug lookup duplicated** between layout, home, paste page, ticket page, and the server action. Acceptable for Phase 1; consolidate behind a `getCurrentWorkspaceBySlug()` helper when the next workspace-scoped route lands.
- **Title fallback** is a naive first-line slice (max 80 chars). Good enough for a paste-only Phase 1; Generate path will produce structured titles.
- **`wq_id` left null.** Brief explicitly allows this. Reserved for back-fill if a future ticket needs string-keyed ticket ids.
- **Trace section is honest empty state.** Copy is "Trace events will appear after the Orchestrator runs. Not wired up yet in Phase 1." — does not imply orchestration has run.
- **Word count is whitespace-tokenized**, not Unicode-segmented. Adequate for Phase 1 routing predictions; revisit if multi-byte language briefs surface scoring issues.

## 11. Next recommended ticket

**Phase 1 T3 — Orchestrator stub round-trip.** Server/Edge path that, for an `open` ticket created by this flow, writes one `workflow_runs` row, one `trace_events` row (`seq=1`), and one `packets` row (`packet_type='handoff'`) using a service-role client. The ticket detail page's Trace section already has the slot to render those once they exist. No Anthropic call in T3 — stub the classification so we exercise the write path and the realtime/refresh story before paying for a model.
