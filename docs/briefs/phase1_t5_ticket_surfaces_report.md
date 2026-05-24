# Phase 1 T5 — Ticket List + Detail Polish Report

**Date:** 2026-05-24
**Scope:** Ticket list route `/w/[slug]/tickets` with URL-driven status filter chips; ticket detail polish (breadcrumb, brief metadata, payload `<details>` fallback, back-to-tickets link); shared `StatusPill` extracted.
**Status:** complete (interactive logged-in cloud smoke pending operator — see §6).

---

## 1. Completion status

`complete` for build artifact and all automatable validation gates. New list route with 7 filter chips (All + 6 statuses), per-status counts, 50-row cap notice. Ticket detail page now breadcrumbs through `Workspace · Tickets · Ticket`, shows brief metadata when present, renders payload `<details>` block when summary keys are absent, and exposes a second back-link. `ActivitySections` tickets panel gets a `View all →` link. `StatusPill` extracted to `components/tickets/StatusPill.tsx`, consumed from both the detail page and the home panels.

No schema migration, no service-role on this surface, no new dependency, no new server action, no Realtime, no orchestration behavior changes. Local gates green (§5).

## 2. Files changed

New:
```
app/src/components/tickets/StatusPill.tsx        (41 lines)
app/src/app/w/[slug]/tickets/page.tsx            (172 lines)
docs/briefs/phase1_t5_ticket_surfaces_report.md  (this file)
```

Modified:
```
app/src/app/w/[slug]/tickets/[ticketId]/page.tsx (243 lines)
app/src/components/home/ActivitySections.tsx     (202 lines)
```

No new dependencies. No migration files touched. No edits to auth/middleware, RLS, service-role helper, server actions, env, or any prompt-library/contracts files.

### Readback — first 3 non-empty lines

`app/src/components/tickets/StatusPill.tsx` (41 lines):
```
const STATUS_TONE: Record<string, string> = {
  open: 'bg-neutral-800 text-neutral-200',
  in_progress: 'bg-sky-950 text-sky-200',
```

`app/src/app/w/[slug]/tickets/page.tsx` (172 lines):
```
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
```

`app/src/app/w/[slug]/tickets/[ticketId]/page.tsx` (243 lines):
```
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
```

`app/src/components/home/ActivitySections.tsx` (202 lines):
```
import Link from 'next/link';
import { EmptyPanel } from './EmptyPanel';
import { StatusPill } from '@/components/tickets/StatusPill';
```

## 3. New routes + guards

| Route | Type | Guard |
|---|---|---|
| `/w/[slug]/tickets` | RSC page | layout enforces auth + workspace membership; RLS-gated workspace lookup + ticket list query; invalid `?status=` falls back to `all` via local allowlist |

`searchParams` typed as `Promise<{ status?: string | string[] }>` per Next 16 conventions. Workspace miss → `notFound()`. No new middleware. No new actions.

## 4. What changed on existing surfaces

### `/w/[slug]/tickets/[ticketId]`

- Header breadcrumb: `<workspace> · Tickets · Ticket` with `workspace` and `Tickets` as `<Link>`s.
- Brief metadata line under title (when `ticket.brief_id` resolved): `From brief · paste · 142 words · May 24`. Brief select widened to include `created_at`.
- Trace event row body: when `payloadSummary` returns null and `payload` has keys, renders a `<details><summary>payload</summary><pre>{JSON.stringify}</pre></details>` block. Existing summary path untouched.
- Bottom navigation row: `← Back to tickets` (new) + `← Back to <workspace>` (existing).
- Inline `StatusPill` definition removed; now imported from `components/tickets/StatusPill.tsx`.

### `ActivitySections`

- Imports shared `StatusPill`. Local pill definition removed (~12 lines deleted).
- `RecentTicketsPanel` header now an `<header className="flex items-baseline justify-between">` with a `View all →` `<Link>` to `/w/[slug]/tickets`. Empty-state path untouched.
- All pill callsites pass `size="xs"` to preserve prior density.

### `StatusPill` (shared)

- Two size variants: `xs` (used in Home panels) and `sm` (default, used in detail header). Same tone palette as before (no new colors). Adds `Pending`/`Running` labels for workflow_run statuses (previously bare strings).

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

**Automated (this session):** none beyond build gates. The new list + polished detail page require an authenticated cookie session against `dream-team-dev`; not safely scriptable from this shell without exposing credentials.

**Interactive (operator-driven, pending) — repro:**

1. `pnpm dev` → `http://localhost:3000`, sign in as smoke user.
2. From `/w/<slug>`, click `View all →` in the Tickets panel → lands on `/w/<slug>/tickets`.
3. Confirm:
   - Breadcrumb `<workspace> · Tickets` at top.
   - Heading `Tickets` + "N shown" subtitle.
   - 7 filter chips (All / Open / In progress / Needs input / Done / Failed / Looped) with counts.
   - Active chip is the bright `All` chip by default.
4. Click `Done` → URL becomes `/w/<slug>/tickets?status=done`, active chip flips, list filters; if zero matches, empty copy reads "No tickets with status 'Done' yet."
5. Click `All` → URL strips the param.
6. Click any ticket row → detail page.
7. Confirm detail:
   - Breadcrumb has `<workspace>` (link) · `Tickets` (link) · `Ticket`.
   - Brief metadata line below header reads `From brief · paste · N words · <date>`.
   - On a ticket where the stub ran: the existing `orchestrator_stub.classified` event still shows its keyed summary; if any event lacks summary keys but has payload, a clickable `payload` `<details>` block now renders the JSON.
   - Bottom row shows both `← Back to tickets` and `← Back to <workspace>` links.
8. Unauth probe: `curl -sI http://localhost:3000/w/probe/tickets` → expect `307` to `/signin`.

Limitation: shell cannot drive a logged-in browser. Existing cloud smoke rows from T2/T3 satisfy data prerequisites.

## 7. No schema migration

Confirmed. `app/supabase/migrations/` byte-identical to T4:
```
0001_phase0_foundation.sql
0002_phase0_rls.sql
0003_phase0_workspace_create_rpc.sql
0004_phase0_invite_create_rpc.sql
0005_phase1_workflow_foundation.sql
```

## 8. No service-role path on this surface

Confirmed. `tickets/page.tsx` imports only `createSupabaseServerClient`. No reference to `createSupabaseServiceRoleClient`, `SUPABASE_SERVICE_ROLE_KEY`, or the `lib/supabase/service.ts` helper. The polished detail page still imports only the session client (unchanged from T3). RLS is the sole gate.

## 9. No new dependency

Confirmed. `app/package.json` untouched. No new entries in `pnpm-lock.yaml`.

## 10. Known caveats

- **Count fan-out:** the list page issues 1 row query + 7 head-count queries in parallel. Acceptable at Phase 1 scale; revisit when ticket counts go non-trivial or when pagination ships.
- **No pagination yet:** 50-row cap is honest; UI shows a note when the cap is hit. Pagination deferred per brief scope.
- **No `created_at` filter or date range** on the list. Brief scope only required status chips.
- **Brief metadata line is single-line, no link to a brief surface.** No brief detail route exists yet, so the line is pure metadata; the raw text still renders below.
- **`<details>` block uses native HTML disclosure**, not a custom expander. No animations; deliberate operator-surface minimalism.
- **`StatusPill` now covers 8 statuses** (6 ticket + 2 workflow_run). Unrecognized statuses still render with neutral tone and raw label.
- **Counts query duplication:** the list page and Home now both compute open/done ticket counts independently. Acceptable until a shared helper proves necessary.

## 11. Next recommended ticket

**Phase 1 T6 — Phase 1 acceptance pass.** End-to-end interactive verification: sign-in → workspace home → paste brief → ticket detail → Orchestrator stub click → trace render → return to ticket list → filter by `Done` → confirm ticket appears → return to Home → confirm summary counts incremented. Produces a written acceptance report plus a short demo script suitable for a stakeholder walkthrough. Exit criterion for Phase 1 before Phase 2 begins wiring the real model API.
