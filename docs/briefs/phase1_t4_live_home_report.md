# Phase 1 T4 — Live Workspace Home Report

**Date:** 2026-05-24
**Scope:** Workspace Home (`/w/[slug]`) reads real Phase 1 work — recent briefs, tickets, workflow runs, plus summary counts. No schema, no model, no orchestration.
**Status:** complete (interactive logged-in cloud smoke pending operator — see §6).

---

## 1. Completion status

`complete` for build artifact and all automatable validation gates. Home now RSC-fetches and renders three workspace-scoped lists plus a 4-cell summary strip. Empty states preserved for fresh workspaces. No schema migration, no service-role helper used on this page, no new server action, no Realtime/SSE. Local gates green (§5).

## 2. Files changed

Modified:
```
app/src/app/w/[slug]/page.tsx                  (109 lines)
app/src/components/home/ActivitySections.tsx   (216 lines)
```

New:
```
docs/briefs/phase1_t4_live_home_report.md      (this file)
```

No new component files were spawned — `ActivitySections` keeps the three panel sub-components (`RecentBriefsPanel`, `RecentTicketsPanel`, `RecentRunsPanel`) and the `HomeSummaryStrip` inline as small helpers, per brief guidance ("keep file count reasonable"). No edits to `HomeIntro`, `StarterDomains`, `ConnectorsPanel`, `EmptyPanel`, ticket detail page, auth/middleware, env, supabase clients, migrations, or RLS.

### Readback — first 3 non-empty lines

`app/src/app/w/[slug]/page.tsx` (109 lines):
```
import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { HomeIntro } from '@/components/home/HomeIntro';
```

`app/src/components/home/ActivitySections.tsx` (216 lines):
```
import Link from 'next/link';
import { EmptyPanel } from './EmptyPanel';
export type BriefRow = {
```

## 3. What Home now reads

Through the normal authenticated server Supabase client (`createSupabaseServerClient()`); RLS gates every row.

Per-page queries, parallelized via `Promise.all`:

| Query | Table | Filter | Order / Limit |
|---|---|---|---|
| Workspace by slug | `workspaces` | `slug = :slug` | `maybeSingle()` |
| Recent briefs | `briefs` | `workspace_id` | `created_at desc`, 5 |
| Recent tickets | `tickets` | `workspace_id` | `updated_at desc`, 5 |
| Recent runs | `workflow_runs` | `workspace_id` | `started_at desc`, 5 |
| Open ticket count | `tickets` | `workspace_id`, `status='open'` | `count: exact, head: true` |
| Done ticket count | `tickets` | `workspace_id`, `status='done'` | `count: exact, head: true` |
| Total brief count | `briefs` | `workspace_id` | `count: exact, head: true` |

A follow-up query fetches `tickets(id, title)` for the union of `ticket_id`s on the recent runs so each run row can render its ticket title. Single round-trip via `.in('id', ticketIds)`, only fires if `runsRaw.length > 0`. No PostgREST relation inference; explicit lookup avoided generated-types churn.

Render surfaces:

- **HomeSummaryStrip** — 4 cells: Open tickets, Done tickets, Total briefs, Latest run status (string from the newest workflow run, or `—`).
- **Recent briefs panel** — list of 5 with `source` chip, `word_count`, short `raw_text` preview (≤120 chars, whitespace-flattened), and date.
- **Tickets panel** — list of 5, each row is a `<Link href="/w/[slug]/tickets/[id]">` with status pill, truncated title, `layer`, `current_agent`, and date.
- **Workflow runs panel** — list of 5, each row links to its ticket detail page; shows status pill, ticket title (or `id[0..8]` fallback), `run_kind`, `agent_id`, `model`, and start date.

Status pill reuses the same tone palette as the ticket detail page (no shared component extracted to keep file count low; brief explicitly permits).

## 4. Empty-state behavior

- Workspace missing → `notFound()` (unchanged).
- Any panel with zero rows falls back to the existing `EmptyPanel` with its original hint copy. No misleading "ran successfully" framing.
- Summary cells render `0` when counts come back as `0`/`null` and `—` for `latestRunStatus` when no runs exist.
- Marketing hero never appears; HomeIntro, StarterDomains, ConnectorsPanel, and the "Paste a brief" CTA are preserved untouched.

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
Files=7, Tests=57, Result: PASS
```

## 6. Browser/cloud smoke summary

**Automated (this session):** none beyond build gates. The new RSC reads require an authenticated cookie session against `dream-team-dev`; not safely scriptable from this shell without exposing credentials.

**Interactive (operator-driven, pending) — repro:**

1. `pnpm dev` → `http://localhost:3000`, sign in as smoke user.
2. Open `/w/<slug>` for a workspace that has at least one paste-flow brief + Orchestrator-stub run from T2/T3.
3. Confirm above the connectors panel:
   - **Summary strip:** 4 cells with non-zero counts where data exists; latest-run status reads `done` (stub result).
   - **Recent briefs:** at least one row with `paste` chip, word count, preview, date.
   - **Tickets:** at least one row, status pill = `done` (or whatever current status), title link clickable.
   - **Workflow runs:** at least one row reading `orchestrator · central-orchestrator · stub` with status `done`.
4. Click any ticket title or any run row → lands on `/w/<slug>/tickets/<uuid>` (existing detail page, untouched).
5. Click `Paste a brief`, submit a new brief, return to `/w/<slug>` → new rows appear in briefs + tickets panels; counts increment.
6. (Optional) Sign into a different workspace where you are not a member → RLS hides every list (panels show their empty hints; summary cells read 0).

Limitation: cannot drive a logged-in browser from this shell. Existing cloud smoke rows from T2/T3 already satisfy the data prerequisites for §1–5 of the repro above.

## 7. No schema migration

Confirmed. `app/supabase/migrations/` is byte-identical to T3:
```
0001_phase0_foundation.sql
0002_phase0_rls.sql
0003_phase0_workspace_create_rpc.sql
0004_phase0_invite_create_rpc.sql
0005_phase1_workflow_foundation.sql
```

## 8. No service-role path

Confirmed. `app/src/app/w/[slug]/page.tsx` imports only `createSupabaseServerClient` (anon + session cookie). No reference to `createSupabaseServiceRoleClient`, `SUPABASE_SERVICE_ROLE_KEY`, or any service-role helper. RLS is the sole gate for every read.

## 9. Known caveats

- **No generated Supabase TS types yet.** `select()` returns `unknown`-ish rows; the page narrows via local `as` casts at the boundary (`BriefRow`, `TicketRow`, etc.) so component props stay strict. Per brief, did not introduce generated types in this ticket.
- **Workflow-run → ticket-title join is a second query, not a PostgREST embed.** Cheaper than fighting relation inference without generated types; one extra round-trip when there are runs. Acceptable at 5 rows.
- **Tickets ordered by `updated_at desc`.** This matches the existing `tickets_workspace_status_updated_idx` and lets a just-stub-completed ticket float to the top; brief allows `created_at` or `updated_at`.
- **Status pill duplicated** between ticket detail page and Home. Extraction deferred — exactly two callsites, both small. A `components/tickets/StatusPill.tsx` extraction is a clean follow-up.
- **Date format is short (`Mon DD`).** Full timestamp lives on the ticket detail page; Home prioritizes scan-ability.
- **Preview text is whitespace-flattened to a single line.** Matches operator-surface density; readers needing the full text click into the ticket.
- **Counts are three extra `head: true` queries.** Could be derived from fetched rows for `briefs`/`tickets` since limit=5, but separate counts give the truthful totals across the workspace, not just "of the 5 shown" — chose correctness over query economy at this scale.
- **No Realtime.** Refresh is navigation-driven; matches Phase 1 architecture brief intent.

## 10. Next recommended ticket

**Phase 1 T5 — Phase 1 acceptance pass.** End-to-end interactive verification from sign-in → paste brief → ticket detail → Orchestrator stub click → trace render → back to Home → confirm new rows present, summary counts correct, ticket link round-trips. Likely includes a one-line cleanup ticket to add `server-only` to `lib/supabase/service.ts` (carried forward from T3 §13) and the extraction of a shared `StatusPill` component (this ticket §9).
