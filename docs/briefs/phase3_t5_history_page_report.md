# Phase 3 T5 — History Page Report

**Date:** 2026-05-24
**Repo:** C:\Users\felix\Desktop\dream_team
**App root:** C:\Users\felix\Desktop\dream_team\app

---

## 1. Completion status

**PASS (code gates).** Signed-in browser walk pending Felix.

Phase 3 T1 History skeleton replaced with a real read-only, RLS-gated, workspace-wide timeline that merges six source tables (tickets, briefs, workflow_runs, trace_events, packets, artifacts) into a single reverse-chronological list with per-source-kind filtering. No schema change, no model call, no service-role bypass, no new dependency.

## 2. Files changed

Modified:
- `app/src/app/w/[slug]/history/page.tsx` — full rewrite. Workspace lookup unchanged (`workspaces` by slug, `notFound()` on miss). Six parallel RLS-gated reads (`tickets`, `briefs`, `workflow_runs`, `trace_events`, `packets`, `artifacts`), each capped at 50 rows. Builds a typed `HistoryItem[]`, merges, sorts by `timestamp` desc, slices to 50. Renders header, summary strip (shown count, latest activity, per-source cap, source list), kind-filter chip nav with counts, timeline list with kind pill / title / subtitle / timestamp / ticket link, honest empty state.

No other files touched. Nav `History` item from T1 already covers `${base}/history`, so no `WorkspaceNav` change. No new component, no library, no migration.

## 3. Routes

- `/w/[slug]/history` (existing route, real implementation)
- `/w/[slug]/history?kind=all|tickets|briefs|runs|trace|packets|artifacts` (kind filter via query param)

Auth posture inherited from the workspace layout guard (same as T2/T3/T4). Unknown workspace ⇒ `notFound()`. Unknown `kind` query param falls back to `all` (no 404).

## 4. Data sources queried

| Source table | Columns selected | Order | Cap | Notes |
|---|---|---|---|---|
| `tickets` | `id, title, status, layer, current_agent, updated_at` | `updated_at desc` | 50 | Doubles as a title lookup map for runs / trace / packets / artifacts |
| `briefs` | `id, source, word_count, raw_text, created_at` | `created_at desc` | 50 | `raw_text` truncated to 140 chars in subtitle |
| `workflow_runs` | `id, ticket_id, run_kind, agent_id, model, status, started_at` | `started_at desc` | 50 | |
| `trace_events` | `id, ticket_id, seq, event_type, from_agent, to_agent, created_at` | `created_at desc` | 50 | `payload` not fetched (avoid bloat) |
| `packets` | `id, ticket_id, packet_type, body_parsed, created_at` | `created_at desc` | 50 | `body_raw` not fetched (avoid bloat) |
| `artifacts` | `id, ticket_id, kind, mime_type, bytes, created_at` | `created_at desc` | 50 | `storage_path` not surfaced |

One follow-up read: ticket-title backfill for `ticket_id`s referenced by runs / trace / packets / artifacts that aren't already in the top-50 ticket result (single `.in('id', missingIds)` query). Skipped when none missing.

All queries go through `createSupabaseServerClient()` (session client, RLS-enforced). No `service_role` use anywhere on this route.

## 5. Query limits

- Per source: 50 rows (`LIMIT_PER_SOURCE`).
- Combined merged timeline: capped at 50 items (`TOTAL_CAP`).
- Per-source counts displayed on filter chips reflect items in the pre-cap merged pool (so counts can sum to >50 — they show how many candidates exist before the timeline cap).
- No raw packet bodies, no raw artifact bodies, no large `payload` blobs read.

## 6. UI behavior

- **Header**: workspace eyebrow (links Home), `History`, subtitle "Recent workspace activity across briefs, tickets, runs, and evidence. Read-only."
- **Summary strip** (4 cells): Shown count, Latest activity (formatted timestamp or `—`), Per-source cap (50), Sources line listing the six tables.
- **Filter chips**: `All`, `Tickets`, `Briefs`, `Runs`, `Trace`, `Packets`, `Artifacts` — each with a count. Active chip styled the same way as `tickets/page.tsx` (inverted: dark text on neutral-100). Clicking sets `?kind=…`; `All` clears the param.
- **Timeline list**: one row per item, dense:
  - kind pill (color-coded per item kind, monospace, uppercase)
  - title (item-specific — e.g. `orchestrator.classified (#1)` for trace, `specialist run — <ticket title>` for runs, `Brief submitted (paste)` for briefs)
  - subtitle (status/agent/model for runs; `from → to · <ticket title>` for trace; preview text for briefs; etc.)
  - timestamp (right-aligned, short locale string)
  - whole row is a `<Link>` to the related ticket detail page when `ticket_id` exists; otherwise a non-link card (only briefs and orphan artifacts).
- **Footer note**: per-source and total caps, plus an explicit "RLS-gated session reads only — no service-role bypass."
- Existing `WorkspaceNav` highlights `History` on both `/history` and `/history?kind=…` (match uses `${base}/history` prefix).

## 7. Empty state behavior

Visible only when the merged + filtered + capped set is empty. Renders a dashed-border card with copy:

> No activity yet. Submit a brief from **Paste** or **Upload** to start the loop.

Both `Paste` and `Upload` link to existing routes (`/w/[slug]/new/paste`, `/w/[slug]/new/upload`). When a filter is active and matches zero items but other items exist (e.g., `?kind=artifacts` with no artifacts), the same empty card renders — the filter chip counts above make the cause obvious without extra copy.

## 8. Browser / curl smoke

Dev server (`pnpm dev`, webpack) running on `http://localhost:3000`. Unauthenticated probes:

```
history:           307 -> http://localhost:3000/signin
history?kind=runs: 307 -> http://localhost:3000/signin
```

Parent workspace layout guard enforces auth, so unauthenticated traffic never reaches the route.

**Signed-in walk (pending Felix):**

1. `/w/<slug>/history` renders the summary strip with non-zero `Shown` and a recent `Latest activity` timestamp on a workspace with Phase 2 activity (paste fixture `4e004c32-...` or upload fixture `8c3b05c8-...`).
2. Timeline shows merged items from at least: tickets, briefs, runs, trace events, packets, artifacts. At least one item per kind for a workspace that has run a full happy path.
3. Filter chips switch the list: `?kind=trace` shows only trace events with non-zero count; `?kind=artifacts` shows the artifact rows; `?kind=runs` shows the 5 `workflow_runs`.
4. Clicking a timeline row with a ticket link navigates to `/w/<slug>/tickets/<uuid>`.
5. `History` nav strip item is highlighted on both `/history` and `/history?kind=…`.
6. Sign out → `/w/<slug>/history` 307s to `/signin`.
7. On a workspace with no activity, the empty card renders with `Paste`/`Upload` links.

## 9. Validation output (exact pass lines)

### `pnpm copy:smoke`
```
copy-smoke: OK (20 checks)
```

### `pnpm model:smoke`
```
model-smoke: OK (13 checks)
```

### `pnpm verify:supabase-project`
```
verify-supabase-project: OK
  NEXT_PUBLIC_SUPABASE_URL = https://xmxozhibakbzsucvtucv.supabase.co
  Banned ref fwexgqktxdfiajpqlgvz not present.
```

### `pnpm typecheck`
Exit 0. No diagnostics.

### `pnpm lint`
Exit 0. No diagnostics.

### `pnpm exec supabase test db`
```
Files=7, Tests=59,  Result: PASS
```

### `pnpm exec supabase db reset`
**Not run.** No migration changed in this ticket; migration set 0001..0005 unchanged from T4. `supabase test db` against the live local DB proves schema integrity.

## 10. Hard-boundary checklist

| Boundary | Status |
|---|---|
| No schema migration | ✔ |
| No model call | ✔ |
| No connector / OAuth | ✔ |
| No retry / failure-inspector actions | ✔ — read-only |
| No billing / usage meter | ✔ |
| No service-role reads | ✔ — `createSupabaseServerClient()` only |
| No raw large packet/artifact bodies in list | ✔ — `body_raw`/`payload`/storage bodies not fetched |
| No broad dashboard redesign | ✔ — single route, no shell changes |
| No new dependency | ✔ |
| RLS / auth posture preserved | ✔ — same layout guard + workspace lookup |
| Append-only invariant respected | ✔ — read-only on `trace_events` |

## 11. Known caveats

1. **Top-50 per source can hide older items.** A workspace with >50 trace events still shows only the 50 most recent before the merge cap. Phase 4 can add `?before=<iso>` pagination if needed.
2. **Counts are pre-cap.** Filter chip counts reflect items in the pre-50-cap merged pool, so they can sum to more than the visible 50. Intentional — it tells the operator a kind exists even when squeezed out.
3. **No payload preview on trace items.** Subtitle uses `from → to · <ticket title>`; full payload still lives on the ticket detail page. Avoids re-fetching `jsonb` blobs into the list view.
4. **Filter is a route query param, not client state.** Each chip click is a server-rendered navigation — consistent with the tickets list pattern. No client-side filtering.
5. **No Playwright.** Still deferred per prior phase tickets.

## 12. Next recommended ticket

**Phase 3 T6 — Settings Polish.** Members page + pending invites view. Phase 3 exit criteria are then: agent catalog (T2), agent detail (T3), contracts viewer (T4), workspace-wide history (T5), and settings/member polish (T6) — all browsable from the WorkspaceNav added in T1.

## 13. Final status

**Phase 3 T5 — PASS (code gates). Live operator acceptance pending Felix walk per §8. All automated gates green: copy-smoke 20/20, model-smoke 13/13, typecheck, lint, verify-supabase-project, pgtap (Files=7, Tests=59, PASS). No schema change; `supabase db reset` not re-run. Route at `/w/[slug]/history` rebuilt as a real RLS-gated timeline across six source tables; kind-filter chips; honest empty state; no service-role bypass; no raw packet/artifact bodies fetched; no new dependency.**
