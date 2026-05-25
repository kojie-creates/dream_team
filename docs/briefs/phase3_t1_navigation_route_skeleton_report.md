# Phase 3 T1 — Navigation + Route Skeleton Report

**Date:** 2026-05-24
**Repo:** C:\Users\felix\Desktop\dream_team
**App root:** C:\Users\felix\Desktop\dream_team\app

---

## 1. Completion status

**PASS (code gates).** Live operator browser walk pending Felix per the same protocol used through Phase 2.

Workspace shell now renders a five-item navigation strip (Home / Tickets / Agents / History / Settings) under the existing header. Active state is computed client-side from `usePathname()` and follows nested routes (`/tickets/[ticketId]` keeps Tickets active; `/settings/members` keeps Settings active). Three missing skeleton routes were added (`agents`, `history`, `settings`) — each is honest about being a Phase 3 placeholder, holds no fake data, runs under the existing workspace layout, and is RLS-gated through `createSupabaseServerClient()` exactly like every other workspace route. No middleware change. No schema change. No model call. No new dependency.

Playwright was **deferred** — adding the framework is bigger than this ticket and would push T1 past route-structure scope. Documented as the next defensive Phase 3 follow-up.

## 2. Files changed

Created:
- `app/src/components/workspace/WorkspaceNav.tsx` — client component (`'use client'`). Slug-aware links + `usePathname()` active state. Five items: Home / Tickets / Agents / History / Settings. Active rule per item is a small predicate so `/tickets/[ticketId]` and `/new/<flow>` keep Tickets active and `/settings/<sub>` keeps Settings active. Renders inside its own bordered strip; horizontally scrollable on small viewports.
- `app/src/app/w/[slug]/agents/page.tsx` — RSC page. Workspace lookup + `notFound()` on miss. Three honest placeholder rows (Orchestrator / Specialists / Review agents) with one-line role descriptions. Closing line: "Placeholder rows only. No agent metadata is loaded from the prompt library yet."
- `app/src/app/w/[slug]/history/page.tsx` — RSC page. Workspace lookup + `notFound()` on miss. Empty-state card pointing back to Tickets. Closing line: "Placeholder page. No history queries are run yet."
- `app/src/app/w/[slug]/settings/page.tsx` — RSC page. Workspace lookup, `redirect('/signin')` on no user (matches the members page pattern), `notFound()` on missing workspace. Grid of two cards: an active link to **Members**, and a disabled **Workspace** card marked "not yet configurable." Closing line: "Billing, connectors, and token budgets are not part of Phase 3 T1."
- `docs/briefs/phase3_t1_navigation_route_skeleton_report.md` — this file.

Modified:
- `app/src/components/workspace/WorkspaceFrame.tsx` — imports `WorkspaceNav`; renders it between the header and the `<main>` so it sits below the switcher/sign-out row across every workspace route. Switcher and sign-out unchanged.
- `app/scripts/copy-smoke.mjs` — adds the four new files (three skeleton pages + `WorkspaceNav.tsx`) to the no-rendered-`stub` set. Now **20** static checks total (was 16 at end of Phase 2).

No migration. No schema change. No new dependency. `package.json` unchanged. Existing Phase 2 actions (`orchestration.ts`, `briefs.ts`), the ticket detail page, the paste/upload flows, and the workspace layout/RLS guards are all untouched.

## 3. Routes added or modified

| Route | Status | Behavior |
|---|---|---|
| `/w/[slug]` | unchanged | Home (existing). Nav `Home` is active when path equals `/w/[slug]`. |
| `/w/[slug]/tickets` | unchanged | Tickets list (existing). |
| `/w/[slug]/tickets/[ticketId]` | unchanged | Ticket detail (existing, Phase 1/2). Nav `Tickets` active. |
| `/w/[slug]/new/paste` | unchanged | Paste flow (Phase 1 T2). Nav `Tickets` active (new-ticket flow is logically the Tickets section). |
| `/w/[slug]/new/upload` | unchanged | Upload flow (Phase 2 T6). Nav `Tickets` active. |
| `/w/[slug]/agents` | **added** | Phase 3 skeleton. Three honest placeholder rows. |
| `/w/[slug]/history` | **added** | Phase 3 skeleton. Empty-state card linking back to Tickets. |
| `/w/[slug]/settings` | **added** | Phase 3 skeleton. Cards for Members (live) + Workspace (disabled). |
| `/w/[slug]/settings/members` | unchanged | Existing members page. Reached via the new Settings landing card. Nav `Settings` active. |

All five top-level destinations now resolve to a real page. Every new page enters through the existing `app/src/app/w/[slug]/layout.tsx` auth + workspace-membership guard before any DB read.

## 4. Navigation behavior

- **Slug-aware.** Every link is built from the layout's `current.slug`; the nav never composes a URL from `pathname`. Switching workspace via the existing switcher rebuilds the nav with the new slug.
- **Active state via `usePathname()`.** Each item carries a `match(path)` predicate. Exact-match for Home; prefix-match for the others, with Tickets also catching `/new/<flow>` so the new-ticket forms feel like part of the Tickets section.
- **Accessible.** Items use `aria-current="page"` when active; the nav itself has `aria-label="Workspace"`. Hover/focus state visible against the dark surface.
- **Mobile.** Single horizontally-scrollable row inside `max-w-5xl`. No hamburger menu — five items fit on a 360-wide viewport with `whitespace-nowrap` plus `overflow-x-auto`.
- **Preserved chrome.** Workspace switcher, "Dream Team" wordmark, and sign-out form are all in the same header row as before. Nav strip is rendered *under* the header, not crammed into it.

## 5. Browser / curl smoke results

`pnpm dev` (Next 16.2.6, webpack on Windows) on `http://localhost:3000`. Unauthenticated curl probes — each must hit the existing `/signin` redirect from the workspace layout's `if (!user) redirect('/signin')`.

```
GET /w/probe                          → 307 → /signin
GET /w/probe/tickets                  → 307 → /signin
GET /w/probe/agents                   → 307 → /signin
GET /w/probe/history                  → 307 → /signin
GET /w/probe/settings                 → 307 → /signin
GET /w/probe/settings/members         → 307 → /signin
```

Behavior depends only on the existing layout guard — no middleware change was needed for the new routes.

**Signed-in browser walk (operator-driven, pending Felix):**

1. Sign in, land on `/w/<slug>`. Nav strip shows five items; **Home** highlighted; "Sign out" still in the top-right header row.
2. Click **Tickets** → `/w/<slug>/tickets`; **Tickets** highlighted; tickets list renders unchanged.
3. Open any ticket → `/w/<slug>/tickets/<uuid>`; **Tickets** stays highlighted (nested-route active rule).
4. Click **Agents** → `/w/<slug>/agents`; **Agents** highlighted; three placeholder rows render; closing line is honest about no catalog data.
5. Click **History** → `/w/<slug>/history`; **History** highlighted; empty-state card with link back to Tickets.
6. Click **Settings** → `/w/<slug>/settings`; **Settings** highlighted; two cards — Members (live), Workspace (disabled). Click **Members** → `/w/<slug>/settings/members`; **Settings** stays highlighted; existing members page renders unchanged.
7. Click sign-out → returns to `/signin`.
8. Open `/w/<other-slug>` directly. Nav rebuilds with new slug; each link points to the new workspace.

## 6. Validation output (exact pass lines)

### `pnpm copy:smoke`
```
  ok  - no rendered "stub" copy in src/app/w/[slug]/tickets/[ticketId]/page.tsx
  ok  - no rendered "stub" copy in src/components/tickets/RunOrchestratorStubButton.tsx
  ok  - no rendered "stub" copy in src/components/tickets/RunSpecialistPassButton.tsx
  ok  - no rendered "stub" copy in src/components/tickets/RunQaTruthReviewButton.tsx
  ok  - no rendered "stub" copy in src/components/tickets/TicketProgressStrip.tsx
  ok  - no rendered "stub" copy in src/components/tickets/TicketAutoRefresh.tsx
  ok  - no rendered "stub" copy in src/components/briefs/UploadBriefForm.tsx
  ok  - no rendered "stub" copy in src/app/w/[slug]/new/upload/page.tsx
  ok  - no rendered "stub" copy in src/app/w/[slug]/agents/page.tsx
  ok  - no rendered "stub" copy in src/app/w/[slug]/history/page.tsx
  ok  - no rendered "stub" copy in src/app/w/[slug]/settings/page.tsx
  ok  - no rendered "stub" copy in src/components/workspace/WorkspaceNav.tsx
  ok  - no unguarded external-attestation claim in src/app/w/[slug]/tickets/[ticketId]/page.tsx
  ok  - no unguarded external-attestation claim in src/components/tickets/RunQaTruthReviewButton.tsx
  ok  - no unguarded streaming-transport claim in src/app/w/[slug]/tickets/[ticketId]/page.tsx
  ok  - no unguarded streaming-transport claim in src/components/tickets/TicketProgressStrip.tsx
  ok  - no unguarded streaming-transport claim in src/components/tickets/TicketAutoRefresh.tsx
  ok  - no unguarded upload-overclaim in src/app/w/[slug]/tickets/[ticketId]/page.tsx
  ok  - no unguarded upload-overclaim in src/app/w/[slug]/new/upload/page.tsx
  ok  - no unguarded upload-overclaim in src/components/briefs/UploadBriefForm.tsx
copy-smoke: OK (20 checks)
```

### `pnpm model:smoke`
```
model-smoke: OK (13 checks)
```

### `pnpm typecheck`
Exit 0. No diagnostics.

### `pnpm lint`
Exit 0. No diagnostics.

### `pnpm verify:supabase-project`
```
verify-supabase-project: OK
  NEXT_PUBLIC_SUPABASE_URL = https://xmxozhibakbzsucvtucv.supabase.co
  Banned ref fwexgqktxdfiajpqlgvz not present.
```

### `pnpm exec supabase test db`
```
Files=7, Tests=59,  Result: PASS
```

### `pnpm exec supabase db reset`
**Not run.** No migration changed in this ticket; the unchanged 0001..0005 set was confirmed clean during the Phase 2 acceptance pass. `supabase test db` ran against the live local DB which is the proof the schema is intact.

## 7. Playwright

**Deferred.** The framework is not installed and a useful first suite would need:

- Adding `@playwright/test`, browsers, and a `playwright.config.ts`.
- Bootstrapping a signed-in fixture against the local dev server.
- Wiring `pnpm test:e2e` and a CI path that does not assume cloud-Supabase access from a fresh checkout.

That bundle is bigger than a route-structure ticket. Recommended next defensive step: a dedicated Phase 3 tooling ticket lands Playwright + one happy-path spec (paste → orchestrator → specialist → QA/truth → done) and one nav spec (each of the five nav links resolves and applies the right active state). T1 deliberately did not start it.

## 8. Hard-boundary checklist

| Boundary | Status |
|---|---|
| No schema migration | ✔ |
| No model call | ✔ |
| No connector / OAuth | ✔ |
| No billing / token budget | ✔ |
| No agent catalog parsing | ✔ — placeholder rows only |
| No contract viewer | ✔ |
| No history data wiring | ✔ — empty-state card only |
| No change to Phase 2 workflow actions | ✔ — `orchestration.ts`, `briefs.ts` untouched |
| RLS / auth posture preserved | ✔ — every new page goes through existing `layout.tsx` guard + RLS reads via session client |
| No new dependency | ✔ |

## 9. Next recommended ticket

**Phase 3 T2 — Agent Catalog.** With the Agents route now resolving to a real (but empty) page, the next ticket can land a read-only catalog: enumerate agent identities from the prompt-library map or static JSON, render role + description + contracts, and link rows to a future detail surface. A small Playwright suite covering the nav contract plus the catalog list view is the cheapest defensive add to run alongside.

## 10. Final status

**Phase 3 T1 — PASS (code gates). Live operator acceptance pending Felix walk-through per §5. All automated gates green: copy-smoke 20/20, model-smoke 13/13, typecheck, lint, verify-supabase-project, pgtap (Files=7, Tests=59, PASS). No schema change; `supabase db reset` not re-run because no migration changed. Playwright deferred to a dedicated tooling ticket.**
